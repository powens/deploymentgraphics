# deploymentgraphics

Render Warhammer 40k mission deployment maps as SVG, driven entirely by
typed config. Ships the renderer plus ready-to-use presets for the six
standard missions and a built-in terrain set.

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

Add terrain, a grid, or hidden supplies via `buildConfig` overrides:

```ts
const svg = makeMissionCard(
  buildConfig({
    mission: missions.search_and_destroy,
    layout: "1", // draw terrain layout 1
    grid: true,
    hiddenSupplies: true,
  }),
);
```

Everything is also exported from the package root, so a single import
works too:

```ts
import { makeMissionCard, buildConfig, missions } from "deploymentgraphics";
```

### Server-side rendering

Rendering creates SVG nodes with `document.createElementNS`, so a DOM
must be present. In the browser that is automatic. In Node, provide one
with [happy-dom](https://github.com/capricorn86/happy-dom) or jsdom:

```ts
import { Window } from "happy-dom";
import { makeMissionCard, buildConfig, missions } from "deploymentgraphics";

const window = new Window();
globalThis.document = window.document;

const svg = makeMissionCard(buildConfig({ mission: missions.tipping_point }));
console.log(svg.outerHTML);
```

## Presets

`deploymentgraphics/presets` exports plain, typed config objects — no
YAML parsing or file IO at runtime:

- `missions` — the six standard missions, keyed by id (`dawn_of_war`,
  `crucible_of_battle`, `hammer_and_anvil`, `search_and_destroy`,
  `sweeping_engagement`, `tipping_point`). Each is also exported by name
  (`dawnOfWar`, …).
- `gwTerrain` — building templates and two numbered layouts.
- `baseConfig` — default board size (60×44 inches) and styling.
- `buildConfig(options)` — merges a mission, terrain, and base into the
  `FullConfig` that `makeMissionCard` consumes.

Build a config by hand instead of using `buildConfig` for full control —
see the `FullConfig` type, which is exported from the package root.

## License

MIT
