/**
 * Board System — estado reactivo (jotai del host, Fase 2).
 *
 * Guarda el estado MÍNIMO del Board System fuera del AppState de Excalidraw:
 *   - currentBoardId  / currentFolderId  (board actualmente activo)
 *   - boardData (BoardData cargado del board actual) — preparado para Fase 4
 *   - ready (boot completado)
 *
 * Usa el store imperativo de la app (appJotaiStore) para poder leer/escribir
 * desde fuera de componentes React (ej. boardService durante el boot).
 */

import { atom, appJotaiStore, useAtomValue } from "../../app-jotai";

import type { BoardData, BoardId, FolderId, NavigationHistory } from "../types";

export const currentBoardIdAtom = atom<BoardId | null>(null);
export const currentFolderIdAtom = atom<FolderId | null>(null);
export const boardDataAtom = atom<BoardData | null>(null);
export const boardsReadyAtom = atom<boolean>(false);

/** Historial de navegación (Fase 5). */
export const navigationHistoryAtom = atom<NavigationHistory>({
  back: [],
  forward: [],
});

/** Acciones imperativas sobre el store de la app (usables fuera de React). */
export const boardsStoreActions = {
  setCurrentBoardId: (id: BoardId | null) =>
    appJotaiStore.set(currentBoardIdAtom, id),
  setCurrentFolderId: (id: FolderId | null) =>
    appJotaiStore.set(currentFolderIdAtom, id),
  setBoardData: (data: BoardData | null) =>
    appJotaiStore.set(boardDataAtom, data),
  setReady: (ready: boolean) => appJotaiStore.set(boardsReadyAtom, ready),

  getCurrentBoardId: () => appJotaiStore.get(currentBoardIdAtom),
  getCurrentFolderId: () => appJotaiStore.get(currentFolderIdAtom),
  getBoardData: () => appJotaiStore.get(boardDataAtom),
  getReady: () => appJotaiStore.get(boardsReadyAtom),

  setNavigationHistory: (history: NavigationHistory) =>
    appJotaiStore.set(navigationHistoryAtom, history),
  getNavigationHistory: () => appJotaiStore.get(navigationHistoryAtom),
};

/** Hook para leer el estado del Board System desde componentes. */
export const useBoardsState = () => {
  return {
    currentBoardId: useAtomValue(currentBoardIdAtom),
    currentFolderId: useAtomValue(currentFolderIdAtom),
    boardData: useAtomValue(boardDataAtom),
    ready: useAtomValue(boardsReadyAtom),
    navigationHistory: useAtomValue(navigationHistoryAtom),
  };
};
