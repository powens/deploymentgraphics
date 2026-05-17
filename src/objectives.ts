import { getHiddenSuppliesCoords, isCenterObjective } from "./coordinates";
import { applyAttributes, makeElement } from "./dom-helpers";
import type { FullConfig } from "./types";

export function injectObjectiveDefs(defs: SVGElement, config: FullConfig) {
  const objMarker = makeObjectiveMarker(config);
  defs.appendChild(objMarker);
}

function makeObjectiveMarker(config: FullConfig) {
  const objConfig = config.base.objective;
  const objGroup = makeElement("g");
  objGroup.setAttribute("id", "objMarker");

  // Absent `draw` defaults to on; only an explicit `false` suppresses.
  if (objConfig.influence.draw !== false) {
    const influenceRadius =
      (objConfig.influence.radius ?? 0) + (objConfig.real.radius ?? 0);

    const objRadius = makeElement("circle");
    objRadius.setAttribute("cx", "0");
    objRadius.setAttribute("cy", "0");
    objRadius.setAttribute("r", `${influenceRadius}`);
    applyAttributes(objRadius, objConfig.influence.svg_properties);
    objGroup.appendChild(objRadius);
  }

  if (objConfig.real.draw !== false) {
    if (!objConfig.real.radius) {
      console.error(`objective real radius is falsy`);
    }

    const objMarker = makeElement("circle");
    objMarker.setAttribute("cx", "0");
    objMarker.setAttribute("cy", "0");
    objMarker.setAttribute("r", `${objConfig.real.radius ?? 0}`);
    applyAttributes(objMarker, objConfig.real.svg_properties);
    objGroup.appendChild(objMarker);
  }

  return objGroup;
}

export function makeObjectives(config: FullConfig) {
  const objectiveGroup = makeElement("g");
  const size = config.base.size;
  const halfWidth = size.width / 2;
  const halfHeight = size.height / 2;

  const objectives = config?.deployment?.objectives ?? [];

  for (const coordinates of objectives) {
    if (
      isCenterObjective(config, coordinates) &&
      config.deployment?.hidden_supplies
    ) {
      const hiddenSupplesCoords = getHiddenSuppliesCoords();
      const o1 = makeElement("use");
      o1.setAttribute("x", `${halfWidth - hiddenSupplesCoords[0]}`);
      o1.setAttribute("y", `${halfHeight - hiddenSupplesCoords[1]}`);
      o1.setAttribute("href", "#objMarker");

      const o2 = makeElement("use");
      o2.setAttribute("x", `${halfWidth + hiddenSupplesCoords[0]}`);
      o2.setAttribute("y", `${halfHeight + hiddenSupplesCoords[1]}`);
      o2.setAttribute("href", "#objMarker");
      objectiveGroup.appendChild(o1);
      objectiveGroup.appendChild(o2);
    } else {
      const o = makeElement("use");
      o.setAttribute("x", `${coordinates[0]}`);
      o.setAttribute("y", `${coordinates[1]}`);
      o.setAttribute("href", "#objMarker");
      objectiveGroup.appendChild(o);
    }
  }

  return objectiveGroup;
}
