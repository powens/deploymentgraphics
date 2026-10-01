/**
 * The event-companion matrix: which deployment two force dispositions play
 * under a given layout. Source: `static/data/event_companion_matrix.yml`,
 * bundled as the `eventMatrix` preset.
 */

import type { MissionId } from "./presets/missions.js";

/** A layout variant within a disposition pairing. */
export type Layout = "A" | "B" | "C";

/**
 * One disposition pairing: per-disposition mission and per-layout deployment.
 * `D` is the deployment id type (see {@link EventMatrix}).
 */
interface EventMatrixEntry<D extends string> {
  /** Each disposition's primary mission for this pairing. */
  missions: Record<string, string>;
  /** The deployment (a mission/deployment id) used by each layout. */
  layouts: Record<Layout, { deployment: D; page: number }>;
}

/**
 * All disposition pairings, keyed by {@link eventMatrixKey}. `D` types the
 * deployment ids its cells name: {@link MissionId} by default, so the bundled
 * `eventMatrix` only compiles while every cell names a key of `missions`. A
 * matrix over your own deployments can widen it (`EventMatrix<string>`).
 */
export type EventMatrix<D extends string = MissionId> = Record<
  string,
  EventMatrixEntry<D>
>;

/** The order-independent lookup key for a disposition pairing. */
export function eventMatrixKey(a: string, b: string): string {
  return [a, b].sort().join(" | ");
}

/**
 * Resolves the deployment (mission id) for a disposition pairing and layout.
 * Typed as the matrix's deployment ids: with the bundled `eventMatrix` that is
 * a {@link MissionId}, so the result indexes `missions` directly. Throws if
 * the pairing or layout is not in the matrix, listing the valid dispositions
 * or layouts.
 */
export function resolveMission<D extends string>(
  matrix: EventMatrix<D>,
  a: string,
  b: string,
  layout: Layout,
): D {
  const key = eventMatrixKey(a, b);
  if (!Object.hasOwn(matrix, key)) {
    const known = dispositions(matrix);
    const unknown = [a, b].find((d) => !known.includes(d));
    if (unknown !== undefined) {
      throw new Error(
        `unknown disposition ${JSON.stringify(unknown)}: expected one of ` +
          known.map((d) => JSON.stringify(d)).join(", "),
      );
    }
    throw new Error(`No event-matrix entry for "${a}" / "${b}"`);
  }
  const { layouts } = matrix[key];
  if (!Object.hasOwn(layouts, layout)) {
    throw new Error(
      `No layout "${layout}" for "${a}" / "${b}": expected one of ` +
        Object.keys(layouts).join(", "),
    );
  }
  return layouts[layout].deployment;
}

/**
 * Every force disposition `matrix` pairs, sorted and deduplicated — the valid
 * `a`/`b` arguments to {@link resolveMission}, e.g. for a picker's options.
 */
export function dispositions(matrix: EventMatrix<string>): string[] {
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
 * Finds the terrain layout whose disposition pair and deployment match, or
 * `undefined` (the 40kdc source does not cover every matrix cell).
 * `deployment` may use `-` or `_`: the matrix uses `_`, the layouts `-`.
 * Typed as `layouts`' keys, so `gwTerrainIndex` yields a `LayoutId`.
 */
export function resolveTerrainLayout<K extends string>(
  layouts: Record<K, TerrainLayoutMeta>,
  a: string,
  b: string,
  deployment: string,
): K | undefined {
  const wantPair = eventMatrixKey(a, b);
  const wantDeployment = deployment.replace(/-/g, "_");
  // Safe cast: `Object.entries` widens own keys of a `Record<K, …>` to string.
  for (const [id, meta] of Object.entries(layouts) as [K, TerrainLayoutMeta][]) {
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
