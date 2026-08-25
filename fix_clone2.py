import os
path = 'excalidraw-app/boards/domain/graph.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    '      lastOpenBoardId: graph.lastOpenBoardId ?? null,\n    };',
    '      lastOpenBoardId: graph.lastOpenBoardId ?? null,\n      folderCounter: graph.folderCounter,\n    };'
)
content = content.replace(
    '      lastOpenBoardId: rootBoardId,\n    };',
    '      lastOpenBoardId: rootBoardId,\n      folderCounter: 0,\n    };'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Fixed cloneGraph properly")
