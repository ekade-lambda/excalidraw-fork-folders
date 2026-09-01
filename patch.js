const fs = require('fs');
let code = fs.readFileSync('excalidraw-app/boards/host/boardService.ts', 'utf8');

const replacement = `export async function initializeBoardSystem(
  repo: BoardRepository,
): Promise<BoardBootResult> {
  const existing = await repo.load();
  const legacy = hasLegacyState();
  
  let legacyElements: ExcalidrawElement[] = [];
  let legacyFiles: BinaryFiles = {};
  if (legacy) {
    legacyElements = readLegacyElements();
    legacyFiles = await readLegacyFiles();
  }

  if (!existing) {
    const { graph, rootFolderId, rootBoardId } = await createRoot(repo);
    const boardData = buildBoardData(rootBoardId, legacy ? 'Migración Local' : 'root', legacyElements);
    boardData.files = legacyFiles;

    await repo.saveBoard(boardData);

    if (legacy) {
      try {
        window.localStorage.removeItem(LEGACY_ELEMENTS_KEY);
        const filesStore = createStore('files-db', 'files-store');
        await clear(filesStore);
      } catch (e) {
        console.warn('Fase 8.1: No se pudo limpiar IndexedDB tras migración', e);
      }
    }

    commitState(rootBoardId, rootFolderId, boardData);
    return {
      graph,
      currentBoardId: rootBoardId,
      currentFolderId: rootFolderId,
      boardData,
      migrated: legacy,
      createdRoot: true,
    };
  }

  // Caso A: Graph ya existe
  if (legacy) {
    // Migrar legacy a un nuevo folder/board dentro del graph existente
    const folderId = 'f-legacy-' + Date.now();
    const boardId = 'b-legacy-' + Date.now();
    
    existing.folders[folderId] = {
      id: folderId,
      name: 'Importación Legacy',
      parentId: existing.rootFolderId,
      boardId: boardId,
      created: Date.now(),
      updated: Date.now(),
      deleted: false
    };
    existing.boards[boardId] = {
      id: boardId,
      rootFolderId: folderId
    };
    
    await repo.save(existing);
    
    const boardData = buildBoardData(boardId, 'Importación Legacy', legacyElements);
    boardData.files = legacyFiles;
    
    await repo.saveBoard(boardData);
    
    try {
      window.localStorage.removeItem(LEGACY_ELEMENTS_KEY);
      const filesStore = createStore('files-db', 'files-store');
      await clear(filesStore);
    } catch (e) {
      console.warn('Fase 8.1: No se pudo limpiar IndexedDB tras migración concurrente', e);
    }
    
    commitState(boardId, folderId, boardData);
    return {
      graph: existing,
      currentBoardId: boardId,
      currentFolderId: folderId,
      boardData,
      migrated: true,
      createdRoot: false,
    };
  }

  const rootBoardId = existing.folders[existing.rootFolderId].boardId;
  let boardId =
    existing.lastOpenBoardId &&
    existing.boards[existing.lastOpenBoardId] !== undefined
      ? existing.lastOpenBoardId
      : rootBoardId;
  if (existing.boards[boardId] === undefined) {
    boardId = rootBoardId;
  }

  let boardData = await repo.loadBoard(boardId);
  if (!boardData) {
    boardData = buildBoardData(
      boardId,
      existing.boards[boardId]?.name ?? 'root',
      [],
    );
  }
  const folderId = existing.boards[boardId].rootFolderId;
  commitState(boardId, folderId, boardData);
  return {
    graph: existing,
    currentBoardId: boardId,
    currentFolderId: folderId,
    boardData,
    migrated: false,
    createdRoot: false,
  };
}`;

const idx1 = code.indexOf("export async function initializeBoardSystem");
let endBracket = -1;
let openBrackets = 0;
for (let i = idx1; i < code.length; i++) {
  if (code[i] === '{') openBrackets++;
  else if (code[i] === '}') {
    openBrackets--;
    if (openBrackets === 0) {
      endBracket = i;
      break;
    }
  }
}
const toReplace = code.substring(idx1, endBracket + 1);
code = code.replace(toReplace, replacement);

fs.writeFileSync('excalidraw-app/boards/host/boardService.ts', code);
