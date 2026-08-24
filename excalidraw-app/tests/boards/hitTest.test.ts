import { describe, expect, it } from "vitest";

import { hitTestFolderAtPoint } from "../../boards/host/hitTest";
import { buildFolderVisual } from "../../boards/host/materialize";

import type { FolderId, BoardId } from "../../boards/types";

const FOLDER_ID = "f-test" as FolderId;
const BOARD_ID = "b-test" as BoardId;

describe("Board System :: hitTest (Fase 4)", () => {
  it("detecta una Folder en el punto del elemento primario (imagen)", () => {
    const visual = buildFolderVisual({
      folderId: FOLDER_ID,
      boardId: BOARD_ID,
      name: "C",
      sceneX: 100,
      sceneY: 100,
    });
    // Dentro del área de la imagen (x:100-220, y:100-220).
    const hit = hitTestFolderAtPoint([visual.primary, visual.text], {
      x: 150,
      y: 150,
    });
    expect(hit).toEqual({
      kind: "folder",
      folderId: FOLDER_ID,
      boardId: BOARD_ID,
    });
  });

  it("no trata un elemento normal como Folder", () => {
    const visual = buildFolderVisual({
      folderId: FOLDER_ID,
      boardId: BOARD_ID,
      name: "C",
      sceneX: 0,
      sceneY: 0,
    });
    // Un elemento sin customData.folderBoard.
    const normal = { ...visual.primary, id: "normal", customData: undefined };
    const hit = hitTestFolderAtPoint([normal], { x: 150, y: 150 });
    expect(hit).toEqual({ kind: "none" });
  });

  it("ignora folders borradas (isDeleted)", () => {
    const visual = buildFolderVisual({
      folderId: FOLDER_ID,
      boardId: BOARD_ID,
      name: "C",
      sceneX: 0,
      sceneY: 0,
    });
    const deleted = { ...visual.primary, isDeleted: true };
    const hit = hitTestFolderAtPoint([deleted], { x: 150, y: 150 });
    expect(hit).toEqual({ kind: "none" });
  });

  it("el elemento con mayor z-index (último) gana si se solapan", () => {
    const a = buildFolderVisual({
      folderId: "f-a" as FolderId,
      boardId: "b-a" as BoardId,
      name: "A",
      sceneX: 0,
      sceneY: 0,
    });
    const b = buildFolderVisual({
      folderId: "f-b" as FolderId,
      boardId: "b-b" as BoardId,
      name: "B",
      sceneX: 0,
      sceneY: 0,
    });
    // Ambos ocupan la misma área; B está después (mayor z-index).
    const hit = hitTestFolderAtPoint([a.primary, b.primary], { x: 60, y: 60 });
    expect(hit).toEqual({ kind: "folder", folderId: "f-b", boardId: "b-b" });
  });

  it("fuera de la carpeta → none", () => {
    const visual = buildFolderVisual({
      folderId: FOLDER_ID,
      boardId: BOARD_ID,
      name: "C",
      sceneX: 0,
      sceneY: 0,
    });
    const hit = hitTestFolderAtPoint([visual.primary, visual.text], {
      x: 5000,
      y: 5000,
    });
    expect(hit).toEqual({ kind: "none" });
  });
});
