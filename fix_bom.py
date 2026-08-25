import os
path = 'excalidraw-app/tests/boards/workspace.test.ts'
with open(path, 'rb') as f:
    content = f.read()
if content.startswith(b'\xef\xbb\xbf'):
    with open(path, 'wb') as f:
        f.write(content[3:])
print("BOM removed")
