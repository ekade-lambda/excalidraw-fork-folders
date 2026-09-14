import type { BoardsGraph, BoardData } from "../types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";

export type ValidationResult =
  | { isValid: true }
  | { isValid: false; error: string };

export function validateProjectExport(input: any): ValidationResult {
  if (!input || typeof input !== "object") {
    return {
      isValid: false,
      error: "El archivo no contiene un objeto JSON válido.",
    };
  }

  if (input.format !== "ekade-project") {
    return { isValid: false, error: "El formato no es ekade-project." };
  }

  if (input.version !== 1) {
    return {
      isValid: false,
      error: "La versión del formato es incompatible.",
    };
  }

  const graph = input.graph;
  if (!graph || typeof graph !== "object") {
    return { isValid: false, error: "Falta el graph principal del proyecto." };
  }

  if (!graph.rootFolderId || typeof graph.rootFolderId !== "string") {
    return { isValid: false, error: "Falta rootFolderId válido en el graph." };
  }

  if (!graph.folders || typeof graph.folders !== "object") {
    return {
      isValid: false,
      error: "Falta el diccionario de folders en el graph.",
    };
  }

  if (!graph.boards || typeof graph.boards !== "object") {
    return {
      isValid: false,
      error: "Falta el diccionario de boards en el graph.",
    };
  }

  if (!graph.pointers || typeof graph.pointers !== "object") {
    return {
      isValid: false,
      error: "Falta el diccionario de pointers en el graph.",
    };
  }

  const boardsData = input.boardsData;
  if (!boardsData || typeof boardsData !== "object") {
    return { isValid: false, error: "Falta boardsData en la exportación." };
  }

  // 1. Validar integridad de rootFolderId
  if (!graph.folders[graph.rootFolderId]) {
    return {
      isValid: false,
      error: `El rootFolderId '${graph.rootFolderId}' no existe en folders.`,
    };
  }

  // 2. Validar folders
  for (const [folderId, folder] of Object.entries(graph.folders) as [
    string,
    any,
  ][]) {
    if (folder.id !== folderId) {
      return {
        isValid: false,
        error: `Folder ${folderId} tiene ID inconsistente.`,
      };
    }
    if (folder.parentId !== null && folder.parentId !== undefined) {
      if (!graph.folders[folder.parentId]) {
        return {
          isValid: false,
          error: `Folder ${folderId} apunta a un parentId inexistente.`,
        };
      }
    }
    if (!folder.boardId) {
      return {
        isValid: false,
        error: `Folder ${folderId} no tiene un boardId asociado.`,
      };
    }
    if (!graph.boards[folder.boardId]) {
      return {
        isValid: false,
        error: `Folder ${folderId} apunta al board ${folder.boardId} que no existe en el graph.`,
      };
    }
  }

  // 3. Validar pointers
  for (const [pointerId, pointer] of Object.entries(graph.pointers) as [
    string,
    any,
  ][]) {
    if (pointer.id !== pointerId) {
      return {
        isValid: false,
        error: `Pointer ${pointerId} tiene ID inconsistente.`,
      };
    }
    if (!pointer.targetFolderId || !graph.folders[pointer.targetFolderId]) {
      return {
        isValid: false,
        error: `Pointer ${pointerId} apunta a un targetFolderId inexistente.`,
      };
    }
  }

  // 4. Validar metadata de Boards y existencia en boardsData
  for (const [boardId, boardMeta] of Object.entries(graph.boards) as [
    string,
    any,
  ][]) {
    if (boardMeta.id !== boardId) {
      return {
        isValid: false,
        error: `Board metadata ${boardId} tiene ID inconsistente.`,
      };
    }

    const boardData = boardsData[boardId];
    if (!boardData) {
      return {
        isValid: false,
        error: `Falta el contenido (boardsData) para el board ${boardId}.`,
      };
    }

    if (boardData.boardId !== boardId) {
      return {
        isValid: false,
        error: `El contenido del board ${boardId} tiene un ID interno inconsistente.`,
      };
    }

    if (!Array.isArray(boardData.elements)) {
      return {
        isValid: false,
        error: `El board ${boardId} tiene elements inválidos o ausentes.`,
      };
    }

    if (!boardData.files || typeof boardData.files !== "object") {
      return {
        isValid: false,
        error: `El board ${boardId} tiene files inválidos o ausentes.`,
      };
    }

    // 5. Validar archivos (imágenes) reales
    for (const [fileId, fileInfo] of Object.entries(boardData.files) as [
      string,
      any,
    ][]) {
      if (typeof fileInfo !== "object" || !fileInfo) {
        return {
          isValid: false,
          error: `Board ${boardId}: El file ${fileId} está corrupto.`,
        };
      }
      if (typeof fileInfo.mimeType !== "string" || !fileInfo.mimeType) {
        return {
          isValid: false,
          error: `Board ${boardId}: El file ${fileId} no tiene un mimeType válido.`,
        };
      }
      if (
        typeof fileInfo.dataURL !== "string" ||
        !fileInfo.dataURL.startsWith("data:")
      ) {
        return {
          isValid: false,
          error: `Board ${boardId}: El file ${fileId} no tiene un dataURL válido.`,
        };
      }
    }
  }

  // 6. Asegurar que boardsData no tenga basura adicional al graph
  for (const boardId of Object.keys(boardsData)) {
    if (!graph.boards[boardId]) {
      return {
        isValid: false,
        error: `Existe un board (${boardId}) en boardsData que no está indexado en el graph.`,
      };
    }
  }

  return { isValid: true };
}

import type { BoardRepository } from "../repository/BoardRepository";

/**
 * Persiste un proyecto previamente validado en el repositorio local.
 * NO llama a esta función con datos no validados.
 *
 * Semántica de Importación (Replace Project):
 * - El proyecto importado reemplaza completamente al proyecto local.
 * - Los BoardId, FolderId y demás identificadores se conservan exactamente.
 * - Si un BoardId importado ya existe, se sobrescribe en el lugar.
 * - Cualquier board local antiguo que ya no esté en el graph importado será recolectado (eliminado) por el Garbage Collector.
 *
 * Limitación de Atomicidad (Física):
 * - Si ocurre un error de almacenamiento (ej. QuotaExceeded) en medio del bucle
 *   de saveBoard(), el proceso aborta antes de publicar el nuevo Graph maestro.
 * - Esto evita corromper el Graph, pero significa que algunos payloads locales pueden
 *   haber sido parcialmente sobrescritos con versiones nuevas. Es una limitación
 *   física nativa de LocalStorage/IndexedDB que no soporta transacciones.
 */
export async function importProject(
  repo: BoardRepository,
  validatedProject: any,
): Promise<void> {
  const { graph, boardsData } = validatedProject;
  const boardIds = Object.keys(boardsData);

  // 1 y 2. Escribir payloads (BoardData) y hacer commit del Graph de forma protegida
  await repo.runWithActiveWrites(boardIds, async () => {
    for (const boardId of boardIds) {
      await repo.saveBoard(boardsData[boardId]);
    }

    // Si todos los saveBoard tienen éxito, actualizamos el índice maestro.
    await repo.save(graph);
  });

  // 3. Limpiar restos del proyecto anterior (boards que no están en el nuevo graph)
  try {
    await repo.runGarbageCollector(graph);
  } catch (error) {
    // Si el GC falla (ej. error de I/O en IndexedDB), el nuevo proyecto
    // ya está publicado y es 100% funcional. Solo quedan archivos huérfanos.
    console.warn(
      "BoardRepository: El Garbage Collector falló tras la importación.",
      error,
    );
  }
}
