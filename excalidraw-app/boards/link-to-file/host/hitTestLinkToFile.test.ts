import { describe, it, expect, vi } from "vitest";
import { hitTestLinkToFileAtPoint } from "./hitTestLinkToFile";
import type { ExcalidrawElement } from "@excalidraw/element/types";
import * as excalidrawElement from "@excalidraw/element";

vi.mock("@excalidraw/element", async () => {
  const actual = await vi.importActual("@excalidraw/element");
  return {
    ...actual,
    hitElementItself: vi.fn(),
  };
});

describe("hitTestLinkToFileAtPoint", () => {
  it("returns hit:false if no element is hit", () => {
    vi.mocked(excalidrawElement.hitElementItself).mockReturnValue(false);
    
    const elements = [{ id: "1", type: "text", customData: { type: "link-to-file" } }] as unknown as ExcalidrawElement[];
    const res = hitTestLinkToFileAtPoint(elements, { x: 0, y: 0 });
    
    expect(res.hit).toBe(false);
  });

  it("returns hit:true with element and linkData if a link is hit", () => {
    vi.mocked(excalidrawElement.hitElementItself).mockReturnValue(true);
    
    const customData = { type: "link-to-file", lastKnownPath: "C:\\doc.txt" };
    const elements = [{ id: "1", type: "text", customData }] as unknown as ExcalidrawElement[];
    
    const res = hitTestLinkToFileAtPoint(elements, { x: 0, y: 0 });
    
    expect(res.hit).toBe(true);
    expect(res.element).toBe(elements[0]);
    expect(res.linkData).toBe(customData);
  });

  it("ignores elements that are not links", () => {
    vi.mocked(excalidrawElement.hitElementItself).mockReturnValue(true);
    
    const elements = [{ id: "1", type: "text", customData: { type: "other" } }] as unknown as ExcalidrawElement[];
    const res = hitTestLinkToFileAtPoint(elements, { x: 0, y: 0 });
    
    expect(res.hit).toBe(false);
  });
});
