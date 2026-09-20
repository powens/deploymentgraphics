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

  // Everything else the card is made of, in draw order. Each layer hangs its
  // own shared shapes in the one `<defs>` and then emits the node that
  // references them, so the two halves cannot drift apart.
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
 * Renders the card as SVG markup, with no DOM and no dependencies — the
 * server-side path. The result carries an `xmlns`, so it stands alone as a
 * `.svg` file or drops straight into an HTML response.
 *
 * The card is otherwise sized by its `viewBox` alone, which leaves a
 * standalone file or an `<img>` to pick a size. Since a string leaves no node
 * to set attributes on afterwards, pass `width`/`height` here to fix one — the
 * board is measured in inches, so `width: 60 * 15` renders it at 15px/inch.
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
