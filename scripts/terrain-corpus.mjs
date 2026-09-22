// Loads and normalizes the vendored 40kdc corpus. Each layout returned is the
// upstream layout object plus the lookups added by `withLookups`.

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

// `pieces` -> id index, memoized per array and never invalidated: treat piece
// lists as immutable (derive with `withPieces`).
const indexes = new WeakMap();
const indexOf = (pieces) => {
  let byId = indexes.get(pieces);
  if (!byId) indexes.set(pieces, (byId = new Map(pieces.map((p) => [p.id, p]))));
  return byId;
};

/**
 * Attach the corpus lookups to a layout (raw or normalized).
 *
 * `parentOf` and `resolve` are methods reading `this.pieces`, so a spread
 * `{ ...layout, pieces }` resolves against its own pieces; they need their
 * receiver (`layout.resolve(piece)`, not a detached reference). Do not mutate a
 * piece list in place: the id index is memoized per array.
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
    parentOf(id) {
      return indexOf(this.pieces).get(id);
    },
    /** Absolute board polygon for one of this layout's pieces. */
    resolve(piece) {
      return resolvePiece(piece, this.footprintOf, (id) => this.parentOf(id));
    },
    /** This layout with a different piece list; lookups answer against it. */
    withPieces(pieces) {
      return { ...this, pieces };
    },
  };
}

/**
 * Load the vendored 40kdc corpus. Only mission layouts are normalized;
 * `rawLayouts` is everything, un-normalized. `templatesById` and `footprintOf`
 * are exposed for the registration suite.
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

  // Rewrites upstream composite templates into the piece vocabulary the
  // converters consume (see battlemaster-normalize.mjs).
  const normalize = (l) =>
    withLookups(normalizeLayout(l, templatesById), footprintOf);
  const rawLayouts = rawLayoutData.map((l) => withLookups(l, footprintOf));

  // Fan-format layouts (no mission_matchup_id) would make normalizeLayout throw
  // on their unmapped parts.
  const missionLayouts = rawLayoutData
    .filter((l) => l.mission_matchup_id)
    .map(normalize);

  // The hand-authored gw building templates, read to size placements.
  const gwTemplates =
    yaml.load(readFileSync(templatesPath, "utf8")).templates ?? {};

  return {
    missionLayouts,
    rawLayouts,
    templatesById,
    gwTemplates,
    footprintOf,
  };
}
