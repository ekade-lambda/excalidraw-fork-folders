import os
path = 'excalidraw-app/tests/boards/workspace.test.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace graph.boards assignment with complete cleanups
content = content.replace(
    'const graph = createRootGraph();',
    'const graph = createRootGraph(); graph.boards = {};'
)
content = content.replace(
    'const bundleGraph = createRootGraph();',
    'const bundleGraph = createRootGraph(); bundleGraph.boards = {};'
)
content = content.replace(
    'const oldGraph = createRootGraph();',
    'const oldGraph = createRootGraph(); oldGraph.boards = {};'
)
content = content.replace(
    'const valid = {\n      schemaVersion: 1,\n      graph: { boards: {}, folders: {}, rootFolderId: "f" },',
    'const valid = {\n      schemaVersion: 1,\n      graph: { boards: {}, folders: {}, rootFolderId: "f" } as any,'
)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print("Updated tests")
