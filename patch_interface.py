import os
path = "excalidraw-app/boards/repository/BoardRepository.ts"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

old_str = 'clonePhysicalBoards(oldToNewBoardMap: Map<BoardId, BoardId>): Promise<void>;'
new_str = old_str + '\n  runWithActiveWrites<T>(boardIds: BoardId[], operation: () => Promise<T>): Promise<T>;\n  runGarbageCollector(graph: BoardsGraph): Promise<void>;'
content = content.replace(old_str, new_str)

with open(path, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print("Patched BoardRepository.ts")
