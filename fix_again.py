import os
path = 'excalidraw-app/boards/domain/graph.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add folderCounter to cloneGraph
if 'folderCounter: graph.folderCounter' not in content:
    content = content.replace(
        'lastOpenBoardId: graph.lastOpenBoardId ?? null,\n  };',
        'lastOpenBoardId: graph.lastOpenBoardId ?? null,\n    folderCounter: graph.folderCounter,\n  };'
    )

# Add folderCounter to createRootGraph
if 'folderCounter: 0' not in content:
    content = content.replace(
        'lastOpenBoardId: rootBoardId,\n  };',
        'lastOpenBoardId: rootBoardId,\n    folderCounter: 0,\n  };'
    )

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

path2 = 'excalidraw-app/tests/boards/folderService.test.ts'
with open(path2, 'r', encoding='utf-8') as f:
    content2 = f.read()

# Fix mock issues
content2 = content2.replace(
    'getSceneElementsIncludingDeleted: () => [],',
    'getSceneElementsIncludingDeleted: vi.fn(() => []),',
)
content2 = content2.replace(
    '(excalidrawAPI.getSceneElementsIncludingDeleted as any).mockReturnValue([',
    'excalidrawAPI.getSceneElementsIncludingDeleted = vi.fn().mockReturnValue(['
)

with open(path2, 'w', encoding='utf-8') as f:
    f.write(content2)

print("Fixed cloneGraph and mocks again")
