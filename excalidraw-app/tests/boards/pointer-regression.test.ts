import { describe, it, expect, beforeEach } from "vitest";

import { CaptureUpdateAction } from "@excalidraw/excalidraw";

import { createPointerInCanvas } from "../../boards/host/pointerService";
import { LocalStorageBoardRepository } from "../../boards/repository/LocalStorageBoardRepository";
import { boardsStoreActions } from "../../boards/host/boardState";
import { createFolder } from "../../boards/host/folderService";
import { hitTestFolderAtPoint } from "../../boards/host/hitTest";

describe("pointerService Regression Tests", () => {
  let repo: LocalStorageBoardRepository;
  let excalidrawAPI: any;
  let currentElements: any[];
  let lastUpdateSceneOpts: any;

  beforeEach(async () => {
    localStorage.clear();
    repo = new LocalStorageBoardRepository();

    // Simulate an existing element on the board
    currentElements = [
      { id: "existing-el-1", type: "rectangle", x: 10, y: 10 },
    ];

    lastUpdateSceneOpts = null;

    excalidrawAPI = {
      addFiles: () => {},
      getName: () => "test",
      getFiles: () => ({}),
      getSceneElementsIncludingDeleted: () => currentElements,
      updateScene: (opts: any) => {
        lastUpdateSceneOpts = opts;
        if (opts.elements) {
          currentElements = opts.elements;
        }
      },
      getAppState: () => ({
        width: 1000,
        height: 800,
        scrollX: 50,
        scrollY: 50,
        zoom: { value: 1 },
      }),
    };

    boardsStoreActions.setCurrentBoardId("b_root");
    boardsStoreActions.setCurrentFolderId("f_root");
    await repo.save({
      schemaVersion: 1,
      rootFolderId: "f_root",
      folders: {
        f_root: {
          id: "f_root",
          name: "Root",
          parentId: null,
          boardId: "b_root",
          createdAt: 0,
          updatedAt: 0,
        },
      },
      pointers: {},
      boards: {
        b_root: {
          id: "b_root",
          name: "Root",
          rootFolderId: "f_root",
          createdAt: 0,
          updatedAt: 0,
        },
      },
      lastOpenBoardId: "b_root",
    });

    await repo.saveBoard({
      schemaVersion: 1,
      boardId: "b_root",
      elements: currentElements,
      files: {},
      viewport: { zoom: 1, scrollX: 50, scrollY: 50 },
      name: "Root Board",
      updatedAt: 0,
    });
  });

  it("satisfies all 10 regression rules", async () => {
    // We already have a board with 1 element.
    // Let's create a target folder first so we can point to it.
    await createFolder({
      repo,
      excalidrawAPI,
      parentFolderId: "f_root",
      name: "TargetFolder",
      sceneX: 0,
      sceneY: 0,
    });

    const graph = await repo.load();
    const newFolder = Object.values(graph!.folders).find(
      (f) => f.id !== "f_root",
    );
    const originalElementsCount = currentElements.length;

    // RULE 1: Crear un pointer en un Board con elementos existentes
    await createPointerInCanvas({
      repo,
      excalidrawAPI,
      targetFolderId: newFolder!.id,
      name: "MyPointer",
      sceneX: 100,
      sceneY: 100,
    });

    // RULE 2: Verificar que los elementos existentes permanecen.
    const existingElement = currentElements.find(
      (el) => el.id === "existing-el-1",
    );
    expect(existingElement).toBeDefined();

    // RULE 3: Verificar que el nuevo pointer aparece además de los elementos existentes.
    // The previous count was existing + folder visual (which is 2 elements: image + text). So 1 + 2 = 3.
    // Now we added another pointer (image + text), so 3 + 2 = 5.
    expect(currentElements.length).toBe(originalElementsCount + 2);
    const pointerPrimary = currentElements.find(
      (el) =>
        el.customData?.folderBoard?.kind === "pointer" &&
        el.customData.folderBoard.role === "image",
    );
    expect(pointerPrimary).toBeDefined();

    // RULE 4: Verificar que updateScene recibe la escena correcta.
    expect(lastUpdateSceneOpts.elements).toBeDefined();
    expect(lastUpdateSceneOpts.captureUpdate).toBe(
      CaptureUpdateAction.IMMEDIATELY,
    );

    // RULE 5, 6, 7: Verificar que crear un pointer no altera scrollX, scrollY ni zoom.
    // En Excalidraw, si updateScene no recibe un appState parcial que modifique scroll/zoom, estos se mantienen intactos.
    // Como confirmamos que updateScene no recibe modificadores de appState:
    expect(lastUpdateSceneOpts.appState).toBeUndefined();

    // RULE 8: Verificar persistencia (el grafo contiene el pointer).
    const newGraph = await repo.load();
    const pointerId = Object.keys(newGraph!.pointers)[0];
    expect(pointerId).toBeDefined();
    expect(newGraph!.pointers[pointerId].targetFolderId).toBe(newFolder!.id);

    // Simulamos el onChange() que Excalidraw emitiría tras el updateScene
    await repo.saveBoard({
      schemaVersion: 1,
      boardId: "b_root",
      elements: currentElements,
      files: {},
      viewport: { zoom: 1, scrollX: 50, scrollY: 50 }, // preserved
      name: "Root Board",
      updatedAt: Date.now(),
    });

    // RULE 9: Verificar que después de recargar se conserva correctamente el estado esperado.
    const reloadedBoard = await repo.loadBoard("b_root");
    expect(reloadedBoard!.elements.length).toBe(5);
    expect(
      reloadedBoard!.elements.find((el: any) => el.id === "existing-el-1"),
    ).toBeDefined();
    expect(
      reloadedBoard!.elements.find(
        (el: any) => el.customData?.folderBoard?.pointerId === pointerId,
      ),
    ).toBeDefined();

    // RULE 10: Verificar el doble clic del pointer y resolución de targetFolderId.
    // Para ello simulamos hitTest
    const hit = hitTestFolderAtPoint(currentElements, { x: 100, y: 100 });
    expect(hit.kind).toBe("pointer");
    if (hit.kind === "pointer") {
      expect(hit.targetFolderId).toBe(newFolder!.id);
      expect(hit.pointerId).toBe(pointerId);
    }
  });
});
