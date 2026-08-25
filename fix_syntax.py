import os
import re

path = 'excalidraw-app/tests/boards/folderService.test.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace any sequence of }; } } with just }
content = re.sub(r'\};\s*\}\s*function resetBoardsStore', '}\n\nfunction resetBoardsStore', content)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Fixed syntax error")
