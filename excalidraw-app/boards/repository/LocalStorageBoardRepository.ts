import { createRootGraph } from "../domain/graph";
import { STORAGE_KEYS } from "../../app_constants";

import { BOARD_SYSTEM_SCHEMA_VERSION } from "../types";

import type { BoardRepository } from "./BoardRepository";
import type { BoardData, BoardId, BoardsGraph } from "../types";

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

  async load(): Promise<BoardsGraph | null> {
    const raw = safeGet(STORAGE_KEYS.BOARDS_GRAPH);
    if (raw == null) {
      return null;
    }

    const parsed = parseJsonObject<BoardsGraph>(raw);
    if (!parsed || !shapeIsGraph(parsed)) {
      // Gráfica corrupta/shape inválido → backup + raíz nueva.
      safeSet(STORAGE_KEYS.BOARDS_GRAPH_BROKEN, raw);
      safeRemove(STORAGE_KEYS.BOARDS_GRAPH);
      console.warn(
        "BoardRepository: BoardsGraph corrupto. Backup en *_BROKEN; se crea raíz nueva.",
      );
      return createRootGraph();
    }

    // Migraciones encadenadas vN → N+1 hasta la versión actual.
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

  async save(graph: BoardsGraph): Promise<void> {
    safeSet(
      STORAGE_KEYS.BOARDS_GRAPH,
      JSON.stringify({ ...graph, schemaVersion: this.schemaVersion }),
    );
  }

  // ------------------------------------------------------------------
  // BoardData
  // ------------------------------------------------------------------

  async loadBoard(boardId: BoardId): Promise<BoardData | null> {
    const raw = safeGet(boardKey(boardId));
    if (raw == null) {
      return null;
    }

    const parsed = parseJsonObject<BoardData>(raw);
    if (!parsed || !shapeIsBoardData(parsed)) {
      // Board payload corrupto → reconstruir vacío (no romper el grafo).
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

  async saveBoard(boardData: BoardData): Promise<void> {
    safeSet(
      boardKey(boardData.boardId),
      JSON.stringify({ ...boardData, schemaVersion: this.schemaVersion }),
    );
  }

  async deleteBoard(boardId: BoardId): Promise<void> {
    safeRemove(boardKey(boardId));
  }
}
