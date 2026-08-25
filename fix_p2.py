import os

path_svc = 'excalidraw-app/boards/host/folderService.ts'
with open(path_svc, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('name: string;', 'name?: string;')
content = content.replace('const { repo, excalidrawAPI, parentFolderId, name, sceneX, sceneY } = opts;', 'const { repo, excalidrawAPI, parentFolderId, sceneX, sceneY } = opts;')

logic = """
  // Problema 2: Numeración monotónica
  let finalName = opts.name;
  if (!finalName) {
    graph.folderCounter = (graph.folderCounter || 0) + 1;
    finalName = `Carpeta ${graph.folderCounter}`;
  }

  // Dominio: crea folder + board (respeta invariantes del grafo).
  const addResult = addFolder(graph, { name: finalName, parentId: parentFolderId });
"""
content = content.replace(
    '  // Dominio: crea folder + board (respeta invariantes del grafo).\n  const addResult = addFolder(graph, { name, parentId: parentFolderId });',
    logic
)
content = content.replace('name,', 'name: finalName,')

with open(path_svc, 'w', encoding='utf-8') as f:
    f.write(content)

path_app = 'excalidraw-app/App.tsx'
with open(path_app, 'r', encoding='utf-8') as f:
    content_app = f.read()

import re
content_app = re.sub(
    r'name:\s*`Carpeta \$\{Math\.floor\(Math\.random\(\)\s*\*\s*1000\)\}`,',
    '',
    content_app
)

with open(path_app, 'w', encoding='utf-8') as f:
    f.write(content_app)

print("Updated folderService.ts and App.tsx")
