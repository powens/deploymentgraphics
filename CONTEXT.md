# Context — domain glossary

Domain terms for the deployment-map generator. Architecture vocabulary (module,
interface, seam, depth, adapter) lives in the architecture-review tooling, not here.

## Terms

**Placement** — an instruction for putting one piece on the board, in the form a
human authors it in YAML. Two authoring shapes exist:
- *corner-pin* (buildings): pin one or two named template corners (TL/TR/BL/BR) to
  inward distances from a canvas corner; rotation is *derived* from two corners.
- *box* (features, area terrain): a top-left `{x, y}`, a `{width, height}` box, and
  a `rotation` taken about the box centre.

**Placed** — the *canonical resolved form* of a placement, ready to render: a
template/feature name, a box `{x, y, width, height}` (top-left of the unrotated
box), and a `rotation` about the box centre. Every authoring shape resolves into a
`Placed`; every renderer draws a `Placed` with the same `translate(x y) rotate(rot
cx cy)`. The single representation behind the placement module's seam.

**Resolve** — map an authoring placement to one or more `Placed` (corner-pin → box
for buildings; identity for already-box features). The forward direction.

**Centre-pivot** — the `Placed` convention: rotation is taken about the box centre.
Every renderer draws this way via `placedTransform` (the single owner of the
`translate(x y) rotate(rot cx cy)` string); features are authored this way too.

**Origin-pivot** — an alternative building convention: a `{x, y}` translate (the
unrotated box top-left) plus a rotation taken *about that top-left corner*.
`resolveBuilding` maps corner-pin → origin-pivot; it is an adapter over
`resolvePlacement` for callers that reason about a top-left pivot (the
placement tests and the 40kdc converter checks), not a second source of truth.

**Mirror** — point-reflect a `Placed` through the canvas centre (`rotation += 180`).
A piece emits a mirrored copy unless its placement says `mirror: false`; the default
is *mirror on*. One formula, owned by the placement module.

**Canvas** — the board, `{width, height}` in inches (standard 60×44). Anchors
(TL/TR/BL/BR) and mirroring are all measured against it.

**Layout-resolution** — `resolveLayout(config)` assembling the pieces a render
pass draws into a `ResolvedLayout` (buildings, icons, features, area-terrain).
Buildings and icons come from the selected layout alone (empty arrays when none
is selected); features and area-terrain are unioned with the board's top-level
arrays. Distinct from **Resolve** above: that maps one placement to a `Placed`;
this assembles placement *arrays* and applies the "is a layout selected / union
with top-level" rules in one place.
