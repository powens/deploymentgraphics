import type { SVGProperties } from "./types.js";

/**
 * SVG visual properties. Each leaf is a bag of SVG attributes (snake_case keys
 * become kebab-case). The theme decides how things look, never whether they draw.
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
  /** Icon markers: `circle` styles the disk + border ring; `glyph` fills the art. */
  icon: { circle: SVGProperties; glyph: SVGProperties };
  /** Terrain features: `palette` keys map to fill+accent; `stroke_width` shared. */
  feature: {
    palette: Record<string, { fill: string; accent: string }>;
    stroke_width: number;
  };
};
