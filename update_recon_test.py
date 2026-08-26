import os

path = "excalidraw-app/tests/boards/reconciliation.test.ts"
content = """import { describe, expect, it } from "vitest";
import { syncStructuralElements, isStructuralElement } from "../../boards/host/reconciliation";
import { createRootGraph } from "../../boards/domain/graph";
import type { BoardId, FolderId } from "../../boards/types";
import type { ExcalidrawElement } from "@excalidraw/element/types";
import { buildFolderVisual } from "../../boards/host/materialize";

describe("reconciliation :: syncStructuralElements (10C fixes)", () => {
  it("1. isStructuralElement identifica correctamente mediante customData", () => {
    const el1 = { id: "1" } as ExcalidrawElement;
    const el2 = { id: "2", customData: { folderBoard: { kind: "folder", role: "image" } } } as unknown as ExcalidrawElement;
    
    expect(isStructuralElement(el1)).toBe(false);
    expect(isStructuralElement(el2)).toBe(true);
  });

  it("2. Folder ausente en canvas + presente en Graph + presente físicamente -> se inyectan", () => {
    const rootId = "board-root" as BoardId;
    const graph = createRootGraph();
    const rootFolderId = graph.rootFolderId;
    graph.folders[rootFolderId].boardId = rootId;

    const fId = "folder-1" as FolderId;
    graph.folders[fId] = { id: fId, name: "Folder 1", parentId: rootFolderId, boardId: "board-f1" as BoardId, createdAt: 0 };
    
    const stroke = { id: "stroke-1", type: "line" } as ExcalidrawElement;
    const currentElements = [stroke];

    const { primary, text } = buildFolderVisual({ folderId: fId, boardId: "board-f1" as BoardId, name: "Folder 1", sceneX: 10, sceneY: 10 });
    const remoteElements = [stroke, primary, text];

    const { elements: nextElements, didChange } = syncStructuralElements(graph, currentElements, rootId, remoteElements);

    expect(didChange).toBe(true);
    expect(nextElements.length).toBe(3);
    expect(nextElements).toContain(stroke);
    expect(nextElements.find(e => e.id === primary.id)).toBeDefined();
    expect(nextElements.find(e => e.id === text.id)).toBeDefined();
  });

  it("3. Folder presente en canvas + eliminado del Graph -> se marcan isDeleted", () => {
    const rootId = "board-root" as BoardId;
    const graph = createRootGraph();
    const rootFolderId = graph.rootFolderId;
    graph.folders[rootFolderId].boardId = rootId;

    const fId = "folder-1" as FolderId;
    
    const stroke = { id: "stroke-1", type: "line" } as ExcalidrawElement;
    const { primary, text } = buildFolderVisual({ folderId: fId, boardId: "board-f1" as BoardId, name: "Folder 1", sceneX: 10, sceneY: 10 });
    const currentElements = [stroke, primary, text];

    const { elements: nextElements, didChange } = syncStructuralElements(graph, currentElements, rootId, []);

    expect(didChange).toBe(true);
    expect(nextElements.find(e => e.id === stroke.id)!.isDeleted).toBeFalsy();
    expect(nextElements.find(e => e.id === primary.id)!.isDeleted).toBe(true);
    expect(nextElements.find(e => e.id === text.id)!.isDeleted).toBe(true);
  });

  it("4. Canvas con trazos + folder remoto nuevo -> trazos permanecen intactos", () => {
    const rootId = "board-root" as BoardId;
    const graph = createRootGraph();
    const rootFolderId = graph.rootFolderId;
    graph.folders[rootFolderId].boardId = rootId;

    const fId = "folder-1" as FolderId;
    graph.folders[fId] = { id: fId, name: "Folder 1", parentId: rootFolderId, boardId: "board-f1" as BoardId, createdAt: 0 };
    
    const stroke = { id: "stroke-1", type: "line", x: 100 } as ExcalidrawElement;
    const currentElements = [stroke];

    const { primary } = buildFolderVisual({ folderId: fId, boardId: "board-f1" as BoardId, name: "Folder 1", sceneX: 10, sceneY: 10 });
    
    const remoteElements = [primary]; 

    const { elements: nextElements, didChange } = syncStructuralElements(graph, currentElements, rootId, remoteElements);

    expect(didChange).toBe(true);
    const resultingStroke = nextElements.find(e => e.id === stroke.id);
    expect(resultingStroke).toBeDefined();
    expect(resultingStroke!.x).toBe(100);
  });

  it("5. Carpeta existente en ambas -> NO se modifica su posición (LWW activo)", () => {
    const rootId = "board-root" as BoardId;
    const graph = createRootGraph();
    const rootFolderId = graph.rootFolderId;
    graph.folders[rootFolderId].boardId = rootId;

    const fId = "folder-1" as FolderId;
    graph.folders[fId] = { id: fId, name: "Folder 1", parentId: rootFolderId, boardId: "board-f1" as BoardId, createdAt: 0 };
    
    const myVisuals = buildFolderVisual({ folderId: fId, boardId: "board-f1" as BoardId, name: "Folder 1", sceneX: 500, sceneY: 500 });
    const currentElements = [myVisuals.primary, myVisuals.text];

    const remoteVisuals = buildFolderVisual({ folderId: fId, boardId: "board-f1" as BoardId, name: "Folder 1", sceneX: 10, sceneY: 10 });
    const remoteElements = [remoteVisuals.primary, remoteVisuals.text]; 

    const { elements: nextElements, didChange } = syncStructuralElements(graph, currentElements, rootId, remoteElements);

    expect(didChange).toBe(false);
    const resultingPrimary = nextElements.find(e => e.id === myVisuals.primary.id);
    expect(resultingPrimary!.x).toBe(500);
  });
  
  it("6. Folder inexistente en Graph pero elemento normal del usuario -> NO se elimina", () => {
    const rootId = "board-root" as BoardId;
    const graph = createRootGraph();
    
    const fakeText = { id: "text-1", type: "text", text: "Folder 1" } as any;
    
    const { elements: nextElements, didChange } = syncStructuralElements(graph, [fakeText], rootId, []);
    
    expect(didChange).toBe(false);
    expect(nextElements[0].isDeleted).toBeFalsy();
  });

  it("7. Folder con image faltante pero text presente -> se restaura image", () => {
    const rootId = "board-root" as BoardId;
    const graph = createRootGraph();
    const rootFolderId = graph.rootFolderId;
    graph.folders[rootFolderId].boardId = rootId;

    const fId = "folder-1" as FolderId;
    graph.folders[fId] = { id: fId, name: "Folder 1", parentId: rootFolderId, boardId: "board-f1" as BoardId, createdAt: 0 };
    
    const { primary, text } = buildFolderVisual({ folderId: fId, boardId: "board-f1" as BoardId, name: "Folder 1", sceneX: 10, sceneY: 10 });
    
    // Canvas local solo tiene el text
    const currentElements = [text];
    
    // Remoto tiene ambos
    const remoteElements = [primary, text];

    const { elements: nextElements, didChange } = syncStructuralElements(graph, currentElements, rootId, remoteElements);

    expect(didChange).toBe(true);
    expect(nextElements.length).toBe(2);
    expect(nextElements.find(e => e.id === primary.id)).toBeDefined();
    expect(nextElements.find(e => e.id === text.id)).toBeDefined();
  });
});
"""
with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Updated reconciliation.test.ts")
