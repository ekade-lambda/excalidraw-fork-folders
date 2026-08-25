import os
path = "excalidraw-app/boards/host/folderService.ts"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

old_logic = """  // Escribimos el board vacío primero
  await repo.saveBoard({
    schemaVersion: 1,
    boardId,
    elements: [],
    files: {},
    viewport: null,
    updatedAt: Date.now(),
  });

  // Modificamos el padre (el tablero actual)
  await repo.saveBoard({
    ...parentData,
    elements: nextElements,
    files: nextFiles,
    updatedAt: Date.now(),
  });

  // Guardamos el grafo
  await repo.save(nextGraph);"""

new_logic = """  await repo.runWithActiveWrites([boardId], async () => {
    // Escribimos el board vacío primero
    await repo.saveBoard({
      schemaVersion: 1,
      boardId,
      elements: [],
      files: {},
      viewport: null,
      updatedAt: Date.now(),
    });

    // Modificamos el padre (el tablero actual)
    await repo.saveBoard({
      ...parentData,
      elements: nextElements,
      files: nextFiles,
      updatedAt: Date.now(),
    });

    // Guardamos el grafo
    await repo.save(nextGraph);
  });"""

content = content.replace(old_logic, new_logic)

with open(path, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print("Patched folderService.ts")
