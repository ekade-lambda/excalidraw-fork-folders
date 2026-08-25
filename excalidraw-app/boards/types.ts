/**
 * Board System — modelo de dominio (Fase 0).
 *
 * Este archivo define el contrato/estado del Board System. Solo se permiten
 * importaciones de TIPO (type-only) para BoardData, tal y como autoriza la
 * especificación (§13): así el payload del board referencia el tipo canónico
 * de elemento/image de Excalidraw sin arrastrar runtime del core al dominio.
 */

import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";

/** Identidad GLOBAL de una carpeta del árbol (mic-ubicación oficial). */
export type FolderId = string;
/** Identidad GLOBAL de una referencia/pointer (namespace independiente). */
export type FolderPointerId = string;
/** Identidad GLOBAL de un board (contenido de una carpeta real, 1:1). */
export type BoardId = string;

/** Versión de esquema. Desde v1 en el grafo y en cada BoardData. */
export const BOARD_SYSTEM_SCHEMA_VERSION = 1;

/** Viewport mínimo restaurable (NUNCA el AppState completo). */
export interface BoardViewport {
  scrollX: number;
  scrollY: number;
  zoom: number;
}

/** Board = contenido de una Folder (relación 1:1 mediada por Folder.boardId). */
export interface Board {
  id: BoardId;
  /** Nombre legible (duplicado derivado; NO fuente de verdad de la jerarquía). */
  name: string;
  /** La Folder dueña de este board (1:1). */
  rootFolderId: FolderId;
  createdAt: number;
  updatedAt: number;
  viewport?: BoardViewport | null;
}

/** Node de ubicación real del sistema de archivos. */
export interface Folder {
  id: FolderId;
  /** NUNCA es identidad. */
  name: string;
  /** Icono custom (imagen dataURL) o ausente (default). */
  icon?: { dataUrl: string } | null;
  /** null únicamente para la raíz. una carpeta real tiene UNA ubicación. */
  parentId: FolderId | null;
  /** 1:1 — el contenido de esta carpeta. */
  boardId: BoardId;
  createdAt: number;
  updatedAt: number;
}

/** Referencia independiente a una carpeta real. NO crea folder ni board. */
export interface FolderPointer {
  id: FolderPointerId;
  /** → carpeta REAL (distinta del id del pointer). */
  targetFolderId: FolderId;
  /** Etiqueta visual opcional (p. ej. "↗ Humano"). */
  name?: string | null;
  /** Override visual opcional del pointer. */
  icon?: string | null;
  createdAt: number;
}

/** Grafo global: árbol de folders + grafo de pointers + índice de boards. */
export interface BoardsGraph {
  schemaVersion: number;
  rootFolderId: FolderId;
  folders: Record<FolderId, Folder>;
  pointers: Record<FolderPointerId, FolderPointer>;
  boards: Record<BoardId, Board>;
  /** Restaura el board abierto al recargar. */
  lastOpenBoardId: BoardId | null;
  /** Contador monotónico para generación de nombres por defecto. */
  folderCounter?: number;
}

/** Contenido persistido de un board (Fase 1+). Dominio puro: solo tipo. */
export interface BoardData {
  schemaVersion: number;
  boardId: BoardId;
  elements: ExcalidrawElement[];
  files: BinaryFiles;
  viewport?: BoardViewport | null;
  name: string;
  updatedAt: number;
}

/** Navegación (los separación de parentId). Solo tipo en Fase 2. */
export type NavEntry = {
  kind: "board" | "folder";
  id: string;
  boardId: BoardId;
};
export interface NavigationHistory {
  back: NavEntry[];
  forward: NavEntry[];
}
