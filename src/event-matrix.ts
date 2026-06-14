/**
 * The event-companion matrix: which deployment two force dispositions play
 * under a given layout. Parsed from the event companion pack into
 * `static/data/event_companion_matrix.yml` and bundled as the `eventMatrix`
 * preset (see `scripts/gen-presets.mjs`).
 *
 * The matrix is keyed by the two dispositions as an *unordered* pair, so a
 * matchup resolves the same regardless of which side holds which disposition.
 */

/** A layout variant within a disposition pairing. */
export type Layout = "A" | "B" | "C";

/** One disposition pairing: per-disposition mission and per-layout deployment. */
export interface EventMatrixEntry {
  /** Each disposition's primary mission for this pairing. */
  missions: Record<string, string>;
  /** The deployment (a mission/deployment id) used by each layout. */
  layouts: Record<Layout, { deployment: string; page: number }>;
}

/** All disposition pairings, keyed by {@link eventMatrixKey}. */
export type EventMatrix = Record<string, EventMatrixEntry>;

/**
 * The lookup key for a disposition pairing: the two dispositions sorted and
 * joined with `" | "`. Order-independent, so `(a, b)` and `(b, a)` match.
 */
export function eventMatrixKey(a: string, b: string): string {
  return [a, b].sort().join(" | ");
}

/**
 * Resolves the deployment (mission id) for a disposition pairing and layout.
 * Throws if the pairing or layout is not in the matrix.
 */
export function resolveMission(
  matrix: EventMatrix,
  a: string,
  b: string,
  layout: Layout,
): string {
  const entry = matrix[eventMatrixKey(a, b)];
  if (!entry) {
    throw new Error(`No event-matrix entry for "${a}" / "${b}"`);
  }
  const cell = entry.layouts[layout];
  if (!cell) {
    throw new Error(`No layout "${layout}" for "${a}" / "${b}"`);
  }
  return cell.deployment;
}

/** The sorted, unique force dispositions present in the matrix. */
export function dispositions(matrix: EventMatrix): string[] {
  const set = new Set<string>();
  for (const key of Object.keys(matrix)) {
    for (const disposition of key.split(" | ")) {
      set.add(disposition);
    }
  }
  return [...set].sort();
}

/** A terrain layout's matchup metadata (ported from the 40kdc source). */
export interface TerrainLayoutMeta {
  dispositions?: string[];
  deployment_pattern_id?: string;
}

/**
 * Finds the terrain layout whose disposition pair *and* deployment match this
 * pairing, joining on the metadata each ported 40kdc layout already carries.
 * Returns the layout id, or `undefined` when no layout matches (the 40kdc
 * source does not cover every matrix cell).
 *
 * `deployment` may use either `-` or `_`: the matrix uses `_`
 * (`sweeping_engagement`) while the layouts use `-` (`sweeping-engagement`).
 */
export function resolveTerrainLayout(
  layouts: Record<string, TerrainLayoutMeta>,
  a: string,
  b: string,
  deployment: string,
): string | undefined {
  const wantPair = eventMatrixKey(a, b);
  const wantDeployment = deployment.replace(/-/g, "_");
  for (const [id, meta] of Object.entries(layouts)) {
    if (!meta.dispositions || !meta.deployment_pattern_id) {
      continue;
    }
    const pair = [...meta.dispositions].sort().join(" | ");
    const dep = meta.deployment_pattern_id.replace(/-/g, "_");
    if (pair === wantPair && dep === wantDeployment) {
      return id;
    }
  }
  return undefined;
}
