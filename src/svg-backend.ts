/**
 * The tiny slice of the DOM the renderer actually needs, plus a dependency-free
 * implementation of it.
 *
 * Building the card touches exactly four operations — create an element by tag
 * name, `setAttribute`, `appendChild`, and `textContent` — so server-side
 * rendering does not need a real DOM, only a substitute element type. The
 * renderer takes an `SvgDocument` and never reaches for a `document` global:
 * `browserSvgDocument()` backs it with real SVG nodes, `virtualSvgDocument()`
 * with plain objects that `serializeSvg` turns into a string.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/** The element contract the renderer builds against. */
export interface SvgNode {
  setAttribute(name: string, value: string): void;
  appendChild(child: SvgNode): void;
  textContent: string | null;
}

/** Element factory threaded through every renderer helper. */
export interface SvgDocument {
  createElement(tagName: string): SvgNode;
}

/** A real SVG DOM element, usable wherever the renderer wants an `SvgNode`. */
export type BrowserSvgNode = SVGElement & SvgNode;

/** The browser backend, narrowed to the DOM nodes it actually hands back. */
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
 * An SVG element held as data: a tag, its attributes, and its children.
 *
 * Children are elements and text runs both, mirroring the DOM's mixed content
 * rather than forcing an element to be either textual or nested — otherwise
 * `textContent` followed by `appendChild` would drop one of the two here while
 * the browser backend kept both.
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
      // Most likely a node from `browserSvgDocument()`. Rejecting it here
      // points at the mismatched append rather than failing later, deep inside
      // `serializeSvg`, on a node it cannot walk.
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

// `>` is only strictly forbidden as part of the `]]>` sequence, but escaping
// it everywhere costs nothing and keeps text like `a ]]> b` well formed;
// quotes only matter inside the double-quoted attribute syntax.
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
 * Renders a virtual tree to SVG markup. A standalone `.svg` is parsed as XML,
 * so a root `<svg>` is stamped with `xmlns` — without it every element lands in
 * the null namespace and nothing draws.
 */
export function serializeSvg(root: SvgNode): string {
  if (!(root instanceof VirtualSvgElement)) {
    // Most likely a DOM node from `browserSvgDocument()`: those serialize with
    // `outerHTML`, not here.
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
