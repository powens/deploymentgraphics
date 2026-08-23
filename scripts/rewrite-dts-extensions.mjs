// Rewrites `./foo.ts` specifiers to `./foo.js` in the emitted declaration files.
//
// `rewriteRelativeImportExtensions` (see tsconfig.json) fixes the `.js` output
// but not the `.d.ts` output, so a module that spells its imports with a `.ts`
// extension — the ones the plain-node converters load — ships declarations
// pointing at files that do not exist in `lib/`. tsc itself resolves them
// anyway by falling back to the sibling `.d.ts`, which is why this went
// unnoticed; other declaration consumers (dts bundlers, api-extractor,
// publint/attw) see a dangling path.
//
// Run after `tsc -p tsconfig.build.json`. Idempotent, and fails loudly if any
// `.ts` specifier survives.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const libDir = fileURLToPath(new URL("../lib/", import.meta.url));

/** Every `.d.ts` under `dir`, recursively. */
function declarations(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return declarations(path);
    return entry.name.endsWith(".d.ts") ? [path] : [];
  });
}

// A relative specifier in a `from "…"` clause or a dynamic `import("…")`.
const SPECIFIER = /((?:from|import)\s*\(?\s*)(["'])(\.[^"']*)\.ts\2/g;

let rewritten = 0;
for (const path of declarations(libDir)) {
  const source = readFileSync(path, "utf8");
  const fixed = source.replace(SPECIFIER, (_m, lead, quote, base) =>
    `${lead}${quote}${base}.js${quote}`,
  );
  if (fixed === source) continue;
  writeFileSync(path, fixed);
  rewritten++;
}

const dangling = declarations(libDir).filter((path) =>
  SPECIFIER.test(readFileSync(path, "utf8")),
);
if (dangling.length > 0) {
  console.error(`.ts specifiers survived in:\n  ${dangling.join("\n  ")}`);
  process.exit(1);
}

console.log(`Declaration extensions rewritten in ${rewritten} file(s).`);
