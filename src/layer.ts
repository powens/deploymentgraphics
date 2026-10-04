import type { SvgDocument, SvgNode } from "./svg-backend.js";

/**
 * One drawable layer of the card: the shared shapes it hangs in `<defs>` (if
 * any) and the node that references them. A layer that emits a def also emits
 * every reference to it, so def ids stay private to the layer.
 */
export interface Layer {
  /** A label for the reader only; it is not the emitted node's `id`. */
  readonly id: string;
  /** Appends this layer's shared shapes to the card's single `<defs>`. */
  injectDefs?(doc: SvgDocument, defs: SvgNode): void;
  /** The node to append, in draw order. */
  draw(doc: SvgDocument): SvgNode;
}

/** A layer plus whether it draws at all. */
export type LayerRow = Layer & { readonly draws: boolean };

/**
 * A piece kind drawn as `<use>`s of shared defs. `D` is what a def is built
 * from, `T` one `<use>`.
 */
interface UseLayerSpec<D, T> {
  /** The layer's id and its `<g>`'s; each `<use>` is `<useId>-<n>`. */
  id: string;
  useId: string;
  draws: boolean;
  /** One `<use>` each, in draw order. */
  uses: readonly T[];
  /** The def a `<use>` references. */
  defOf(use: T): D;
  /** The defs to emit, first of each id wins; defaults to every `defOf(use)`. */
  defs?: readonly D[];
  defId(def: D): string;
  /** Builds the def element, carrying `id`. */
  def(doc: SvgDocument, def: D, id: string): SvgNode;
  transform(use: T): string;
  styleUse?(el: SvgNode, use: T): void;
  styleGroup?(el: SvgNode): void;
}

/**
 * Builds a layer whose defs and `<use>`s both name a def through the one
 * `defId`, so the def/use agreement has a single spelling. Defs are emitted
 * once per distinct id; `<use>` ids count up across the whole layer.
 */
export function useLayer<D, T>(spec: UseLayerSpec<D, T>): LayerRow {
  const { uses, defOf, defId } = spec;
  return {
    id: spec.id,
    draws: spec.draws,
    injectDefs(doc, defs) {
      const seen = new Set<string>();
      for (const d of spec.defs ?? uses.map(defOf)) {
        const id = defId(d);
        if (seen.has(id)) continue;
        seen.add(id);
        defs.appendChild(spec.def(doc, d, id));
      }
    },
    draw(doc) {
      const group = doc.createElement("g");
      group.setAttribute("id", spec.id);
      spec.styleGroup?.(group);
      uses.forEach((u, n) => {
        const use = doc.createElement("use");
        use.setAttribute("href", `#${defId(defOf(u))}`);
        use.setAttribute("transform", spec.transform(u));
        use.setAttribute("id", `${spec.useId}-${n}`);
        spec.styleUse?.(use, u);
        group.appendChild(use);
      });
      return group;
    },
  };
}
