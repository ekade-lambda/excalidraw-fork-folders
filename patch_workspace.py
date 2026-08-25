import os
path = "excalidraw-app/boards/host/workspace.ts"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

old_logic = """  // Commit Phase 1: Write all physical boards
  for (const board of Object.values(bundle.boards)) {
    await repo.saveBoard(board);
  }

  // Commit Phase 2: Write new graph (atomic switch of active workspace)
  await repo.save(bundle.graph);"""

new_logic = """  // Commit Phase 1: Write all physical boards
  const newBoardIds = Object.values(bundle.boards).map(b => b.boardId);
  await repo.runWithActiveWrites(newBoardIds, async () => {
    for (const board of Object.values(bundle.boards)) {
      await repo.saveBoard(board);
    }

    // Commit Phase 2: Write new graph (atomic switch of active workspace)
    await repo.save(bundle.graph);
  });"""

content = content.replace(old_logic, new_logic)

with open(path, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print("Patched workspace.ts")
