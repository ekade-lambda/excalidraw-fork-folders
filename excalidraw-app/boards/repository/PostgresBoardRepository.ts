import type { BoardData, BoardId, BoardsGraph } from "../types";
import { BOARD_SYSTEM_SCHEMA_VERSION } from "../types";
import type { BoardRepository } from "./BoardRepository";
import type { DeleteFolderPatch, DeletePointerPatch } from "../domain/delete";
import { applyDeletePatch } from "../domain/delete";

const BRIDGE_URL = "http://127.0.0.1:3005";

export class PostgresBoardRepository implements BoardRepository {
  readonly schemaVersion = BOARD_SYSTEM_SCHEMA_VERSION;
  private activeWrites = 0;

  async load(): Promise<BoardsGraph | null> {
    const res = await fetch(`${BRIDGE_URL}/api/graph`);
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`Failed to load graph: ${res.statusText}`);
    }
    const data = await res.json();
    return data; // already parsed!
  }

  async save(graph: BoardsGraph): Promise<void> {
    const res = await fetch(`${BRIDGE_URL}/api/graph`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(graph),
    });
    if (!res.ok) throw new Error(`Failed to save graph: ${res.statusText}`);
  }

  async loadBoard(boardId: BoardId): Promise<BoardData | null> {
    const res = await fetch(`${BRIDGE_URL}/api/boards/${boardId}`);
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`Failed to load board: ${res.statusText}`);
    }
    const data = await res.json();
    return data;
  }

  async saveBoard(boardData: BoardData): Promise<void> {
    const res = await fetch(`${BRIDGE_URL}/api/boards/${boardData.boardId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(boardData),
    });
    if (!res.ok) throw new Error(`Failed to save board: ${res.statusText}`);
  }

  async deleteBoard(boardId: BoardId): Promise<void> {
    const res = await fetch(`${BRIDGE_URL}/api/boards/${boardId}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`Failed to delete board: ${res.statusText}`);
  }

  async applyTransaction(
    initialGraph: BoardsGraph,
    patch: DeleteFolderPatch | DeletePointerPatch,
  ): Promise<BoardsGraph> {
    const deletedBoards = "deletedBoardIds" in patch ? patch.deletedBoardIds : [];
    
    const discoveredPointerIds = new Set<string>();

    for (const boardId of deletedBoards) {
      const payload = await this.loadBoard(boardId);
      if (payload) {
        for (const el of payload.elements) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const meta = (el as any).customData?.folderBoard;
          if (meta?.kind === "pointer" && typeof meta.pointerId === "string") {
            discoveredPointerIds.add(meta.pointerId);
          }
        }
      }
    }

    const allDeletedPointers = Array.from(
      new Set([...patch.deletedPointerIds, ...discoveredPointerIds]),
    );

    const fullPatch =
      "deletedFolderIds" in patch
        ? {
            deletedFolderIds: patch.deletedFolderIds,
            deletedBoardIds: patch.deletedBoardIds,
            deletedPointerIds: allDeletedPointers,
          }
        : { deletedPointerIds: allDeletedPointers };

    const nextGraph = applyDeletePatch(initialGraph, fullPatch);

    const res = await fetch(`${BRIDGE_URL}/api/transaction/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newGraph: nextGraph,
        patch: fullPatch
      }),
    });

    if (!res.ok) throw new Error(`Failed to apply transaction: ${res.statusText}`);

    return nextGraph;
  }

  async clonePhysicalBoards(
    oldToNewBoardMap: Map<BoardId, BoardId>,
  ): Promise<void> {
    const plainMap: Record<string, string> = {};
    for (const [oldId, newId] of oldToNewBoardMap.entries()) {
      plainMap[oldId] = newId;
    }

    const res = await fetch(`${BRIDGE_URL}/api/boards/clone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldToNewBoardMap: plainMap }),
    });

    if (!res.ok) {
      throw new Error(`Failed to clone physical boards: ${res.statusText}`);
    }
  }

  async runWithActiveWrites<T>(
    boardIds: BoardId[],
    operation: () => Promise<T>,
  ): Promise<T> {
    this.activeWrites++;
    try {
      return await operation();
    } finally {
      this.activeWrites--;
    }
  }

  async runGarbageCollector(graph: BoardsGraph): Promise<void> {
    // No-op en Fase 4
  }
}
