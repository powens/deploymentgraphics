// Converts a 40kdc `mission_matchup_id` such as
// `take-and-hold-vs-purge-the-foe` into the two disposition names it encodes:
// `["Take and Hold", "Purge the Foe"]`. Returns `undefined` when the id is
// absent.

const MINOR_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for",
  "in", "of", "on", "or", "the", "to", "vs",
]);

const titleCase = (slug) =>
  slug
    .split("-")
    .map((word, i) =>
      i > 0 && MINOR_WORDS.has(word)
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");

export function matchupToDispositions(matchupId) {
  if (!matchupId) return undefined;
  return matchupId.split("-vs-").map(titleCase);
}
