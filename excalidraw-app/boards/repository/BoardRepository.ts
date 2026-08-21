/**
 * BoardRepository — abstracción de persistencia del Board System.
 *
 * La implementación local (LocalStorageBoardRepository) escribe en
 * localStorage. La interfaz está pensada para permitir después un
 * PostgresBoardRepository sin tocar dominio ni UI.
 *
 * Nota de alcance (Fase 1): se exponen primitivas de grafo y de BoardData.
 * La transacción compuesta de la spec (delete/copy en una sola escritura)
 * se formará a nivel de servicio a partir de estas primitivas; la interfaz
 * no inventa una firma de transacción genérica temprana.
 *
 * Todos los métodos son async para permitir un backend remoto futuro.
 */

import type { BoardData, BoardId, BoardsGraph } from "../types";

export interface BoardRepository {
  /** Versión de esquema de la implementación. */
  readonly schemaVersion: number;

  /** Carga la graph global. null si no existe / no recuperable. */
  load(): Promise<BoardsGraph | null>;

  /** Persiste la graph global (con su schemaVersion). */
  save(graph: BoardsGraph): Promise<void>;

  /** Carga el payload de un board. null si no existe/corrupto. */
  loadBoard(boardId: BoardId): Promise<BoardData | null>;

  /** Persiste el payload de un board en su clave. */
  saveBoard(boardData: BoardData): Promise<void>;

  /** Elimina el payload de un board del storage. no-op si no existe. */
  deleteBoard(boardId: BoardId): Promise<void>;
}
