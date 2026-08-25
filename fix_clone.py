import os
path = 'excalidraw-app/boards/domain/graph.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    '      pointers,\n      boards,\n      lastOpenBoardId: graph.lastOpenBoardId,\n    };',
    '      pointers,\n      boards,\n      lastOpenBoardId: graph.lastOpenBoardId,\n      folderCounter: graph.folderCounter,\n    };'
)
# Check if it replaced
if 'folderCounter: graph.folderCounter' in content:
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Fixed cloneGraph")
else:
    print("Failed to fix cloneGraph")
