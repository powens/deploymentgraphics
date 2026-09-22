/**
 * The slice of the DOM the renderer needs (create element, `setAttribute`,
 * `appendChild`, `textContent`), so it can render without a real DOM.
 * `browserSvgDocument()` backs it with SVG nodes; `virtualSvgDocument()` with
 * plain objects that `serializeSvg` turns into a string.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

export interface SvgNode {
  setAttribute(name: string, value: string): void;
  appendChild(child: SvgNode): void;
  textContent: string | null;
}

export interface SvgDocument {
  createElement(tagName: string): SvgNode;
}

type BrowserSvgNode = SVGElement & SvgNode;

export interface BrowserSvgDocument extends SvgDocument {
  createElement(tagName: string): BrowserSvgNode;
}

/** Backend producing real SVG DOM nodes. Requires a `document` global. */
export function browserSvgDocument(): BrowserSvgDocument {
  return {
    createElement: (tagName) =>
      document.createElementNS(SVG_NS, tagName) as unknown as BrowserSvgNode,
  };
}

/**
 * An SVG element held as data. Children mix elements and text runs, as in the
 * DOM, so `textContent` followed by `appendChild` keeps both.
 */
export class VirtualSvgElement implements SvgNode {
  readonly attributes = new Map<string, string>();
  readonly children: (VirtualSvgElement | string)[] = [];

  constructor(readonly tagName: string) {}

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  appendChild(child: SvgNode): void {
    if (!(child instanceof VirtualSvgElement)) {
      // Probably a browser node; fail here rather than later in `serializeSvg`.
      throw new TypeError("appendChild expects a virtual SVG element");
    }
    this.children.push(child);
  }

  // Mirrors the DOM: reading concatenates descendant text, and assigning
  // replaces every child with a single text run.
  get textContent(): string {
    return this.children
      .map((child) => (typeof child === "string" ? child : child.textContent))
      .join("");
  }

  set textContent(value: string | null) {
    this.children.length = 0;
    if (value) this.children.push(value);
  }
}

/** Backend producing `VirtualSvgElement`s. No DOM required. */
export function virtualSvgDocument(): SvgDocument {
  return { createElement: (tagName) => new VirtualSvgElement(tagName) };
}

// `>` only needs escaping in `]]>`, but escaping it everywhere is simpler.
function escapeAttribute(value: string): string {
  return escapeText(value).replaceAll('"', "&quot;");
}

function escapeText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function serializeNode(
  node: VirtualSvgElement,
  attrs: Map<string, string>,
): string {
  const open = [...attrs]
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
    .join("");

  if (node.children.length === 0) {
    return `<${node.tagName}${open}/>`;
  }
  const body = node.children
    .map((child) =>
      typeof child === "string"
        ? escapeText(child)
        : serializeNode(child, child.attributes),
    )
    .join("");
  return `<${node.tagName}${open}>${body}</${node.tagName}>`;
}

/**
 * Renders a virtual tree to SVG markup. A root `<svg>` gets `xmlns`, without
 * which a standalone `.svg` draws nothing.
 */
export function serializeSvg(root: SvgNode): string {
  if (!(root instanceof VirtualSvgElement)) {
    // Browser nodes serialize with `outerHTML`.
    throw new Error("serializeSvg expects a virtual SVG tree");
  }
  const node = root;
  const needsNamespace =
    node.tagName === "svg" && !node.attributes.has("xmlns");
  const attrs = needsNamespace
    ? new Map([["xmlns", SVG_NS], ...node.attributes])
    : node.attributes;
  return serializeNode(node, attrs);
}
