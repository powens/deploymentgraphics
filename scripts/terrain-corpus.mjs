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
// three members added, so `layout.id` / `.pieces` / `.mission_matchup_id` and
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

/**
 * Attach the corpus lookups to a layout. Works on a raw upstream layout as
 * well as a normalized one - `battlemaster-registration.test.mjs` resolves
 * pieces under both frames to compare them.
 *
 * The three lookups are non-enumerable, so `{ ...layout, pieces: filtered }`
 * yields a bare layout rather than one whose `parentOf` still closes over the
 * *original* piece list. Deriving a layout that way then hands it to a
 * converter fails loudly instead of resolving children against the wrong
 * parents; call `withLookups` again on the result.
 *
 * @param {object} layout - a 40kdc layout ({ id, pieces }).
 * @param {(id: string) => object | undefined} footprintOf
 * @returns {object} the layout plus `footprintOf`, `parentOf` and `resolve`.
 */
export function withLookups(layout, footprintOf) {
  const byId = new Map(layout.pieces.map((p) => [p.id, p]));
  const parentOf = (id) => byId.get(id);
  return Object.defineProperties(
    { ...layout },
    {
      footprintOf: { value: footprintOf },
      parentOf: { value: parentOf },
      /** Absolute board polygon for one of this layout's pieces. */
      resolve: { value: (piece) => resolvePiece(piece, footprintOf, parentOf) },
    },
  );
}

/**
 * Load the vendored 40kdc corpus, normalized and ready to resolve.
 *
 * `layouts` is normalized on first read and memoized; `missionLayouts` is
 * normalized eagerly and never touches the fan layouts (see below).
 *
 * @returns {{
 *   layouts: object[],
 *   missionLayouts: object[],
 *   rawLayouts: object[],
 *   layout: (id: string) => object | undefined,
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

  // The mission set is normalized directly rather than by filtering an
  // already-normalized `layouts`. Fan-format layouts carry no
  // mission_matchup_id and bring their own templates, and normalizeLayout
  // throws on an unmapped part - so normalizing the whole corpus just to reach
  // the mission layouts would abort the conversion on the very layouts the
  // converter's skip exists to pass over. `layouts` stays lazy for the same
  // reason: only a caller that genuinely wants every layout pays that cost.
  const missionLayouts = rawLayoutData
    .filter((l) => l.mission_matchup_id)
    .map(normalize);

  let allLayouts;
  const layoutsOf = () => (allLayouts ??= rawLayoutData.map(normalize));
  let byId;
  const byIdOf = () => (byId ??= new Map(layoutsOf().map((l) => [l.id, l])));

  // Building templates, read only to size `area` placements. Not part of the
  // 40kdc source - these are the hand-authored gw templates the placements
  // reference by name.
  const gwTemplates =
    yaml.load(readFileSync(templatesPath, "utf8")).templates ?? {};

  return {
    get layouts() {
      return layoutsOf();
    },
    // Layouts outside GW's mission system carry no mission_matchup_id; see the
    // skip note in scripts/convert-40kdc-terrain.mjs.
    missionLayouts,
    rawLayouts,
    layout: (id) => byIdOf().get(id),
    templatesById,
    gwTemplates,
    footprintOf,
  };
}
