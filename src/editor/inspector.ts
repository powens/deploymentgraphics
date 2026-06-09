import type { Scene, SceneObject } from "./scene.js";
import type { Template } from "../building-coordinates.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const CHIP_LABELS: Record<string, string> = {
  building: "BUILDING",
  "area-terrain": "TERRAIN",
  objective: "OBJECTIVE",
  "deployment-zone": "DEPLOY ZONE",
  annotation: "ANNOTATION",
  icon: "ICON",
  feature: "FEATURE",
};

function numInput(value: number, onchange: (v: number) => void): HTMLInputElement {
  const inp = document.createElement("input");
  inp.type = "number";
  inp.className = "field-input";
  inp.step = "0.5";
  inp.value = String(round2(value));
  inp.addEventListener("change", () => onchange(parseFloat(inp.value)));
  return inp;
}

function makeField(labelText: string): { wrap: HTMLElement; body: HTMLElement } {
  const wrap = document.createElement("div");
  wrap.className = "insp-field";
  const lbl = document.createElement("div");
  lbl.className = "insp-label";
  lbl.textContent = labelText;
  wrap.appendChild(lbl);
  return { wrap, body: wrap };
}

export function renderInspector(
  emptyEl: HTMLElement,
  bodyEl: HTMLElement,
  chipEl: HTMLElement,
  scene: Scene,
  selectedId: string | null,
  templates: Record<string, Template>,
  onDelete: (id: string) => void,
  onChange: (id: string, patch: Partial<SceneObject>) => void,
  onSceneChange: (patch: Partial<Scene>) => void,
): void {
  if (!selectedId || !scene.objects.find((o) => o.id === selectedId)) {
    emptyEl.hidden = true;
    bodyEl.hidden = false;
    chipEl.hidden = false;
    chipEl.textContent = "CANVAS";
    while (bodyEl.firstChild) bodyEl.removeChild(bodyEl.firstChild);

    const { wrap: cField } = makeField("Center exclusion");

    const centerRow = document.createElement("div");
    centerRow.style.cssText = "display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text)";
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.checked = !!scene.centerHoleRadius;
    chk.style.accentColor = "var(--accent)";

    const radiusWrap = document.createElement("span");
    radiusWrap.style.cssText = `display:${scene.centerHoleRadius ? "inline-flex" : "none"};align-items:center;gap:4px;margin-left:8px`;
    const radiusInp = numInput(scene.centerHoleRadius ?? 9, (v) => {
      onSceneChange({ centerHoleRadius: v });
    });
    radiusInp.style.width = "60px";
    radiusWrap.appendChild(document.createTextNode("r ="));
    radiusWrap.appendChild(radiusInp);
    radiusWrap.appendChild(document.createTextNode("″"));

    chk.addEventListener("change", () => {
      if (chk.checked) {
        radiusWrap.style.display = "inline-flex";
        onSceneChange({ centerHoleRadius: 9 });
      } else {
        radiusWrap.style.display = "none";
        onSceneChange({ centerHoleRadius: undefined });
      }
    });

    centerRow.appendChild(chk);
    centerRow.appendChild(document.createTextNode("Center hole"));
    cField.appendChild(centerRow);
    cField.appendChild(radiusWrap);
    bodyEl.appendChild(cField);
    return;
  }

  const obj = scene.objects.find((o) => o.id === selectedId)!;

  emptyEl.hidden = true;
  bodyEl.hidden = false;
  chipEl.hidden = false;
  chipEl.textContent = CHIP_LABELS[obj.type] ?? obj.type.toUpperCase();
  while (bodyEl.firstChild) bodyEl.removeChild(bodyEl.firstChild);

  // Position
  const posField = document.createElement("div");
  posField.className = "insp-field";
  const posLbl = document.createElement("div");
  posLbl.className = "insp-label";
  posLbl.textContent = "Position (inches)";
  posField.appendChild(posLbl);

  const xRow = document.createElement("div");
  xRow.className = "insp-row";
  const xLbl = document.createElement("span");
  xLbl.className = "coord-label";
  xLbl.textContent = "X";
  xRow.appendChild(xLbl);
  xRow.appendChild(numInput(obj.x, (v) => onChange(obj.id, { x: v } as Partial<SceneObject>)));
  posField.appendChild(xRow);

  const yRow = document.createElement("div");
  yRow.className = "insp-row";
  const yLbl = document.createElement("span");
  yLbl.className = "coord-label";
  yLbl.textContent = "Y";
  yRow.appendChild(yLbl);
  yRow.appendChild(numInput(obj.y, (v) => onChange(obj.id, { y: v } as Partial<SceneObject>)));
  posField.appendChild(yRow);
  bodyEl.appendChild(posField);

  if (obj.type === "building") {
    const { wrap: tField } = makeField("Template");
    const sel = document.createElement("select");
    sel.className = "field-input field-select";
    Object.keys(templates).forEach((key) => {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = key;
      if (key === obj.templateKey) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", () => onChange(obj.id, { templateKey: sel.value } as Partial<SceneObject>));
    tField.appendChild(sel);
    bodyEl.appendChild(tField);

    const { wrap: rField } = makeField("Rotation (°)");
    rField.appendChild(
      numInput(obj.rotation, (v) => onChange(obj.id, { rotation: ((v % 360) + 360) % 360 } as Partial<SceneObject>)),
    );
    bodyEl.appendChild(rField);

    const { wrap: mField } = makeField("Mirror");
    const mirrorRow = document.createElement("div");
    mirrorRow.style.cssText = "display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text)";
    const mirrorChk = document.createElement("input");
    mirrorChk.type = "checkbox";
    mirrorChk.checked = obj.mirror;
    mirrorChk.style.accentColor = "var(--accent)";
    mirrorChk.addEventListener("change", () => onChange(obj.id, { mirror: mirrorChk.checked } as Partial<SceneObject>));
    const mirrorLabel = document.createTextNode("180° copy through center");
    mirrorRow.appendChild(mirrorChk);
    mirrorRow.appendChild(mirrorLabel);
    mField.appendChild(mirrorRow);
    bodyEl.appendChild(mField);
  }

  if (obj.type === "objective") {
    const { wrap: nField } = makeField("Number (1–6)");
    const numInp = numInput(obj.number, (v) =>
      onChange(obj.id, { number: Math.max(1, Math.min(6, Math.round(v))) } as Partial<SceneObject>),
    );
    numInp.min = "1";
    numInp.max = "6";
    numInp.step = "1";
    nField.appendChild(numInp);
    bodyEl.appendChild(nField);
  }

  if (obj.type === "annotation" && obj.kind === "text") {
    const { wrap: txtField } = makeField("Text");
    const textInp = document.createElement("input");
    textInp.type = "text";
    textInp.className = "field-input";
    textInp.value = obj.text ?? "";
    textInp.addEventListener("change", () => onChange(obj.id, { text: textInp.value } as Partial<SceneObject>));
    txtField.appendChild(textInp);
    bodyEl.appendChild(txtField);
  }

  if (obj.type === "icon") {
    const { wrap: pField } = makeField("Player colour");
    const sel = document.createElement("select");
    sel.className = "field-input field-select";
    const playerOptions: { value: string; label: string }[] = [
      { value: "", label: "None" },
      { value: "attacker", label: "Attacker" },
      { value: "defender", label: "Defender" },
    ];
    for (const o of playerOptions) {
      const opt = document.createElement("option");
      opt.value = o.value;
      opt.textContent = o.label;
      if ((obj.player ?? "") === o.value) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener("change", () =>
      onChange(obj.id, {
        player: sel.value === "" ? undefined : (sel.value as "attacker" | "defender"),
      } as Partial<SceneObject>),
    );
    pField.appendChild(sel);
    bodyEl.appendChild(pField);
  }

  if (obj.type === "feature") {
    const { wrap: wField } = makeField("Width (inches)");
    wField.appendChild(
      numInput(obj.width, (v) =>
        onChange(obj.id, { width: Math.max(0.5, v) } as Partial<SceneObject>),
      ),
    );
    bodyEl.appendChild(wField);

    const { wrap: hField } = makeField("Height (inches)");
    hField.appendChild(
      numInput(obj.height, (v) =>
        onChange(obj.id, { height: Math.max(0.5, v) } as Partial<SceneObject>),
      ),
    );
    bodyEl.appendChild(hField);

    const { wrap: rField } = makeField("Rotation (°)");
    rField.appendChild(
      numInput(obj.rotation, (v) =>
        onChange(obj.id, {
          rotation: ((v % 360) + 360) % 360,
        } as Partial<SceneObject>),
      ),
    );
    bodyEl.appendChild(rField);

    const { wrap: cField } = makeField("Colour");
    const sel = document.createElement("select");
    sel.className = "field-input field-select";
    // Mirrors the palette keys in static/data/theme.yml
    const colours = ["stone", "rust", "sand", "green", "gunmetal", "bone"];
    for (const c of colours) {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      if (obj.color === c) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener("change", () =>
      onChange(obj.id, { color: sel.value } as Partial<SceneObject>),
    );
    cField.appendChild(sel);
    bodyEl.appendChild(cField);
  }

  const delBtn = document.createElement("button");
  delBtn.className = "del-btn";
  delBtn.textContent = "Delete Object";
  delBtn.addEventListener("click", () => onDelete(obj.id));
  bodyEl.appendChild(delBtn);
}
