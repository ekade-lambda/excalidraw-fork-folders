import os
import glob

for path in ['excalidraw-app/tests/boards/pointerService.test.ts', 'excalidraw-app/tests/boards/pointer-regression.test.ts']:
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Simple replace
    content = content.replace('getAppState: () => ({}),', 'getAppState: () => ({}), getFiles: () => ({}), getName: () => "test", getSceneElementsIncludingDeleted: () => [],')
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

print("Updated pointer tests mocks")
