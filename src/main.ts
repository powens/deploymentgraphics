import {
  browserSvgDocument,
  serializeSvg,
  virtualSvgDocument,
  type SvgDocument,
  type SvgNode,
} from "./svg-backend.js";
import { baseTheme } from "./presets/theme.js";
import { cardLayers } from "./layers.js";
import type { Theme } from "./theme.js";
import type { FullConfig } from "./types.js";

function buildTree(
  doc: SvgDocument,
  config: FullConfig,
  theme: Theme,
): SvgNode {
  const svg = doc.createElement("svg");
  svg.setAttribute(
    "viewBox",
    `0 0 ${config.base.size.width} ${config.base.size.height}`,
  );

  // Give assistive tech an accessible name for the rendered card.
  svg.setAttribute("role", "img");
  const title = doc.createElement("title");
  title.textContent = `Deployment map: ${config.deployment.name}`;
  svg.appendChild(title);

  if (theme.background.fill) {
    const background = doc.createElement("rect");
    background.setAttribute("x", "0");
    background.setAttribute("y", "0");
    background.setAttribute("width", `${config.base.size.width}`);
    background.setAttribute("height", `${config.base.size.height}`);
    background.setAttribute("fill", `${theme.background.fill}`);
    svg.appendChild(background);
  }

  // The rest of the card, in draw order. Each layer adds its shared shapes to
  // `<defs>`, then draws the node that references them.
  const layers = cardLayers(config, theme);
  const defs = doc.createElement("defs");
  svg.appendChild(defs);
  for (const layer of layers) layer.injectDefs?.(doc, defs);
  for (const layer of layers) svg.appendChild(layer.draw(doc));

  return svg;
}

/**
 * Renders the card as an `<svg>` element. Needs a DOM: nodes are created with
 * `document.createElementNS`. For Node, `renderMissionCardToString` renders the
 * same card without one.
 */
export function makeMissionCard(
  config: FullConfig,
  theme: Theme = baseTheme,
): SVGElement {
  return buildTree(
    browserSvgDocument(),
    config,
    theme,
  ) as unknown as SVGElement;
}

/** Root `<svg>` sizing for `renderMissionCardToString`. */
export interface RenderToStringOptions {
  /** `width` attribute: a number of pixels, or any SVG length (`"100%"`). */
  width?: number | string;
  /** `height` attribute, in the same terms as `width`. */
  height?: number | string;
}

/**
 * Renders the card as standalone SVG markup (with `xmlns`), no DOM required.
 * Without `width`/`height` it is sized by its `viewBox` alone; the board is in
 * inches, so `width: 60 * 15` renders at 15px/inch.
 */
export function renderMissionCardToString(
  config: FullConfig,
  theme: Theme = baseTheme,
  { width, height }: RenderToStringOptions = {},
): string {
  const svg = buildTree(virtualSvgDocument(), config, theme);
  if (width !== undefined) svg.setAttribute("width", `${width}`);
  if (height !== undefined) svg.setAttribute("height", `${height}`);
  return serializeSvg(svg);
}
