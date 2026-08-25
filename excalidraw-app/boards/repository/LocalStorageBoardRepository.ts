import {
  keys as idbKeys,
  createStore,
  get as idbGet,
  set as idbSet,
  del as idbDel,
} from "idb-keyval";

import { createRootGraph } from "../domain/graph";
import { STORAGE_KEYS } from "../../app_constants";

import { BOARD_SYSTEM_SCHEMA_VERSION } from "../types";

import { applyDeletePatch } from "../domain/delete";

import type { BoardRepository } from "./BoardRepository";
import type { BoardData, BoardId, BoardsGraph } from "../types";
import type { DeleteFolderPatch, DeletePointerPatch } from "../domain/delete";

/** Migración de una versión concreta (de `from` a `from+1`). */
export type GraphMigration = (g: BoardsGraph) => BoardsGraph;
export type BoardMigration = (b: BoardData) => BoardData;

/** Migraciones por defecto. v1 → v1 no-op. Futuras se añaden aquí. */
const DEFAULT_GRAPH_MIGRATIONS: Record<number, GraphMigration> = {};
const DEFAULT_BOARD_MIGRATIONS: Record<number, BoardMigration> = {};

const now = () => Date.now();

/** Crea BoardData VACÍO para un board (referencias ausentes/corruptas). */
export function createEmptyBoardData(boardId: BoardId, name = ""): BoardData {
  return {
    schemaVersion: BOARD_SYSTEM_SCHEMA_VERSION,
    boardId,
    elements: [],
    files: {},
    viewport: null,
    name,
    updatedAt: now(),
  };
}

const boardsIdbStore = createStore("excalidraw-boards", "boards-store");

function isQuotaExceededError(err: any): boolean {
  return (
    err?.name === "QuotaExceededError" ||
    err?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    (err instanceof DOMException &&
      (err.name === "QuotaExceededError" ||
        err.name === "NS_ERROR_DOM_QUOTA_REACHED"))
  );
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.warn("BoardRepository: localStorage read failed", error);
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    console.error("BoardRepository: localStorage write failed", error);
  }
}

function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn("BoardRepository: localStorage remove failed", error);
  }
}

/** JSON.parse SIEMPRE protegido; null si no es JSON válido u objeto. */
function parseJsonObject<T>(raw: string | null): T | null {
  if (raw == null) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") {
      return null;
    }
    return parsed as T;
  } catch (error) {
    console.warn("BoardRepository: corrupt JSON", error);
    return null;
  }
}

function shapeIsGraph(g: unknown): g is BoardsGraph {
  const o = g as BoardsGraph;
  return (
    typeof o?.schemaVersion === "number" &&
    typeof o?.rootFolderId === "string" &&
    !!o?.folders &&
    typeof o.folders === "object" &&
    !!o?.pointers &&
    typeof o.pointers === "object" &&
    !!o?.boards &&
    typeof o.boards === "object"
  );
}

function shapeIsBoardData(b: unknown): b is BoardData {
  const o = b as BoardData;
  return (
    typeof o?.schemaVersion === "number" &&
    typeof o?.boardId === "string" &&
    Array.isArray(o?.elements) &&
    typeof o?.files === "object"
  );
}

function boardKey(boardId: BoardId): string {
  return `${STORAGE_KEYS.BOARDS_BOARD_PREFIX}${boardId}`;
}

export class LocalStorageBoardRepository implements BoardRepository {
  private localActiveWrites = new Set<BoardId>();

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

  async runWithActiveWrites<T>(
    boardIds: BoardId[],
    operation: () => Promise<T>,
  ): Promise<T> {
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
      if (folder.boardId) {
        validBoardIds.add(folder.boardId);
      }
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

    const isProtected = (boardId: string) =>
      validBoardIds.has(boardId) || activeWars.has(boardId);

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
      if (
        typeof key === "string" &&
        key.startsWith(STORAGE_KEYS.BOARDS_BOARD_PREFIX)
      ) {
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

  readonly schemaVersion = BOARD_SYSTEM_SCHEMA_VERSION;
  private readonly graphMigrations: Record<number, GraphMigration>;
  private readonly boardMigrations: Record<number, BoardMigration>;

  constructor(opts?: {
    graphMigrations?: Record<number, GraphMigration>;
    boardMigrations?: Record<number, BoardMigration>;
  }) {
    this.graphMigrations = opts?.graphMigrations ?? DEFAULT_GRAPH_MIGRATIONS;
    this.boardMigrations = opts?.boardMigrations ?? DEFAULT_BOARD_MIGRATIONS;
  }

  // ------------------------------------------------------------------
  // BoardsGraph
  // ------------------------------------------------------------------

  loadSync(): BoardsGraph | null {
    const raw = safeGet(STORAGE_KEYS.BOARDS_GRAPH);
    if (raw == null) {
      return null;
    }

    const parsed = parseJsonObject<BoardsGraph>(raw);
    if (!parsed || !shapeIsGraph(parsed)) {
      // Gráfica corrupta/shape inválido -> backup + raíz nueva.
      safeSet(STORAGE_KEYS.BOARDS_GRAPH_BROKEN, raw);
      safeRemove(STORAGE_KEYS.BOARDS_GRAPH);
      console.warn(
        "BoardRepository: BoardsGraph corrupto. Backup en *_BROKEN; se crea raíz nueva.",
      );
      return createRootGraph();
    }

    // Migraciones encadenadas vN -> N+1 hasta la versión actual.
    let graph = parsed;
    let version = parsed.schemaVersion;
    while (version < this.schemaVersion) {
      const mig = this.graphMigrations[version];
      if (!mig) {
        break;
      }
      graph = mig(graph);
      version += 1;
    }
    // La gráfica saliente lleva la versión actual (si se migró completo) o
    // conserva su versión si no había migración (no se rompe la data).
    return version === this.schemaVersion
      ? { ...graph, schemaVersion: this.schemaVersion }
      : graph;
  }

  async load(): Promise<BoardsGraph | null> {
    return this.loadSync();
  }

  saveSync(graph: BoardsGraph): void {
    safeSet(
      STORAGE_KEYS.BOARDS_GRAPH,
      JSON.stringify({ ...graph, schemaVersion: this.schemaVersion }),
    );
    this.clearLocalActiveWrites();
  }

  async save(graph: BoardsGraph): Promise<void> {
    return this.saveSync(graph);
  }

  // ------------------------------------------------------------------
  // BoardData
  // ------------------------------------------------------------------

  loadBoardSync(boardId: BoardId): BoardData | null {
    const raw = safeGet(boardKey(boardId));
    if (raw == null) {
      return null;
    }

    const parsed = parseJsonObject<any>(raw);
    if (parsed && parsed.__idb_pointer) {
      // Cannot load IDB payload synchronously. Returning null to avoid destruction.
      return null;
    }

    if (!parsed || !shapeIsBoardData(parsed)) {
      // Board payload corrupto -> reconstruir vacío (no romper el grafo).
      console.warn(
        `BoardRepository: BoardData corrupto para ${boardId}. Se reconstruye vacío.`,
      );
      const empty = createEmptyBoardData(boardId);
      safeSet(boardKey(boardId), JSON.stringify(empty));
      return empty;
    }

    let data = parsed;
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
  }

  async loadBoard(boardId: BoardId): Promise<BoardData | null> {
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
        console.warn(
          `BoardRepository: IDB payload missing for pointer ${key}.`,
        );
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
  }

  saveBoardSync(boardData: BoardData): void {
    safeSet(
      boardKey(boardData.boardId),
      JSON.stringify({ ...boardData, schemaVersion: this.schemaVersion }),
    );
  }

  async saveBoard(boardData: BoardData): Promise<void> {
    const key = boardKey(boardData.boardId);
    const value = JSON.stringify({
      ...boardData,
      schemaVersion: this.schemaVersion,
    });

    try {
      window.localStorage.setItem(key, value);

      // Cleanup IDB in background si exitoso, para no desperdiciar espacio
      idbDel(key, boardsIdbStore).catch(() => {});
    } catch (error: any) {
      if (isQuotaExceededError(error)) {
        console.warn(
          `BoardRepository: Quota exceeded for ${key}. Falling back to IndexedDB.`,
        );

        // 1. Intentar escribir payload completo en IndexedDB (si falla, propaga)
        await idbSet(key, value, boardsIdbStore);

        // 2. Escribir puntero a LocalStorage. Si esto falla (cuota 100%), propaga.
        // El payload quedó en IDB, lo cual es inofensivo.
        window.localStorage.setItem(
          key,
          JSON.stringify({ __idb_pointer: true }),
        );
      } else {
        throw error; // Propagar otros errores normalmente
      }
    }
  }

  async deleteBoard(boardId: BoardId): Promise<void> {
    const key = boardKey(boardId);
    safeRemove(key);
    await idbDel(key, boardsIdbStore).catch(() => {});
  }

  // ------------------------------------------------------------------
  // Transactions
  // ------------------------------------------------------------------

  async applyTransaction(
    initialGraph: BoardsGraph,
    patch: DeleteFolderPatch | DeletePointerPatch,
  ): Promise<BoardsGraph> {
    const deletedBoards =
      "deletedBoardIds" in patch ? patch.deletedBoardIds : [];

    // 1. Encontrar pointers físicamente contenidos en los boards a eliminar
    const discoveredPointerIds = new Set<string>();

    // IMPORTANTE: Según diseño (Alternativa A), leemos ANTES de borrar.
    for (const boardId of deletedBoards) {
      // Obtenemos el board *sin* usar el caché en este nivel (o si lo hubiera, nos fiamos).
      // Aquí estamos yendo directo al localStorage (o su equivalente lógico).
      const payload = await this.loadBoard(boardId);
      if (payload) {
        for (const el of payload.elements) {
          // Extraemos la metadata canónica
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const meta = (el as any).customData?.folderBoard;
          if (meta?.kind === "pointer" && typeof meta.pointerId === "string") {
            discoveredPointerIds.add(meta.pointerId);
          }
        }
      }
    }

    // 2. Extender el parche del Domain con estos hallazgos
    const finalPatch = { ...patch };
    finalPatch.deletedPointerIds = [
      ...patch.deletedPointerIds,
      ...Array.from(discoveredPointerIds),
    ];

    // 3. Aplicar el parche al grafo lógicamente usando la función pura
    const nextGraph = applyDeletePatch(initialGraph, finalPatch);

    // 4. Ejecutar el borrado FÍSICO best-effort
    for (const boardId of deletedBoards) {
      await this.deleteBoard(boardId);
    }

    // 5. Escribir el nuevo grafo
    await this.save(nextGraph);

    return nextGraph;
  }

  clonePhysicalBoardsSync(oldToNewBoardMap: Map<BoardId, BoardId>): void {
    const newIds = Array.from(oldToNewBoardMap.values());
    this.addActiveWrites(newIds);

    // 1. Verificamos que los destinos NO existan.
    for (const newBId of oldToNewBoardMap.values()) {
      const existing = safeGet(boardKey(newBId));
      if (existing !== null) {
        throw new Error(
          `clonePhysicalBoardsSync: Destination board ${newBId} already exists.`,
        );
      }
    }

    // 2. Cargamos todos los orígenes en memoria ANTES de empezar a escribir.
    const boardsToSave: BoardData[] = [];
    for (const [oldBId, newBId] of oldToNewBoardMap.entries()) {
      const srcPayload = this.loadBoardSync(oldBId);
      if (!srcPayload) {
        throw new Error(
          `clonePhysicalBoardsSync: Source board ${oldBId} not found.`,
        );
      }

      const clonedPayload: BoardData = JSON.parse(JSON.stringify(srcPayload));
      clonedPayload.boardId = newBId;
      clonedPayload.updatedAt = Date.now();

      boardsToSave.push(clonedPayload);
    }

    // 3. Persistimos best-effort síncrono.
    for (const payload of boardsToSave) {
      this.saveBoardSync(payload);
    }
  }

  async clonePhysicalBoards(
    oldToNewBoardMap: Map<BoardId, BoardId>,
  ): Promise<void> {
    return this.clonePhysicalBoardsSync(oldToNewBoardMap);
  }
}
