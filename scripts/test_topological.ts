import { PostgresBoardRepository } from "../excalidraw-app/boards/repository/PostgresBoardRepository";

const repo = new PostgresBoardRepository();

async function run() {
  const rootId = `f-root-${Date.now()}`;
  const fA = `f-A-${Date.now()}`;
  const fB = `f-B-${Date.now()}`;
  const fC = `f-C-${Date.now()}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graph: any = {
    schemaVersion: 1,
    rootFolderId: rootId,
    // By passing an object, iterating `Object.keys()` might visit fC before rootId depending on JS engine,
    // but in Rust serde it will become a HashMap which iterates randomly.
    folders: {
      [fC]: { id: fC, name: "Folder C", parentId: fB, boardId: "b-C", createdAt: Date.now(), updatedAt: Date.now() },
      [fA]: { id: fA, name: "Folder A", parentId: rootId, boardId: "b-A", createdAt: Date.now(), updatedAt: Date.now() },
      [rootId]: { id: rootId, name: "Root", parentId: null, boardId: "b-root", createdAt: Date.now(), updatedAt: Date.now() },
      [fB]: { id: fB, name: "Folder B", parentId: fA, boardId: "b-B", createdAt: Date.now(), updatedAt: Date.now() },
    },
    pointers: {},
    boards: {
      "b-root": { id: "b-root", name: "Root", rootFolderId: rootId },
      "b-A": { id: "b-A", name: "Board A", rootFolderId: fA },
      "b-B": { id: "b-B", name: "Board B", rootFolderId: fB },
      "b-C": { id: "b-C", name: "Board C", rootFolderId: fC }
    },
    lastOpenBoardId: "b-root",
    folderCounter: 1
  };

  try {
    console.log("Intentando guardar grafo multinivel...");
    await repo.save(graph);
    console.log("PASS: Guardado exitoso independientemente del orden topológico de las claves en el diccionario!");
  } catch (e) {
    console.log("FAIL: Fallo al guardar:", (e as Error).message);
    process.exit(1);
  }
}

run().catch(console.error);
