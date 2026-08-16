import { describe, it, expect } from "vitest";
import {
  serializeSvg,
  virtualSvgDocument,
  VirtualSvgElement,
} from "./svg-backend.js";

describe("virtualSvgDocument", () => {
  it("creates an element with the requested tag name", () => {
    const el = virtualSvgDocument().createElement("circle");
    expect(serializeSvg(el)).toBe("<circle/>");
  });
});

describe("VirtualSvgElement", () => {
  it("serializes attributes in the order they were set", () => {
    const el = new VirtualSvgElement("line");
    el.setAttribute("x1", "1");
    el.setAttribute("y1", "2");
    expect(serializeSvg(el)).toBe('<line x1="1" y1="2"/>');
  });

  it("overwrites a repeated attribute in place rather than emitting it twice", () => {
    const el = new VirtualSvgElement("rect");
    el.setAttribute("fill", "red");
    el.setAttribute("x", "0");
    el.setAttribute("fill", "blue");
    expect(serializeSvg(el)).toBe('<rect fill="blue" x="0"/>');
  });

  it("nests appended children inside the parent tag", () => {
    const parent = new VirtualSvgElement("g");
    const child = new VirtualSvgElement("circle");
    child.setAttribute("r", "3");
    parent.appendChild(child);
    expect(serializeSvg(parent)).toBe('<g><circle r="3"/></g>');
  });

  it("serializes textContent as the element body", () => {
    const el = new VirtualSvgElement("title");
    el.textContent = "Deployment map: Dawn of War";
    expect(serializeSvg(el)).toBe("<title>Deployment map: Dawn of War</title>");
  });

  it("drops existing children when textContent is set", () => {
    const el = new VirtualSvgElement("text");
    el.appendChild(new VirtualSvgElement("circle"));
    el.textContent = "1";
    expect(serializeSvg(el)).toBe("<text>1</text>");
  });

  it("keeps text already set when a child is appended after it", () => {
    const el = new VirtualSvgElement("text");
    el.textContent = "1";
    el.appendChild(new VirtualSvgElement("circle"));
    expect(serializeSvg(el)).toBe("<text>1<circle/></text>");
  });

  it("reads textContent back as the concatenated descendant text", () => {
    const el = new VirtualSvgElement("text");
    el.textContent = "1";
    const child = new VirtualSvgElement("tspan");
    child.textContent = "2";
    el.appendChild(child);
    expect(el.textContent).toBe("12");
  });

  it("empties the element when textContent is set to null", () => {
    const el = new VirtualSvgElement("text");
    el.textContent = "1";
    el.textContent = null;
    expect(serializeSvg(el)).toBe("<text/>");
  });

  it("rejects a child that did not come from the virtual backend", () => {
    const el = new VirtualSvgElement("g");
    const notVirtual = {
      setAttribute() {},
      appendChild() {},
      textContent: null,
    };
    expect(() => el.appendChild(notVirtual)).toThrow(
      /appendChild expects a virtual SVG element/,
    );
  });
});

describe("serializeSvg", () => {
  it('escapes &, <, > and " in attribute values', () => {
    const el = new VirtualSvgElement("use");
    el.setAttribute("style", '--body:a&b;--accent:<c>;--x:"d"');
    expect(serializeSvg(el)).toBe(
      '<use style="--body:a&amp;b;--accent:&lt;c&gt;;--x:&quot;d&quot;"/>',
    );
  });

  it("escapes &, < and > in text content", () => {
    const el = new VirtualSvgElement("title");
    el.textContent = "Search & <Destroy>";
    expect(serializeSvg(el)).toBe(
      "<title>Search &amp; &lt;Destroy&gt;</title>",
    );
  });

  // `]]>` is the one sequence XML forbids outright in text.
  it("keeps a ]]> sequence in text well formed", () => {
    const el = new VirtualSvgElement("title");
    el.textContent = "a ]]> b";
    expect(serializeSvg(el)).toBe("<title>a ]]&gt; b</title>");
  });

  it("stamps the SVG namespace on a root <svg>", () => {
    const svg = new VirtualSvgElement("svg");
    svg.setAttribute("viewBox", "0 0 60 44");
    expect(serializeSvg(svg)).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 44"/>',
    );
  });

  it("leaves an explicit xmlns on the root untouched", () => {
    const svg = new VirtualSvgElement("svg");
    svg.setAttribute("xmlns", "http://example.com/ns");
    expect(serializeSvg(svg)).toBe('<svg xmlns="http://example.com/ns"/>');
  });

  it("does not stamp xmlns on a root that is not an <svg>", () => {
    expect(serializeSvg(new VirtualSvgElement("g"))).toBe("<g/>");
  });

  it("rejects a node that did not come from the virtual backend", () => {
    const notVirtual = {
      setAttribute() {},
      appendChild() {},
      textContent: null,
    };
    expect(() => serializeSvg(notVirtual)).toThrow(
      /serializeSvg expects a virtual SVG tree/,
    );
  });

  it("does not stamp xmlns on nested elements", () => {
    const svg = new VirtualSvgElement("svg");
    svg.appendChild(new VirtualSvgElement("svg"));
    expect(serializeSvg(svg)).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg"><svg/></svg>',
    );
  });
});
