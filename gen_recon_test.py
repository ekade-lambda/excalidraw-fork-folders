import os
path = "excalidraw-app/tests/boards/reconciliation.test.ts"
content = """import { describe, expect, it, vi } from "vitest";
import { syncStructuralElements, isStructuralElement } from "../../boards/host/reconciliation";
import { createRootGraph } from "../../boards/domain/graph";
import type { BoardsGraph, BoardId, FolderId } from "../../boards/types";
import type { ExcalidrawElement } from "@excalidraw/element/types";
import { buildFolderVisual } from "../../boards/host/materialize";

describe("reconciliation :: syncStructuralElements (10C)", () => {
  it("1. isStructuralElement identifica correctamente mediante customData", () => {
    const el1 = { id: "1" } as ExcalidrawElement;
    const el2 = { id: "2", customData: { folderBoard: { kind: "folder" } } } as unknown as ExcalidrawElement;
    const el3 = { id: "3", customData: { folderBoard: { kind: "pointer" } } } as unknown as ExcalidrawElement;
    
    expect(isStructuralElement(el1)).toBe(false);
    expect(isStructuralElement(el2)).toBe(true);
    expect(isStructuralElement(el3)).toBe(true);
  });

  it("2. Folder ausente en canvas + presente en Graph + presente físicamente -> se inyectan", () => {
    const rootId = "board-root" as BoardId;
    const graph = createRootGraph();
    const fId = "folder-1" as FolderId;
    graph.folders[fId] = { id: fId, name: "Folder 1", parentId: "folder-root" as FolderId, boardId: "board-f1" as BoardId };
    
    // Canvas del usuario (vacío de carpetas, con un trazo)
    const stroke = { id: "stroke-1", type: "line" } as ExcalidrawElement;
    const currentElements = [stroke];

    // Data física remota (contiene el folder)
    const { primary, text } = buildFolderVisual({ folderId: fId, boardId: "board-f1" as BoardId, name: "Folder 1", sceneX: 10, sceneY: 10 });
    const remoteElements = [stroke, primary, text]; // Tab A guardó esto

    const nextElements = syncStructuralElements(graph, currentElements, rootId, remoteElements);

    expect(nextElements.length).toBe(3);
    expect(nextElements).toContain(stroke);
    expect(nextElements).toContain(primary);
    expect(nextElements).toContain(text);
  });

  it("3. Folder presente en canvas + eliminado del Graph -> se marcan isDeleted", () => {
    const rootId = "board-root" as BoardId;
    const graph = createRootGraph(); // Vacío
    const fId = "folder-1" as FolderId;
    
    const stroke = { id: "stroke-1", type: "line" } as ExcalidrawElement;
    const { primary, text } = buildFolderVisual({ folderId: fId, boardId: "board-f1" as BoardId, name: "Folder 1", sceneX: 10, sceneY: 10 });
    const currentElements = [stroke, primary, text];

    const nextElements = syncStructuralElements(graph, currentElements, rootId, []);

    // Stroke intacto
    expect(nextElements.find(e => e.id === stroke.id)!.isDeleted).toBeFalsy();
    // Carpetas borradas
    expect(nextElements.find(e => e.id === primary.id)!.isDeleted).toBe(true);
    expect(nextElements.find(e => e.id === text.id)!.isDeleted).toBe(true);
  });

  it("4. Canvas con trazos + folder remoto nuevo -> trazos permanecen intactos", () => {
    const rootId = "board-root" as BoardId;
    const graph = createRootGraph();
    const fId = "folder-1" as FolderId;
    graph.folders[fId] = { id: fId, name: "Folder 1", parentId: "folder-root" as FolderId, boardId: "board-f1" as BoardId };
    
    const stroke = { id: "stroke-1", type: "line", x: 100 } as ExcalidrawElement;
    const currentElements = [stroke];

    const { primary } = buildFolderVisual({ folderId: fId, boardId: "board-f1" as BoardId, name: "Folder 1", sceneX: 10, sceneY: 10 });
    
    // Simular que A guardó el board SIN el stroke (LWW), pero nosotros SÓLO vamos a traer lo estructural
    const remoteElements = [primary]; 

    const nextElements = syncStructuralElements(graph, currentElements, rootId, remoteElements);

    const resultingStroke = nextElements.find(e => e.id === stroke.id);
    expect(resultingStroke).toBeDefined();
    expect(resultingStroke!.x).toBe(100);
  });

  it("5. Carpeta existente en ambas -> NO se modifica su posición (LWW activo)", () => {
    const rootId = "board-root" as BoardId;
    const graph = createRootGraph();
    const fId = "folder-1" as FolderId;
    graph.folders[fId] = { id: fId, name: "Folder 1", parentId: "folder-root" as FolderId, boardId: "board-f1" as BoardId };
    
    // Canvas nuestro (posición modificada: x=500)
    const myVisuals = buildFolderVisual({ folderId: fId, boardId: "board-f1" as BoardId, name: "Folder 1", sceneX: 500, sceneY: 500 });
    const currentElements = [myVisuals.primary, myVisuals.text];

    // Canvas remoto (posición original: x=10)
    const remoteVisuals = buildFolderVisual({ folderId: fId, boardId: "board-f1" as BoardId, name: "Folder 1", sceneX: 10, sceneY: 10 });
    const remoteElements = [remoteVisuals.primary, remoteVisuals.text]; 

    const nextElements = syncStructuralElements(graph, currentElements, rootId, remoteElements);

    // Mantenemos NUESTRA posición (LWW visual)
    const resultingPrimary = nextElements.find(e => e.id === myVisuals.primary.id);
    expect(resultingPrimary!.x).toBe(500);
  });
  
  it("6. Folder inexistente en Graph pero elemento normal del usuario -> NO se elimina", () => {
    const rootId = "board-root" as BoardId;
    const graph = createRootGraph();
    
    // Un texto que casualmente dice "Folder 1" pero no es estructural
    const fakeText = { id: "text-1", type: "text", text: "Folder 1" } as any;
    
    const nextElements = syncStructuralElements(graph, [fakeText], rootId, []);
    
    expect(nextElements[0].isDeleted).toBeFalsy();
  });
});
"""
with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Created reconciliation.test.ts")
