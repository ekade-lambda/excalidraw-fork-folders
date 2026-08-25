import os

path = 'excalidraw-app/tests/boards/folderRename.ui.test.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

import re
# Remove elements and files from Board object in the test
content = re.sub(r'\s*elements:\s*\[\],\s*files:\s*\{\},', '', content)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)

print("Fixed folderRename.ui.test.tsx")
