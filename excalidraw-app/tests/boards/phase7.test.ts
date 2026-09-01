import { describe, it, expect } from "vitest";
import { PostgresBoardRepository } from "../../boards/repository/PostgresBoardRepository";
import { createRootGraph, addFolder } from "../../boards/domain/graph";
import { hitTestFolderAtPoint } from "../../boards/host/hitTest";
import { hitTestLinkToFileAtPoint } from "../../boards/link-to-file/host/hitTestLinkToFile";
import { BOARD_SYSTEM_SCHEMA_VERSION } from "../../boards/types";

// Stub enough elements to test Phase 7 persistence
function makeFolderElement(folderId: string) {
  return {
    id: "f1",
    type: "image",
    x: 0, y: 0, width: 100, height: 100,
    isDeleted: false,
    customData: {
      folderBoard: { kind: "folder", folderId, boardId: "b2" }
    }
  };
}
function makePointerElement(pointerId: string, targetFolderId: string) {
  return {
    id: "p1",
    type: "image",
    x: 100, y: 100, width: 100, height: 100,
    isDeleted: false,
    customData: {
      folderBoard: { kind: "pointer", pointerId, targetFolderId, boardId: "b2" }
    }
  };
}
function makeLinkToFileElement() {
  return {
    id: "l1",
    type: "image",
    x: 200, y: 200, width: 100, height: 100,
    isDeleted: false,
    customData: {
      type: "link-to-file",
      fileIdentity: { volumeGuid: "vol1", fileId: [1,2,3] },
      lastKnownPath: "C:\\test.txt",
      metadata: { name: "test.txt", size: 100, extension: "txt" }
    }
  };
}

describe("Fase 7 - Custom Tools Persistence & Hit Testing", () => {
  const repo = new PostgresBoardRepository();

  it("should persist Pointer, Folder, and LinkToFile elements and retain customData for hit testing", async () => {
    const graph = createRootGraph();
    const res = addFolder(graph, { parentId: graph.rootFolderId, name: "TargetFolder" });
    if (!res.ok) throw new Error("Failed to add folder");
    await repo.save(res.graph);
    
    const boardId = `TEST_PHASE7_${Date.now()}`;
    const folderEl = makeFolderElement(res.folderId);
    const pointerEl = makePointerElement("ptr1", res.folderId);
    const linkEl = makeLinkToFileElement();
    
    const elements = [folderEl, pointerEl, linkEl] as any[];
    
    // Save to PostgreSQL via API
    await repo.saveBoard({
      schemaVersion: BOARD_SYSTEM_SCHEMA_VERSION,
      boardId,
      elements,
      files: {} as any,
      viewport: { scrollX: 0, scrollY: 0, zoom: 1 },
      name: "Phase 7 Board",
      updatedAt: Date.now()
    });
    
    // Reload from PostgreSQL
    const loaded = await repo.loadBoard(boardId);
    expect(loaded).not.toBeNull();
    const loadedElements = loaded!.elements;
    
    // Validate customData survived the Database serialization/deserialization
    expect(loadedElements.length).toBe(3);
    
    const hitFolder = hitTestFolderAtPoint(loadedElements, { x: 50, y: 50 });
    expect(hitFolder.kind).toBe("folder");
    if (hitFolder.kind === "folder") {
      expect(hitFolder.folderId).toBe(res.folderId);
    }
    
    const hitPointer = hitTestFolderAtPoint(loadedElements, { x: 150, y: 150 });
    expect(hitPointer.kind).toBe("pointer");
    if (hitPointer.kind === "pointer") {
      expect(hitPointer.targetFolderId).toBe(res.folderId);
      expect(hitPointer.pointerId).toBe("ptr1");
    }
    
    const hitLink = hitTestLinkToFileAtPoint(loadedElements, { x: 250, y: 250 });
    expect(hitLink.hit).toBe(true);
    expect(hitLink.linkData?.lastKnownPath).toBe("C:\\test.txt");
  });
});
