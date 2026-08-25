import os

path = "excalidraw-app/boards/repository/LocalStorageBoardRepository.ts"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Imports
import_str = """import { STORAGE_KEYS } from "../app_constants";
import { createStore, get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
"""
content = content.replace('import { STORAGE_KEYS } from "../app_constants";', import_str)

# 2. Store definition & error helper
store_str = """
const boardsIdbStore = createStore("excalidraw-boards", "boards-store");

function isQuotaExceededError(err: any): boolean {
  return (
    err instanceof DOMException &&
    (err.name === "QuotaExceededError" ||
      err.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}

function safeGet(key: string): string | null {
"""
content = content.replace("function safeGet(key: string): string | null {", store_str)

# 3. loadBoardSync
load_sync_old = """  loadBoardSync(boardId: BoardId): BoardData | null {
    const raw = safeGet(boardKey(boardId));
    if (raw == null) {
      return null;
    }

    const parsed = parseJsonObject<BoardData>(raw);
    if (!parsed || !shapeIsBoardData(parsed)) {"""

load_sync_new = """  loadBoardSync(boardId: BoardId): BoardData | null {
    const raw = safeGet(boardKey(boardId));
    if (raw == null) {
      return null;
    }

    const parsed = parseJsonObject<any>(raw);
    if (parsed && parsed.__idb_pointer) {
      // Cannot load IDB payload synchronously. Returning null to avoid destruction.
      return null;
    }

    if (!parsed || !shapeIsBoardData(parsed)) {"""
content = content.replace(load_sync_old, load_sync_new)

# 4. loadBoard (Async)
load_async_old = """  async loadBoard(boardId: BoardId): Promise<BoardData | null> {
    return this.loadBoardSync(boardId);
  }"""

load_async_new = """  async loadBoard(boardId: BoardId): Promise<BoardData | null> {
    const key = boardKey(boardId);
    const raw = safeGet(key);
    if (raw == null) {
      return null;
    }

    let parsed = parseJsonObject<any>(raw);

    // Si es un puntero, intentamos recuperar de IndexedDB
    if (parsed && parsed.__idb_pointer) {
      const idbRaw = await idbGet<string>(key, boardsIdbStore);
      if (!idbRaw) {
        // Puntero huérfano (payload no existe en IDB)
        console.warn(`BoardRepository: IDB payload missing for pointer ${key}.`);
        return null; // Devolver null es más seguro, la capa superior puede decidir recrearlo.
      }
      parsed = parseJsonObject<any>(idbRaw);
    }

    // Validar el payload final (sea de LS o IDB)
    if (!parsed || !shapeIsBoardData(parsed)) {
      console.warn(
        `BoardRepository: BoardData corrupto para ${boardId}. Se reconstruye vacío.`,
      );
      const empty = createEmptyBoardData(boardId);
      safeSet(key, JSON.stringify(empty));
      return empty;
    }

    let data = parsed as BoardData;
    let version = parsed.schemaVersion;
    while (version < this.schemaVersion) {
      const mig = this.boardMigrations[version];
      if (!mig) {
        break;
      }
      data = mig(data);
      version += 1;
    }
    return version === this.schemaVersion
      ? { ...data, schemaVersion: this.schemaVersion }
      : data;
  }"""
content = content.replace(load_async_old, load_async_new)

# 5. saveBoard (Async)
save_async_old = """  async saveBoard(boardData: BoardData): Promise<void> {
    return this.saveBoardSync(boardData);
  }"""

save_async_new = """  async saveBoard(boardData: BoardData): Promise<void> {
    const key = boardKey(boardData.boardId);
    const value = JSON.stringify({ ...boardData, schemaVersion: this.schemaVersion });

    try {
      window.localStorage.setItem(key, value);
      
      // Cleanup IDB in background si exitoso, para no desperdiciar espacio
      idbDel(key, boardsIdbStore).catch(() => {});
    } catch (error: any) {
      if (isQuotaExceededError(error)) {
        console.warn(`BoardRepository: Quota exceeded for ${key}. Falling back to IndexedDB.`);
        
        // 1. Intentar escribir payload completo en IndexedDB (si falla, propaga)
        await idbSet(key, value, boardsIdbStore);
        
        // 2. Escribir puntero a LocalStorage. Si esto falla (cuota 100%), propaga.
        // El payload quedó en IDB, lo cual es inofensivo.
        window.localStorage.setItem(key, JSON.stringify({ __idb_pointer: true }));
      } else {
        throw error; // Propagar otros errores normalmente
      }
    }
  }"""
content = content.replace(save_async_old, save_async_new)

# 6. deleteBoard (Async)
delete_old = """  async deleteBoard(boardId: BoardId): Promise<void> {
    safeRemove(boardKey(boardId));
  }"""

delete_new = """  async deleteBoard(boardId: BoardId): Promise<void> {
    const key = boardKey(boardId);
    safeRemove(key);
    await idbDel(key, boardsIdbStore).catch(() => {});
  }"""
content = content.replace(delete_old, delete_new)

with open(path, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print("Patched LocalStorageBoardRepository.ts")
