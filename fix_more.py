import os

path = 'excalidraw-app/tests/boards/folderService.test.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Make the mock use vi.fn properly
content = content.replace(
    'getSceneElementsIncludingDeleted: () => [],',
    'getSceneElementsIncludingDeleted: vi.fn(() => []),',
)
content = content.replace(
    'getSceneElementsIncludingDeleted: any };',
    'getSceneElementsIncludingDeleted: any; getFiles: any; getName: any };'
)

# And in tests, for P2, we mock addFiles but not getFiles etc. Wait, createFolder calls saveCurrentBoard now!
# P2 fails with undefined because folderCounter is not incremented?
# Let's check folderService.ts where folderCounter is incremented.
# `graph.folderCounter = (graph.folderCounter || 0) + 1;` 
# Why was it undefined? Ah! `updatedGraph!.folderCounter` was undefined?
# Wait! In test 2, `createFolder` calls `saveCurrentBoard`? No, because `parentBoardId !== currentBoardId` (currentBoardId is null).
# If `folderCounter` is undefined, maybe my logic in `folderService.ts` was inside `if (!finalName)`?
# And in my test I provided NO name? `createFolder({ repo, excalidrawAPI, parentFolderId: rootFolderId, sceneX: 0, sceneY: 0 })`
# Wait! `folderService.ts` has `name: string;` in its signature originally. I changed it to `name?: string;`
# But if it's undefined, why is the counter not updated?
# Let's fix the vi.fn issue first.

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

# Fix pointer-regression
path2 = 'excalidraw-app/tests/boards/pointer-regression.test.ts'
with open(path2, 'r', encoding='utf-8') as f:
    content2 = f.read()
    
# Find the mock API creation in pointer-regression.test.ts
content2 = content2.replace('addFiles: () => {},', 'addFiles: () => {},\n        getSceneElementsIncludingDeleted: () => elements,\n        getName: () => "test",\n        getFiles: () => ({}),')

with open(path2, 'w', encoding='utf-8') as f:
    f.write(content2)

print("Fixed more mocks")
