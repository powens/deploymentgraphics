# deploymentgraphics

Render Warhammer 40k mission deployment maps as SVG, driven entirely by
typed config. Ships the renderer plus ready-to-use presets for the six
standard missions and a built-in terrain set.

![Search and Destroy deployment map with terrain, rendered by deploymentgraphics](assets/sample.svg)

## Install

```sh
npm install deploymentgraphics
```

This package is **ESM-only** — import it with `import`. It cannot be loaded
with `require()` from a CommonJS module.

## Usage

`makeMissionCard(config)` returns an `<svg>` element. The quickest path is
to combine a mission preset with `buildConfig`:

```ts
import { makeMissionCard } from "deploymentgraphics";
import { buildConfig, missions } from "deploymentgraphics/presets";

const svg = makeMissionCard(buildConfig({ mission: missions.dawn_of_war }));
document.body.appendChild(svg);
```

Add terrain, or toggle the grid and territory line, via `buildConfig`
overrides. `terrain` defaults to empty, so pass `gwTerrain` to draw the
bundled battlemaster layouts:

```ts
import { gwTerrain } from "deploymentgraphics/presets";

const svg = makeMissionCard(
  buildConfig({
    mission: missions.search_and_destroy,
    terrain: gwTerrain,
    layout: "bm-take-vs-take-03", // a battlemaster layout; search_and_destroy
    grid: true,
    territory: false,
  }),
);
```

`gwTerrain` is ~220kB of layout geometry, and it is a static import: a
bundle that names it ships all 45 layouts. Import it only where a board is
actually drawn — ideally behind a dynamic `import()` — and use
`gwTerrainIndex` for everything else (see
[Resolving a matchup](#resolving-a-matchup)).

The presets are also exported from the package root, so a single import
works too:

```ts
import { makeMissionCard, buildConfig, missions } from "deploymentgraphics";
```

The root exports the two renderers, the presets, and the types of the
config they consume — `makeMissionCard`, `renderMissionCardToString`,
`buildConfig`, `missions` (and each mission by name), `gwTerrain`,
`gwTerrainIndex`, `gwTemplatesReal`, `baseConfig`, `baseTheme`, the
matchup-resolution API, and the `FullConfig` type graph. The geometry,
placement and SVG-backend primitives the renderers are built from are
implementation and are not published.

### Resolving a matchup

To render the board two force dispositions actually play, resolve the
pairing to a mission and a layout id first. Resolution reads only metadata,
so it needs `gwTerrainIndex` rather than the full corpus:

```ts
import { resolveMission, resolveTerrainLayout } from "deploymentgraphics";
import { eventMatrix, gwTerrainIndex, missions } from "deploymentgraphics/presets";

const deployment = resolveMission(eventMatrix, "Purge the Foe", "Reconnaissance", "A");
const layout = resolveTerrainLayout(gwTerrainIndex, "Purge the Foe", "Reconnaissance", deployment);
// -> resolveTerrainLayout returns undefined for the matrix cells 40kdc
//    does not cover; those render as bare deployment zones.
```

Keeping `gwTerrain` out of that path is what makes it cheap — the two calls
above cost ~3kB gzipped, against ~38kB if they read `gwTerrain.layout`.
Load the geometry only where you draw:

```ts
const { gwTerrain } = await import("deploymentgraphics/presets");
const svg = makeMissionCard(
  buildConfig({ mission: missions[deployment], terrain: gwTerrain, layout }),
);
```

### Server-side rendering

`makeMissionCard` creates SVG nodes with `document.createElementNS`, so it
needs a DOM. In Node, use `renderMissionCardToString` instead — it renders
the same card to markup with no DOM and no dependencies:

```ts
import { renderMissionCardToString, buildConfig, missions } from "deploymentgraphics";

const svg = renderMissionCardToString(
  buildConfig({ mission: missions.tipping_point }),
);
console.log(svg);
```

The markup carries an `xmlns`, so it works inline in an HTML response as
well as on its own in a `.svg` file.

The card is sized by its `viewBox` alone, which leaves a standalone file or
an `<img>` to pick a size. Pass `width`/`height` to fix one — the board is
measured in inches, so this renders a 60×44 board at 15px per inch:

```ts
import { baseTheme } from "deploymentgraphics";

const svg = renderMissionCardToString(
  buildConfig({ mission: missions.tipping_point }),
  baseTheme,
  { width: 60 * 15, height: 44 * 15 },
);
```

## Presets

`deploymentgraphics/presets` exports plain, typed config objects — no
YAML parsing or file IO at runtime:

- `missions` — the six standard missions, keyed by id (`dawn_of_war`,
  `crucible_of_battle`, `hammer_and_anvil`, `search_and_destroy`,
  `sweeping_engagement`, `tipping_point`). Each is also exported by name
  (`dawnOfWar`, …).
- `gwTerrain` — building templates and the 45 battlemaster mission layouts
  ported from 40kdc, keyed by layout id (`bm-take-vs-take-01`, …). ~220kB.
- `gwTerrainIndex` — the same 45 layouts' matchup metadata with the geometry
  left out (~5kB): everything `resolveTerrainLayout` reads, and nothing else.
- `baseConfig` — default board size (60×44 inches) and styling.
- `buildConfig(options)` — merges a mission, terrain, and base into the
  `FullConfig` that `makeMissionCard` consumes. `terrain` defaults to empty
  (nothing drawn), so it never pulls `gwTerrain` into a bundle on its own.

Build a config by hand instead of using `buildConfig` for full control —
see the `FullConfig` type, which is exported from the package root.

## License

MIT
