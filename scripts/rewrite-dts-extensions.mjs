// Rewrites `./foo.ts` specifiers to `./foo.js` in the emitted declaration files.
//
// `rewriteRelativeImportExtensions` (see tsconfig.json) fixes the `.js` output
// but not `.d.ts`. tsc tolerates the dangling `.ts` paths by falling back to
// the sibling `.d.ts`; dts bundlers, api-extractor and publint/attw do not.
//
// Run after `tsc -p tsconfig.build.json`. Idempotent; fails if any `.ts`
// specifier survives.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const libDir = fileURLToPath(new URL("../lib/", import.meta.url));

function declarations(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return declarations(path);
    return entry.name.endsWith(".d.ts") ? [path] : [];
  });
}

// A relative specifier in a `from "…"` clause or a dynamic `import("…")`.
const SPECIFIER = /((?:from|import)\s*\(?\s*)(["'])(\.[^"']*)\.ts\2/g;

// Broader than SPECIFIER on purpose: re-testing with the rewrite's own regex
// would miss a clause shape the rewrite does not know. Not global, so no
// `lastIndex` carries between files.
const ANY_TS_SPECIFIER = /(["'])\.[^"']*\.ts\1/;

let rewritten = 0;
const dangling = [];
for (const path of declarations(libDir)) {
  const source = readFileSync(path, "utf8");
  const fixed = source.replace(SPECIFIER, (_m, lead, quote, base) =>
    `${lead}${quote}${base}.js${quote}`,
  );
  if (fixed !== source) {
    writeFileSync(path, fixed);
    rewritten++;
  }
  if (ANY_TS_SPECIFIER.test(fixed)) dangling.push(path);
}

if (dangling.length > 0) {
  console.error(`.ts specifiers survived in:\n  ${dangling.join("\n  ")}`);
  process.exit(1);
}

console.log(`Declaration extensions rewritten in ${rewritten} file(s).`);
