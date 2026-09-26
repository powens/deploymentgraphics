// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { openSession, renderCard, type RenderInstruction } from "./viewer-session.js";

function controlsInstruction(search = ""): RenderInstruction {
  const { render } = openSession({ search, saved: null });
  if (render === null) throw new Error("expected a render instruction");
  return render;
}

function card(instruction: RenderInstruction): SVGElement {
  const result = renderCard(instruction);
  if ("error" in result) throw new Error(result.error);
  return result.card;
}

describe("renderCard", () => {
  it("draws an unrotated card as the renderer sizes it", () => {
    expect(card(controlsInstruction()).getAttribute("viewBox")).toBe("0 0 60 44");
  });

  for (const [rot, transform] of [
    ["90", "translate(44 0) rotate(90)"],
    ["-90", "translate(0 60) rotate(-90)"],
  ]) {
    it(`turns the card ${rot}° inside the SVG, so exports match the screen`, () => {
      const svg = card(controlsInstruction(`?rot=${rot}`));
      expect(svg.getAttribute("viewBox")).toBe("0 0 44 60");
      const groups = [...svg.children].filter((child) => child.tagName === "g");
      expect(groups[groups.length - 1].getAttribute("transform")).toBe(transform);
    });
  }

  it("keeps the title a direct child of a rotated card", () => {
    const svg = card(controlsInstruction("?rot=90"));
    expect([...svg.children].map((child) => child.tagName)).toEqual(["title", "g"]);
  });

  it("returns what the renderer could not draw, rather than throwing", () => {
    const result = renderCard({ config: {} as never, rotation: 0 });
    expect(result).toEqual({ error: expect.any(String) });
  });

  it("passes an instruction's error straight through", () => {
    expect(renderCard({ error: "drift" })).toEqual({ error: "drift" });
  });
});
