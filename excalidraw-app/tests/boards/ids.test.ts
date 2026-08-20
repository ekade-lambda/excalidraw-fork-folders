import { describe, expect, it } from "vitest";

import {
  generateUniqueId,
  newBoardId,
  newFolderId,
  newFolderPointerId,
} from "../../boards/domain/ids";

describe("Board System :: IDs / identidad", () => {
  it("genera ids por namespace (prefijo) independiente", () => {
    expect(newFolderId()).toMatch(/^f-/);
    expect(newBoardId()).toMatch(/^b-/);
    expect(newFolderPointerId()).toMatch(/^p-/);
  });

  it("IDs únicos dentro de su namespace", () => {
    const folders = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const id = newFolderId();
      expect(folders.has(id)).toBe(false);
      folders.add(id);
    }
    const boards = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const id = newBoardId();
      expect(boards.has(id)).toBe(false);
      boards.add(id);
    }
  });

  it("FolderPointerId nunca reutiliza un FolderId", () => {
    const folderIds = new Set<string>();
    const pointerIds = new Set<string>();
    for (let i = 0; i < 200; i++) {
      folderIds.add(newFolderId());
      pointerIds.add(newFolderPointerId());
    }
    for (const p of pointerIds) {
      expect(folderIds.has(p)).toBe(false);
      expect(p.startsWith("f-")).toBe(false);
      expect(p.startsWith("p-")).toBe(true);
    }
  });

  it("generateUniqueId evita colisiones forzadas contra ids en uso", () => {
    const existing = new Set(["x0"]);
    let counter = 0;
    const gen = () => `x${counter++}`;
    const first = generateUniqueId(gen, existing);
    // x0 colisiona → debe devolver x1
    expect(first).toBe("x1");
    const second = generateUniqueId(gen, existing);
    expect(second).toBe("x2");
  });
});
