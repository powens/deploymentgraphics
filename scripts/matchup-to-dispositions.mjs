// Converts a 40kdc `mission_matchup_id` such as
// `take-and-hold-vs-purge-the-foe` into the two disposition names it encodes:
// `["Take and Hold", "Purge the Foe"]`. The id is split on the `-vs-` joiner,
// then each half's hyphens become spaces and its words are Title Cased — minor
// words (and, the, of …) stay lowercase unless they lead the name. Returns
// `undefined` when the id is absent (some layouts carry no matchup).

// Words that stay lowercase inside a disposition name unless they are the
// first word (standard title-case convention).
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
