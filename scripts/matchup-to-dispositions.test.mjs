import { describe, it, expect } from "vitest";
import { matchupToDispositions } from "./matchup-to-dispositions.mjs";

describe("matchupToDispositions", () => {
  it("splits on -vs- and Title Cases each half", () => {
    expect(matchupToDispositions("take-and-hold-vs-purge-the-foe")).toEqual([
      "Take and Hold",
      "Purge the Foe",
    ]);
  });

  it("keeps minor words (and/the) lowercase but capitalizes leading words", () => {
    expect(matchupToDispositions("take-and-hold-vs-take-and-hold")).toEqual([
      "Take and Hold",
      "Take and Hold",
    ]);
  });

  it("handles single-word halves", () => {
    expect(
      matchupToDispositions("take-and-hold-vs-reconnaissance"),
    ).toEqual(["Take and Hold", "Reconnaissance"]);
    expect(matchupToDispositions("take-and-hold-vs-disruption")).toEqual([
      "Take and Hold",
      "Disruption",
    ]);
  });

  it("Title Cases multi-word halves with no minor words", () => {
    expect(
      matchupToDispositions("take-and-hold-vs-priority-assets"),
    ).toEqual(["Take and Hold", "Priority Assets"]);
  });

  it("returns undefined when the matchup id is absent", () => {
    expect(matchupToDispositions(undefined)).toBeUndefined();
    expect(matchupToDispositions("")).toBeUndefined();
  });
});
