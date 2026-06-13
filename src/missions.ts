/**
 * The "mission" concept: a pairing of two force dispositions (e.g.
 * "Take and Hold" vs "Purge the Foe") that, together with a chosen board
 * variant, determines both the deployment zones and the building layout.
 *
 * The data already lives in the terrain layouts: every ported 40kdc layout
 * carries a `dispositions` pair and a `deployment_pattern_id`. These helpers
 * derive the mission index from a {@link TerrainConfig} at runtime — there is
 * no separate generated preset, so the terrain remains the single source.
 *
 * A disposition pair maps to 1-3 board variants, each with a *different*
 * deployment pattern, so the pair alone does not pin the deployment — the
 * chosen {@link MissionBoard} does. Hand-authored demo layouts carry no
 * `dispositions` and are excluded.
 */
import type { TerrainConfig } from "./terrain-config.js";

/** One board: a terrain layout that carries a dispositions pair. */
export interface MissionBoard {
  /** The terrain layout key, e.g. `"take-and-hold-vs-purge-the-foe-2"`. */
  layoutId: string;
  /** The two dispositions, in the order the layout declares them. */
  dispositions: [string, string];
  /** The 40kdc `deployment_pattern_id`, e.g. `"search-and-destroy"`. */
  deploymentPatternId: string;
}

/** A mission: a disposition pair and the board variants that realise it. */
export interface Mission {
  /** Order-insensitive key for the pair, e.g. `"Purge the Foe|Take and Hold"`. */
  key: string;
  /** The pair, sorted for stable display. */
  dispositions: [string, string];
  /** The board variants for this pair, sorted by layout id. */
  boards: MissionBoard[];
}

/** Order-insensitive key for a disposition pair. */
function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

/**
 * Every layout that carries a dispositions pair (and a deployment pattern),
 * as a {@link MissionBoard}. Layouts without both are skipped.
 */
function missionBoards(terrain: TerrainConfig): MissionBoard[] {
  const boards: MissionBoard[] = [];
  for (const [layoutId, layout] of Object.entries(terrain.layout)) {
    const d = layout.dispositions;
    if (!d || d.length !== 2 || !layout.deployment_pattern_id) {
      continue;
    }
    boards.push({
      layoutId,
      dispositions: [d[0], d[1]],
      deploymentPatternId: layout.deployment_pattern_id,
    });
  }
  return boards.sort((a, b) => a.layoutId.localeCompare(b.layoutId));
}

/** Groups the terrain's mission boards by disposition pair, sorted by key. */
export function buildMissionIndex(terrain: TerrainConfig): Mission[] {
  const byKey = new Map<string, Mission>();
  for (const board of missionBoards(terrain)) {
    const key = pairKey(board.dispositions[0], board.dispositions[1]);
    let mission = byKey.get(key);
    if (!mission) {
      const sorted = [...board.dispositions].sort();
      mission = { key, dispositions: [sorted[0], sorted[1]], boards: [] };
      byKey.set(key, mission);
    }
    mission.boards.push(board);
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** The distinct dispositions across all mission boards, sorted. */
export function listDispositions(terrain: TerrainConfig): string[] {
  const set = new Set<string>();
  for (const board of missionBoards(terrain)) {
    set.add(board.dispositions[0]);
    set.add(board.dispositions[1]);
  }
  return [...set].sort();
}

/** Boards matching a disposition pair, order-insensitive, sorted by layout id. */
export function findBoards(
  terrain: TerrainConfig,
  a: string,
  b: string,
): MissionBoard[] {
  const key = pairKey(a, b);
  return missionBoards(terrain).filter(
    (board) => pairKey(board.dispositions[0], board.dispositions[1]) === key,
  );
}

/**
 * Maps a 40kdc `deployment_pattern_id` (hyphenated, e.g. `"search-and-destroy"`)
 * to a deployment preset id / YAML filename stem (`"search_and_destroy"`).
 */
export function deploymentIdForPattern(patternId: string): string {
  return patternId.replace(/-/g, "_");
}
