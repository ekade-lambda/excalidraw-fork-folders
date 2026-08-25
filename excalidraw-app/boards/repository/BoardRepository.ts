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
import type { DeleteFolderPatch, DeletePointerPatch } from "../domain/delete";

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

  /**
   * Ejecuta una transacción de borrado transaccional best-effort.
   * 1. Lee boards eliminados buscando Pointers huérfanos físicos.
   * 2. Aplica el parche lógico al graph (incorporando esos pointers).
   * 3. Borra los boards físicos.
   * 4. Persiste el graph.
   */
  applyTransaction(
    initialGraph: BoardsGraph,
    patch: DeleteFolderPatch | DeletePointerPatch,
  ): Promise<BoardsGraph>;

  /**
   * Clona físicamente una colección de Boards.
   * Por cada entrada en el map, lee el Board origen, hace una copia independiente,
   * le asigna el nuevo boardId y lo guarda.
   * Si un origen no existe, lanza un error.
   * Si el destino ya existe, lanza un error.
   * Nota (Atomicidad): En la implementación actual (LocalStorage) esto es best-effort.
   * Si falla a la mitad, algunos boards nuevos quedarán escritos. No modifica el Graph.
   */
  clonePhysicalBoards(oldToNewBoardMap: Map<BoardId, BoardId>): Promise<void>;
  runWithActiveWrites<T>(
    boardIds: BoardId[],
    operation: () => Promise<T>,
  ): Promise<T>;
  runGarbageCollector(graph: BoardsGraph): Promise<void>;

  // ------------------------------------------------------------------
  // Synchronous Capabilities (Optional)
  // ------------------------------------------------------------------

  /** Carga la graph global de manera síncrona si el repositorio lo soporta. */
  loadSync?(): BoardsGraph | null;

  /** Persiste la graph global de manera síncrona si el repositorio lo soporta. */
  saveSync?(graph: BoardsGraph): void;

  /** Clona físicamente una colección de Boards de manera síncrona si el repositorio lo soporta. */
  clonePhysicalBoardsSync?(oldToNewBoardMap: Map<BoardId, BoardId>): void;
}
