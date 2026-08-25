import os
path = 'excalidraw-app/App.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('initialName = el.text || "";', 'initialName = (el as any).text || "";')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

path2 = 'excalidraw-app/tests/boards/folderService.test.ts'
with open(path2, 'r', encoding='utf-8') as f:
    content2 = f.read()

content2 = content2.replace('excalidrawAPI.getSceneElementsIncludingDeleted.mockReturnValue', '(excalidrawAPI.getSceneElementsIncludingDeleted as any).mockReturnValue')
content2 = content2.replace('excalidrawAPI.updateScene.mock.calls', '(excalidrawAPI.updateScene as any).mock.calls')

with open(path2, 'w', encoding='utf-8') as f:
    f.write(content2)

path3 = 'excalidraw-app/tests/boards/pointerService.test.ts'
with open(path3, 'r', encoding='utf-8') as f:
    content3 = f.read()

content3 = content3.replace('getSceneElementsIncludingDeleted: () => elements,', 'getSceneElementsIncludingDeleted: () => elements,\n        getName: () => "test",\n        getFiles: () => ({}),')

with open(path3, 'w', encoding='utf-8') as f:
    f.write(content3)

path4 = 'excalidraw-app/tests/boards/pointer-regression.test.ts'
with open(path4, 'r', encoding='utf-8') as f:
    content4 = f.read()

content4 = content4.replace('getSceneElementsIncludingDeleted: () => elements,', 'getSceneElementsIncludingDeleted: () => elements,\n        getName: () => "test",\n        getFiles: () => ({}),')

with open(path4, 'w', encoding='utf-8') as f:
    f.write(content4)

print("Fixed TS errors and mock types")
