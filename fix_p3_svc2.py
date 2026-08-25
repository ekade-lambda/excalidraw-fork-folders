import os
path = 'excalidraw-app/boards/host/folderService.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    '// @ts-ignore\n      captureUpdate: 0, // NEVER',
    'captureUpdate: CaptureUpdateAction.NEVER'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Fixed CaptureUpdateAction")
