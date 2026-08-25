import os
path = "excalidraw-app/boards/repository/LocalStorageBoardRepository.ts"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Make sure `keys` is imported from idb-keyval
if "keys as idbKeys" not in content:
    content = content.replace(
        'import {',
        'import {\n  keys as idbKeys,',
        1
    )

class_start = "export class LocalStorageBoardRepository implements BoardRepository {"
war_props = """  private localActiveWrites = new Set<BoardId>();

  private addActiveWrites(boardIds: BoardId[]) {
    for (const bId of boardIds) {
      this.localActiveWrites.add(bId);
      safeSet(`${STORAGE_KEYS.BOARDS_WAR_PREFIX}${bId}`, Date.now().toString());
    }
  }

  private clearLocalActiveWrites() {
    for (const bId of this.localActiveWrites) {
      safeRemove(`${STORAGE_KEYS.BOARDS_WAR_PREFIX}${bId}`);
    }
    this.localActiveWrites.clear();
  }

  async runWithActiveWrites<T>(boardIds: BoardId[], operation: () => Promise<T>): Promise<T> {
    this.addActiveWrites(boardIds);
    try {
      return await operation();
    } finally {
      // Limpiamos estrictamente los IDs que protegimos en ESTA operación.
      for (const bId of boardIds) {
        this.localActiveWrites.delete(bId);
        safeRemove(`${STORAGE_KEYS.BOARDS_WAR_PREFIX}${bId}`);
      }
    }
  }

  async runGarbageCollector(graph: BoardsGraph): Promise<void> {
    const oneHour = 60 * 60 * 1000;
    const now = Date.now();
    const validBoardIds = new Set<string>();
    
    for (const folder of Object.values(graph.folders)) {
      if (folder.boardId) validBoardIds.add(folder.boardId);
    }
    for (const boardId of Object.keys(graph.boards)) {
      validBoardIds.add(boardId);
    }

    const activeWars = new Set<string>();
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(STORAGE_KEYS.BOARDS_WAR_PREFIX)) {
        const boardId = key.substring(STORAGE_KEYS.BOARDS_WAR_PREFIX.length);
        
        if (validBoardIds.has(boardId)) {
          safeRemove(key);
          continue;
        }

        const rawTimestamp = window.localStorage.getItem(key);
        const timestamp = rawTimestamp ? parseInt(rawTimestamp, 10) : 0;
        
        if (!isNaN(timestamp) && now - timestamp > oneHour) {
          safeRemove(key);
        } else {
          activeWars.add(boardId);
        }
      }
    }

    const isProtected = (boardId: string) => validBoardIds.has(boardId) || activeWars.has(boardId);

    const lsKeysToDelete: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(STORAGE_KEYS.BOARDS_BOARD_PREFIX)) {
        const boardId = key.substring(STORAGE_KEYS.BOARDS_BOARD_PREFIX.length);
        if (!isProtected(boardId)) {
          lsKeysToDelete.push(key);
        }
      }
    }
    
    const idbStoreKeys = await idbKeys(boardsIdbStore);
    const idbKeysToDelete: string[] = [];
    for (const key of idbStoreKeys) {
      if (typeof key === "string" && key.startsWith(STORAGE_KEYS.BOARDS_BOARD_PREFIX)) {
        const boardId = key.substring(STORAGE_KEYS.BOARDS_BOARD_PREFIX.length);
        if (!isProtected(boardId)) {
          idbKeysToDelete.push(key);
        }
      }
    }

    for (const key of lsKeysToDelete) {
      safeRemove(key);
    }
    for (const key of idbKeysToDelete) {
      await idbDel(key, boardsIdbStore).catch(() => {});
    }
  }
"""

content = content.replace(class_start, class_start + "\n" + war_props)

save_sync_old = """  saveSync(graph: BoardsGraph): void {
    safeSet(
      STORAGE_KEYS.BOARDS_GRAPH,
      JSON.stringify({ ...graph, schemaVersion: this.schemaVersion }),
    );
  }"""
save_sync_new = """  saveSync(graph: BoardsGraph): void {
    safeSet(
      STORAGE_KEYS.BOARDS_GRAPH,
      JSON.stringify({ ...graph, schemaVersion: this.schemaVersion }),
    );
    this.clearLocalActiveWrites();
  }"""
content = content.replace(save_sync_old, save_sync_new)

clone_old = """  clonePhysicalBoardsSync(oldToNewBoardMap: Map<BoardId, BoardId>): void {
    // 1. Verificamos que los destinos NO existan.
    for (const newBId of oldToNewBoardMap.values()) {"""
clone_new = """  clonePhysicalBoardsSync(oldToNewBoardMap: Map<BoardId, BoardId>): void {
    const newIds = Array.from(oldToNewBoardMap.values());
    this.addActiveWrites(newIds);

    // 1. Verificamos que los destinos NO existan.
    for (const newBId of oldToNewBoardMap.values()) {"""
content = content.replace(clone_old, clone_new)

with open(path, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print("Patched LocalStorageBoardRepository.ts")
