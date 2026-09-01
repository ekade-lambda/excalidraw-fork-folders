import { PostgresBoardRepository } from "../excalidraw-app/boards/repository/PostgresBoardRepository";

const repo = new PostgresBoardRepository();

async function run() {
  const rootId = `f-root-${Date.now()}`;
  const validFolderId = `f-valid-${Date.now()}`;
  const invalidFolderId = "a".repeat(200); // 200 chars, exceeds VARCHAR(128)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graph: any = {
    schemaVersion: 1,
    rootFolderId: rootId,
    folders: {
      [rootId]: { id: rootId, name: "Root", parentId: null, boardId: "b-root", createdAt: Date.now(), updatedAt: Date.now() },
      [validFolderId]: { id: validFolderId, name: "Valid Folder", parentId: rootId, boardId: "b-valid", createdAt: Date.now(), updatedAt: Date.now() },
      [invalidFolderId]: { id: invalidFolderId, name: "Invalid Folder", parentId: rootId, boardId: "b-invalid", createdAt: Date.now(), updatedAt: Date.now() },
    },
    pointers: {},
    boards: {
      "b-root": { id: "b-root", name: "Root", rootFolderId: rootId },
      "b-valid": { id: "b-valid", name: "Board 1", rootFolderId: validFolderId },
      "b-invalid": { id: "b-invalid", name: "Board 2", rootFolderId: invalidFolderId }
    },
    lastOpenBoardId: "b-root",
    folderCounter: 1
  };

  try {
    console.log("Intentando guardar grafo con un folder_id invalido...");
    await repo.save(graph);
    console.log("ERROR: La operacion debio fallar!");
  } catch (e) {
    console.log("Fallo esperado capturado:", (e as Error).message);
  }

  const loaded = await repo.load();
  if (loaded && loaded.folders[validFolderId]) {
    console.log("FAIL: El folder valido se guardo parcialmente! No hay atomicidad.");
  } else {
    console.log("PASS: El folder valido no se guardo. Atomicidad confirmada.");
  }
}

run().catch(console.error);
