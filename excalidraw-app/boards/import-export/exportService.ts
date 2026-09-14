import type { BoardRepository } from "../repository/BoardRepository";
import type { BoardData, BoardsGraph } from "../types";

export interface EkadeProjectExport {
  format: "ekade-project";
  version: 1;
  graph: BoardsGraph;
  boardsData: Record<string, BoardData>;
}

/**
 * Recopila todos los datos del proyecto usando el BoardRepository proporcionado.
 * Esta funcion es pura (no toca localStorage directamente ni el DOM).
 */
export async function buildProjectExport(
  repo: BoardRepository,
): Promise<EkadeProjectExport | null> {
  const graph = await repo.load();
  if (!graph) {
    return null;
  }

  const boardsData: Record<string, BoardData> = {};
  
  // Extraemos todos los boards que esten en el grafo
  const boardIds = Object.keys(graph.boards);
  for (const boardId of boardIds) {
    const data = await repo.loadBoard(boardId);
    if (data) {
      boardsData[boardId] = data;
    } else {
      console.warn(`Board missing during export: ${boardId}`);
    }
  }

  return {
    format: "ekade-project",
    version: 1,
    graph,
    boardsData,
  };
}

/**
 * Dispara la descarga del JSON en el navegador.
 */
export function downloadProjectExport(project: EkadeProjectExport, filename: string = "ekade-project.json") {
  const jsonStr = JSON.stringify(project);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
