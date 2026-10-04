// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import * as yaml from "js-yaml";
import {
  drawSnapshot,
  editorYaml,
  openSession,
  renderCard,
  step,
  STORAGE_VERSION,
  type RenderInstruction,
  type Snapshot,
} from "./viewer-session.js";
import { defaultControls } from "./viewer-controls.js";
import { buildConfig } from "./presets/build-config.js";
import { missions } from "./presets/missions.js";

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

describe("editorYaml", () => {
  it("round-trips to the same card the controls draw", () => {
    const opened = openSession({ search: "?rot=90", saved: null });
    const text = editorYaml(opened.session);
    if (text === null) throw new Error("expected the controls' YAML");
    const typed = step(opened.session, { type: "yamlTyped", text });
    const settled = step(typed.session, { type: "yamlSettled" });
    if (settled.render === null) throw new Error(settled.yamlError ?? "no render");
    expect(card(settled.render).outerHTML).toBe(card(controlsInstruction("?rot=90")).outerHTML);
  });
});

/** A config the renderer accepts, as the YAML editor would hold it. */
const CONFIG_YAML = yaml.dump(buildConfig({ mission: missions.dawn_of_war }));

/** A page load restoring a stored yaml session holding `text`. */
function openedOnYaml(text: string): Snapshot {
  const saved = JSON.stringify({
    version: STORAGE_VERSION,
    mode: "yaml",
    controls: defaultControls(),
    yaml: text,
  });
  return openSession({ search: "", saved });
}

/** `snapshot`, with a config that passes the session's checks but not the renderer. */
function failingDraw(snapshot: Snapshot): Snapshot {
  return { ...snapshot, render: { config: {} as never, rotation: 0 } };
}

describe("drawSnapshot", () => {
  it("puts a drawn card on stage", () => {
    const drawn = drawSnapshot(openSession({ search: "", saved: null }));
    expect(drawn.stage).toEqual({ card: expect.anything() });
    expect(drawn.yamlError).toBe(null);
  });

  it("keeps the last card on a yaml render failure, and reports it under the editor", () => {
    const settled = step(openedOnYaml(CONFIG_YAML).session, { type: "yamlSettled" });
    const drawn = drawSnapshot(failingDraw(settled));
    expect(drawn.stage).toBe(null);
    expect(drawn.yamlError).toMatch(/^Render failed: /);
  });

  it("keeps the last card while the YAML does not parse", () => {
    const settled = step(openedOnYaml(CONFIG_YAML).session, { type: "yamlTyped", text: "a: [1" });
    const drawn = drawSnapshot(step(settled.session, { type: "yamlSettled" }));
    expect(drawn.stage).toBe(null);
    expect(drawn.yamlError).toEqual(expect.any(String));
  });

  it("replaces the stage with a controls render failure", () => {
    const controls = { ...defaultControls(), da: "No such disposition" };
    const edited = step(openSession({ search: "", saved: null }).session, {
      type: "controlsEdited",
      controls,
    });
    const drawn = drawSnapshot(edited);
    expect(drawn.stage).toEqual({ message: expect.any(String), error: true });
    expect(drawn.yamlError).toBe(null);
  });

  it("explains an empty stage when a stored yaml session does not parse on load", () => {
    const drawn = drawSnapshot(openedOnYaml("a: [1"));
    expect(drawn.stage).toEqual({ message: "No card yet: see the YAML error above.", error: false });
    expect(drawn.yamlError).toEqual(expect.any(String));
  });

  it("explains an empty stage when a stored yaml session does not draw on load", () => {
    const drawn = drawSnapshot(failingDraw(openedOnYaml(CONFIG_YAML)));
    expect(drawn.stage).toEqual({ message: "No card yet: see the YAML error above.", error: false });
    expect(drawn.yamlError).toMatch(/^Render failed: /);
  });

  it("draws a stored yaml session on load", () => {
    const drawn = drawSnapshot(openedOnYaml(CONFIG_YAML));
    expect(drawn.stage).toEqual({ card: expect.anything() });
    expect(drawn.yamlError).toBe(null);
  });

  it("recovers from a failure with the next good render", () => {
    const failed = step(openedOnYaml("a: [1").session, { type: "yamlSettled" });
    expect(drawSnapshot(failed).stage).toBe(null);
    const fixed = step(failed.session, { type: "yamlTyped", text: CONFIG_YAML });
    const drawn = drawSnapshot(step(fixed.session, { type: "yamlSettled" }));
    expect(drawn.stage).toEqual({ card: expect.anything() });
    expect(drawn.yamlError).toBe(null);
  });

  it("leaves the stage alone for a keystroke, even after a failed load", () => {
    const typed = step(openedOnYaml("a: [1").session, { type: "yamlTyped", text: "a: [1, 2" });
    expect(drawSnapshot(typed)).toEqual({ stage: null, yamlError: null });
  });
});
