import { describe, expect, it } from "vitest";

import {
  buildFolderImageDataUrl,
  buildFolderVisual,
  findFolderVisual,
} from "../../boards/host/materialize";

import type { BoardId, FolderId } from "../../boards/types";

const FOLDER_ID = "f-test" as FolderId;
const BOARD_ID = "b-test" as BoardId;

describe("Board System :: materialize (Fase 3)", () => {
  it("crea una representación de 2 elementos (imagen + texto) agrupados", () => {
    const visual = buildFolderVisual({
      folderId: FOLDER_ID,
      boardId: BOARD_ID,
      name: "Carpeta",
      sceneX: 100,
      sceneY: 200,
    });

    expect(visual.primary.type).toBe("image");
    expect(visual.text.type).toBe("text");
    expect(visual.text.text).toBe("Carpeta");

    // Ambos comparten groupIds para selección/movimiento conjuntos.
    const g = visual.groupId;
    expect(visual.primary.groupIds).toContain(g);
    expect(visual.text.groupIds).toContain(g);
  });

  it("customData.folderBoard identifica folder+board y roles (invariantes)", () => {
    const visual = buildFolderVisual({
      folderId: FOLDER_ID,
      boardId: BOARD_ID,
      name: "X",
      sceneX: 0,
      sceneY: 0,
    });

    const imageMeta = visual.primary.customData?.folderBoard as any;
    const textMeta = visual.text.customData?.folderBoard as any;

    expect(imageMeta.kind).toBe("folder");
    expect(imageMeta.folderId).toBe(FOLDER_ID);
    expect(imageMeta.boardId).toBe(BOARD_ID);
    expect(imageMeta.role).toBe("image");
    expect(textMeta.role).toBe("text");
    // Mismo reprId → cohesionan el par.
    expect(imageMeta.reprId).toBe(textMeta.reprId);
  });

  it("la posición NO es identidad (deriva solo de la imagen)", () => {
    const visual = buildFolderVisual({
      folderId: FOLDER_ID,
      boardId: BOARD_ID,
      name: "Y",
      sceneX: 50,
      sceneY: 60,
    });
    expect(visual.primary.x).toBe(50);
    expect(visual.primary.y).toBe(60);
    expect(visual.text.y).toBe(60 + visual.primary.height + 8);
  });

  it("buildFolderImageDataUrl genera un dataURL SVG usable", () => {
    const url = buildFolderImageDataUrl();
    expect(url.startsWith("data:image/svg+xml")).toBe(true);
    // El body está URL-encoded; al decodificarlo contiene <svg.
    const decoded = decodeURIComponent(
      url.replace(/^data:image\/svg\+xml;charset=utf-8,?/i, ""),
    );
    expect(decoded).toContain("<svg");
  });

  it("los ids de archivo y repr son únicos y con prefijo", () => {
    const a = buildFolderVisual({
      folderId: FOLDER_ID,
      boardId: BOARD_ID,
      name: "a",
      sceneX: 0,
      sceneY: 0,
    });
    const b = buildFolderVisual({
      folderId: FOLDER_ID,
      boardId: BOARD_ID,
      name: "b",
      sceneX: 0,
      sceneY: 0,
    });
    expect(a.fileId).not.toBe(b.fileId);
    expect(a.imageFile.id).toBe(a.fileId);
    expect(a.groupId).not.toBe(b.groupId);
    expect(a.primary.id).not.toBe(b.primary.id);
  });

  it("findFolderVisual localiza imagen+texto de una folder (recuperación por customData)", () => {
    const visual = buildFolderVisual({
      folderId: FOLDER_ID,
      boardId: BOARD_ID,
      name: "Z",
      sceneX: 10,
      sceneY: 20,
    });
    const found = findFolderVisual([visual.primary, visual.text], FOLDER_ID);
    expect(found).not.toBeNull();
    expect(found?.primary?.id).toBe(visual.primary.id);
    expect(found?.text?.id).toBe(visual.text.id);
  });

  it("findFolderVisual devuelve null si la folder no tiene representación", () => {
    const visual = buildFolderVisual({
      folderId: FOLDER_ID,
      boardId: BOARD_ID,
      name: "W",
      sceneX: 0,
      sceneY: 0,
    });
    expect(
      findFolderVisual([visual.primary, visual.text], "f-otra" as FolderId),
    ).toBeNull();
  });

  it("no introduce relación paralela: folderId es el mismo para ambos elementos", () => {
    const visual = buildFolderVisual({
      folderId: FOLDER_ID,
      boardId: BOARD_ID,
      name: "V",
      sceneX: 0,
      sceneY: 0,
    });
    const imageMeta = visual.primary.customData?.folderBoard as any;
    const textMeta = visual.text.customData?.folderBoard as any;
    expect(imageMeta.folderId).toBe(textMeta.folderId);
    expect(imageMeta.folderId).toBe(FOLDER_ID);
  });
});
