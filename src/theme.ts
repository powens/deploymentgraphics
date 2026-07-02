import type { SVGProperties } from "./types.js";

/**
 * The single home for SVG visual properties. Every leaf is a bag of SVG
 * attributes (snake_case keys are rewritten to kebab-case by
 * `applyAttributes`). Geometry and behaviour live elsewhere; the theme only
 * decides how things look, never whether they are drawn.
 */
export type Theme = {
  background: SVGProperties;
  half_way_lines: SVGProperties;
  territory: SVGProperties;
  deployment: { attacker: SVGProperties; defender: SVGProperties };
  building: {
    group: SVGProperties;
    /** Keyed by building template name; `default` is the fallback. */
    template: { default: SVGProperties } & Record<string, SVGProperties>;
  };
  grid: SVGProperties;
  objective: { marker: SVGProperties; label: SVGProperties };
  annotation: {
    text: SVGProperties;
    text_outline: SVGProperties;
    arrow: SVGProperties;
  };
  /** Keyed by area-terrain `label`; `default` is the fallback. */
  area_terrain: { default: SVGProperties } & Record<string, SVGProperties>;
  /** Icon markers: `circle` styles the disk + border ring; `glyph` fills the art. */
  icon: { circle: SVGProperties; glyph: SVGProperties };
  /** Terrain features: `palette` keys map to fill+accent; `stroke_width` shared. */
  feature: {
    palette: Record<string, { fill: string; accent: string }>;
    stroke_width: number;
  };
};
