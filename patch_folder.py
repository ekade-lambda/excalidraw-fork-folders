import os

path = "excalidraw-app/boards/host/folderService.ts"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

import_delete = "import { prepareDeleteFolderPatch, applyDeletePatch } from \"../domain/delete\";"

# Insert imports
if import_delete not in content:
    content = content.replace(
        "import { addFolder } from \"../domain/graph\";",
        "import { addFolder } from \"../domain/graph\";\n" + import_delete
    )

new_func = """
export async function deleteFolder(opts: {
  repo: BoardRepository;
  excalidrawAPI: ExcalidrawImperativeAPI;
  folderId: FolderId;
}): Promise<{ ok: boolean; reason?: string }> {
  const { repo, excalidrawAPI, folderId } = opts;

  // 1. Cargar el graph actual
  const graph = await repo.load();
  if (!graph) {
    return { ok: false, reason: "no-graph" };
  }

  // 2. Calcular parche de borrado
  const patchRes = prepareDeleteFolderPatch(graph, folderId);
  if (!patchRes.ok) {
    return { ok: false, reason: patchRes.reason };
  }

  // 3. Aplicar parche estructural atómico
  const nextGraph = applyDeletePatch(graph, patchRes.patch);

  // 4. Persistir el graph (dispara evento storage para otras pestañas)
  await repo.save(nextGraph);

  // 5. Limpieza visual síncrona en la pestaña actual
  const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
  const folderVisual = findFolderVisual(elements, folderId);
  
  if (folderVisual && folderVisual.primary) {
    // Filtrar los elementos primarios y de texto para eliminarlos visualmente
    const idsToRemove = new Set([
      folderVisual.primary.id,
      folderVisual.text?.id,
    ].filter(Boolean));

    const nextElements = elements.filter((e) => !idsToRemove.has(e.id));

    // Forzar actualización inmediata para que quede registrado visualmente.
    // Esto crea un paso en el Undo Stack nativo de Excalidraw.
    excalidrawAPI.updateScene({
      elements: nextElements,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  }

  return { ok: true };
}
"""

if "export async function deleteFolder" not in content:
    content += "\n" + new_func

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
