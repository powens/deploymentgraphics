# Context — domain glossary

Domain terms for the deployment-map generator. Architecture vocabulary (module,
interface, seam, depth, adapter) lives in the architecture-review tooling, not here.

## Terms

**Placement** — an instruction for putting one piece on the board, in the form a
human authors it in YAML. Two authoring shapes exist:
- *corner-pin* (buildings): pin one or two named template corners (TL/TR/BL/BR) to
  inward distances from a canvas corner; rotation is *derived* from two corners.
- *box* (features): a top-left `{x, y}`, a `{width, height}` box, and a
  `rotation` taken about the box centre.

**Placed** — the *canonical resolved form* of a placement, ready to render: a
template/feature name, a box `{x, y, width, height}` (top-left of the unrotated
box), and a `rotation` about the box centre. Every authoring shape resolves into a
`Placed`; every renderer draws a `Placed` with the same `translate(x y) rotate(rot
cx cy)`. The single representation behind the placement module's seam.

**Resolve** — map an authoring placement to one or more `Placed` (corner-pin → box
for buildings; identity for already-box features). The forward direction.

**Centre-pivot** — the `Placed` convention, and the only pivot convention in the
codebase: rotation is taken about the box centre. Every renderer draws this way
via `placedTransform` (the single owner of the `translate(x y) rotate(rot cx cy)`
string); features are authored this way too. The corner-pin math lands a template
origin first, but that intermediate never leaves `resolvePrimary`.

The placement module owns three views of that one convention, so nothing else
has to spell it: `placedTransform` hands it to the SVG renderer, `placedRing`
applies it in JavaScript (which is how a fit gets checked), and `placedFromPin`
inverts it — "put this template-local point *there*, at this rotation" — which
is the last step of the 40kdc converter fits that build a `Placed` at all
(the rest emit corner-pin authoring placements). The `.mjs` converters cross this
seam directly; see the `.ts` specifier note in `tsconfig.json` for why they can.

**Mirror** — point-reflect a `Placed` through the canvas centre (`rotation += 180`).
A piece emits a mirrored copy unless its placement says `mirror: false`; the default
is *mirror on*. One formula, owned by the placement module.

**Canvas** — the board, `{width, height}` in inches (standard 60×44). Anchors
(TL/TR/BL/BR) and mirroring are all measured against it.

**Layout-resolution** — `resolveLayout(config)` assembling the pieces a render
pass draws into a `ResolvedLayout` (buildings, icons, features). Buildings and
icons come from the selected layout alone (empty arrays when none is selected);
features are unioned with the board's top-level array. Distinct from
**Resolve** above: that maps one placement to a `Placed`; this assembles
placement *arrays* and applies the "is a layout selected / union with
top-level" rules in one place.

**Controls** — the authoring form the *viewer* presents: the nine fields a
visitor picks in the browser (two dispositions, layout, deployment, terrain
layout, template set, rotation, and the grid/territory toggles). The browser
counterpart of a **Placement**'s YAML — one authoring form, **resolved** into a
`FullConfig` by `buildConfig`. `src/viewer-controls.ts` holds the single
spelling of the set: one row per control (key, element id, kind, default,
allowed values), with the URL form, the stored form, the DOM form and the
coercion of untrusted input all *derived* from those rows rather than restated.
Adding a control is one row.

The URL carries only controls that differ from their default — which is why
`grid=1` and `territory=0` are one rule, not two special cases. Three of the
nine reach the renderer through `buildConfig` (`grid`, `territory`, and `t` as
its `layout`); `m` and `tpl` name which YAML the viewer fetches; `da`, `db` and
`lay` name nothing directly — they derive `m` and `t` through the event matrix;
and `rot` post-processes the rendered card. Viewer-only: the controls reach the
demo through `bundle.ts`, and the published package has no concept of them.
