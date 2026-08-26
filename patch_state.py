import os
path = "excalidraw-app/boards/host/boardState.ts"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

old_logic = """export const boardsReadyAtom = atom<boolean>(false);

/** Historial de navegación (Fase 5). */"""

new_logic = """export const boardsReadyAtom = atom<boolean>(false);
export const graphVersionAtom = atom<number>(0);

/** Historial de navegación (Fase 5). */"""

content = content.replace(old_logic, new_logic)

old_logic2 = """  setReady: (ready: boolean) => appJotaiStore.set(boardsReadyAtom, ready),

  getCurrentBoardId: () => appJotaiStore.get(currentBoardIdAtom),"""

new_logic2 = """  setReady: (ready: boolean) => appJotaiStore.set(boardsReadyAtom, ready),
  incrementGraphVersion: () => appJotaiStore.set(graphVersionAtom, (v) => v + 1),

  getCurrentBoardId: () => appJotaiStore.get(currentBoardIdAtom),"""

content = content.replace(old_logic2, new_logic2)

old_logic3 = """  return {
    currentBoardId: useAtomValue(currentBoardIdAtom),
    currentFolderId: useAtomValue(currentFolderIdAtom),
    boardData: useAtomValue(boardDataAtom),
    ready: useAtomValue(boardsReadyAtom),
    navigationHistory: useAtomValue(navigationHistoryAtom),
  };"""

new_logic3 = """  return {
    currentBoardId: useAtomValue(currentBoardIdAtom),
    currentFolderId: useAtomValue(currentFolderIdAtom),
    boardData: useAtomValue(boardDataAtom),
    ready: useAtomValue(boardsReadyAtom),
    navigationHistory: useAtomValue(navigationHistoryAtom),
    graphVersion: useAtomValue(graphVersionAtom),
  };"""

content = content.replace(old_logic3, new_logic3)

with open(path, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print("Patched boardState.ts")
