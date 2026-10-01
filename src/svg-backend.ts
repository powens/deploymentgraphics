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

/** A letter or `_`, then letters, digits, `_`, `-` or `.`: safe in `url(#…)`. */
const ID_PREFIX = /^[A-Za-z_][\w.-]*$/;

/** `href="#…"` / `xlink:href="#…"`. */
const isHref = (name: string, value: string): boolean =>
  (name === "href" || name === "xlink:href") && value.startsWith("#");

/** An href, or any attribute holding a `url(#…)`. */
const isReference = (name: string, value: string): boolean =>
  isHref(name, value) || value.includes("url(#");

/** What a prefixed render records, so references are rewritten once ids are known. */
type PrefixLog = {
  ids: Set<string>;
  references: { node: SvgNode; name: string; value: string }[];
};

/**
 * A node whose `id`s carry a prefix and whose references are logged for
 * {@link withIdPrefix} to rewrite. Wraps rather than patches the backend's
 * node, so a browser element handed back to the caller keeps the DOM's own
 * `setAttribute`.
 */
class PrefixedNode implements SvgNode {
  constructor(
    readonly inner: SvgNode,
    private readonly prefix: string,
    private readonly log: PrefixLog,
  ) {}

  setAttribute(name: string, value: string): void {
    if (name === "id") {
      this.log.ids.add(value);
      this.inner.setAttribute(name, `${this.prefix}${value}`);
      return;
    }
    if (isReference(name, value)) {
      this.log.references.push({ node: this.inner, name, value });
    }
    this.inner.setAttribute(name, value);
  }

  appendChild(child: SvgNode): void {
    this.inner.appendChild(child instanceof PrefixedNode ? child.inner : child);
  }

  get textContent(): string | null {
    return this.inner.textContent;
  }

  set textContent(value: string | null) {
    this.inner.textContent = value;
  }
}

/**
 * Renders `draw` against `doc` with every id it sets, and every reference to
 * one of those ids (`href="#…"`, `xlink:href="#…"`, `url(#…)`), prefixed by
 * `prefix`, so several cards can share one HTML document. A reference to an id
 * the card did not emit (a theme's `url(#page-gradient)`) is left alone. An
 * empty prefix renders against `doc` itself, byte-identical to no prefix.
 * Returns the backend's own node, never a wrapper.
 */
export function withIdPrefix(
  doc: SvgDocument,
  prefix: string,
  draw: (doc: SvgDocument) => SvgNode,
): SvgNode {
  if (prefix === "") return draw(doc);
  if (typeof prefix !== "string" || !ID_PREFIX.test(prefix)) {
    throw new Error(
      "idPrefix: expected a letter or _ followed by letters, digits, _, - or ., " +
        `got ${JSON.stringify(prefix)}`,
    );
  }
  const log: PrefixLog = { ids: new Set(), references: [] };
  const root = draw({
    createElement: (tagName) =>
      new PrefixedNode(doc.createElement(tagName), prefix, log),
  });

  // Rewritten after the draw, since a reference may precede its def. Setting
  // an existing attribute keeps its position, so only the value changes.
  const own = (id: string): string => (log.ids.has(id) ? `${prefix}${id}` : id);
  for (const { node, name, value } of log.references) {
    const rewritten = isHref(name, value)
      ? `#${own(value.slice(1))}`
      : value.replace(/url\(#([^)]*)\)/g, (_, id: string) => `url(#${own(id)})`);
    node.setAttribute(name, rewritten);
  }
  return root instanceof PrefixedNode ? root.inner : root;
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
