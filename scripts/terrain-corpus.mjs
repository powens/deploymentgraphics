// The one place that loads, normalizes and resolves the vendored 40kdc corpus.
//
// Before this module every converter and test rebuilt the same bootstrap by
// hand - read the two JSON files, index templates by id, run normalizeLayout,
// index footprints by id, and build a per-layout id->piece map - and then
// threaded `lookupFootprint` and `getParent` through every call. All of that
// lives here now: `loadCorpus()` returns the layouts already carrying the
// lookups they need, so a converter takes one argument.
//
// A layout handed back by this module is the normalized layout object with
// four members added, so `layout.id` / `.pieces` / `.mission_matchup_id` and
// the rest of the upstream shape read exactly as before.

import { readFileSync } from "node:fs";
import * as yaml from "js-yaml";
import { normalizeLayout } from "./battlemaster-normalize.mjs";
import { resolvePiece } from "./terrain-resolver.mjs";

const srcDir = new URL("../static/data/terrain/source/40kdc/", import.meta.url);
const templatesPath = new URL(
  "../static/data/terrain/templates-simple.yml",
  import.meta.url,
);

const readJson = (name) =>
  JSON.parse(readFileSync(new URL(name, srcDir), "utf8"));

/** `pieces` -> its id index, built once per array. */
const indexes = new WeakMap();
const indexOf = (pieces) => {
  let byId = indexes.get(pieces);
  if (!byId) indexes.set(pieces, (byId = new Map(pieces.map((p) => [p.id, p]))));
  return byId;
};

/**
 * Attach the corpus lookups to a layout. Works on a raw upstream layout as
 * well as a normalized one - `battlemaster-registration.test.mjs` resolves
 * pieces under both frames to compare them.
 *
 * `parentOf` and `resolve` are **methods**: they read the piece list off
 * `this` on each call rather than closing over the one they were built from.
 * That is what makes a derived layout correct by construction - `withPieces`
 * below, and even a plain `{ ...layout, pieces }`, resolve against *their* own
 * pieces. The lookups used to be non-enumerable closures, so a spread produced
 * a layout that could not resolve at all; every consumer then had to remember
 * to re-wrap, and the one that did not remember got a runtime guard.
 *
 * The flip side of a method is that it needs its receiver: call
 * `layout.resolve(piece)`, not `const r = layout.resolve; r(piece)`.
 *
 * @param {object} layout - a 40kdc layout ({ id, pieces }).
 * @param {(id: string) => object | undefined} footprintOf
 * @returns {object} the layout plus `footprintOf`, `parentOf`, `resolve` and
 *   `withPieces`.
 */
export function withLookups(layout, footprintOf) {
  return {
    ...layout,
    footprintOf,
    /** One of this layout's own pieces, by id. */
    parentOf(id) {
      return indexOf(this.pieces).get(id);
    },
    /** Absolute board polygon for one of this layout's pieces. */
    resolve(piece) {
      return resolvePiece(piece, this.footprintOf, (id) => this.parentOf(id));
    },
    /**
     * This layout with a different piece list - the supported way to narrow or
     * rewrite one. The result carries the lookups, and they answer against the
     * new list.
     */
    withPieces(pieces) {
      return { ...this, pieces };
    },
  };
}

/**
 * Load the vendored 40kdc corpus, normalized and ready to resolve.
 *
 * Only the mission layouts are normalized; the fan layouts are never touched
 * (see below).
 *
 * `templatesById` and `footprintOf` are the vendored template table and its
 * footprint lookup. Production reads them only through the layouts, which
 * already carry the lookup; they are on the return because this is the one
 * place that loads the corpus, and the registration suite checks the port
 * against upstream's own templates.
 *
 * @returns {{
 *   missionLayouts: object[],
 *   rawLayouts: object[],
 *   templatesById: Map<string, object>,
 *   gwTemplates: object,
 *   footprintOf: (id: string) => object | undefined,
 * }}
 */
export function loadCorpus() {
  const rawLayoutData = readJson("terrain-layouts.json");
  const templates = readJson("terrain-templates.json");

  const templatesById = new Map(templates.map((t) => [t.id, t]));
  const footprintById = new Map(templates.map((t) => [t.id, t.footprint]));
  const footprintOf = (id) => footprintById.get(id);

  // Upstream's battlemaster-11e re-source moved the ruins, pipes and generators
  // out of the layout and onto composite *templates*. Rewrite them back into
  // the legacy piece vocabulary every converter downstream consumes - see
  // scripts/battlemaster-normalize.mjs.
  const normalize = (l) =>
    withLookups(normalizeLayout(l, templatesById), footprintOf);
  const rawLayouts = rawLayoutData.map((l) => withLookups(l, footprintOf));

  // Only the mission set is normalized. Fan-format layouts carry no
  // mission_matchup_id and bring their own templates, and normalizeLayout
  // throws on an unmapped part - so normalizing the whole corpus would abort
  // the conversion on the very layouts the converter's skip exists to pass
  // over.
  const missionLayouts = rawLayoutData
    .filter((l) => l.mission_matchup_id)
    .map(normalize);

  // Building templates, read only to size `area` placements. Not part of the
  // 40kdc source - these are the hand-authored gw templates the placements
  // reference by name.
  const gwTemplates =
    yaml.load(readFileSync(templatesPath, "utf8")).templates ?? {};

  return {
    // Layouts outside GW's mission system carry no mission_matchup_id; see the
    // skip note in scripts/convert-40kdc-terrain.mjs.
    missionLayouts,
    rawLayouts,
    templatesById,
    gwTemplates,
    footprintOf,
  };
}
