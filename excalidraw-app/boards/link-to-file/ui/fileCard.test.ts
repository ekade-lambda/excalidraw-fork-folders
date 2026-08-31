import { describe, it, expect } from "vitest";
import { createFileCardElements, updateFileCardVisuals } from "./fileCard";
import type { LinkToFileData } from "../types";

const mockData: LinkToFileData = {
  type: "link-to-file",
  fileIdentity: { volumeGuid: "VOL1", fileId: [1] },
  lastKnownPath: "C:\\test.txt",
  metadata: { name: "test.txt", extension: "txt", size: 100 }
};

describe("fileCard Visuals", () => {
  it("creates default file card", () => {
    const els = createFileCardElements({ sceneX: 0, sceneY: 0, customData: mockData });
    expect(els).toHaveLength(3);
    const [bg, icon, label] = els;
    expect(icon.type).toBe("text");
    expect((icon as any).text).toBe("📄");
    expect((label as any).text).toBe("test.txt");
  });

  it("updates display name without changing ids", () => {
    const els = createFileCardElements({ sceneX: 0, sceneY: 0, customData: mockData });
    const groupId = els[0].groupIds[0];
    
    const updated = updateFileCardVisuals(els, groupId, { displayName: "My Custom Doc" });
    const [newBg, newIcon, newLabel] = updated;
    
    expect(newBg.id).toBe(els[0].id);
    expect(newLabel.id).toBe(els[2].id);
    expect((newLabel as any).text).toBe("My Custom Doc");
    expect(newIcon.type).toBe("text");
  });

  it("replaces icon with image element when customImageFileId is set", () => {
    const els = createFileCardElements({ sceneX: 0, sceneY: 0, customData: mockData });
    const groupId = els[0].groupIds[0];
    
    const updated = updateFileCardVisuals(els, groupId, { customImageFileId: "img-123" });
    const newIcon = updated[1];
    
    expect(newIcon.type).toBe("image");
    expect((newIcon as any).fileId).toBe("img-123");
  });

  it("restores default visuals when visual data is undefined", () => {
    const els = createFileCardElements({ sceneX: 0, sceneY: 0, customData: mockData });
    const groupId = els[0].groupIds[0];
    
    const updatedWithImage = updateFileCardVisuals(els, groupId, { displayName: "Foo", customImageFileId: "img-123" });
    const updatedRestored = updateFileCardVisuals(updatedWithImage, groupId, undefined);
    
    expect(updatedRestored[1].type).toBe("text");
    expect((updatedRestored[1] as any).text).toBe("📄");
    expect((updatedRestored[2] as any).text).toBe("test.txt");
  });
});
