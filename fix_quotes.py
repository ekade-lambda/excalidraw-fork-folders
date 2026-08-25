import os
path = 'excalidraw-app/tests/boards/workspace.ui.test.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('"{"schemaVersion":1}"', '\'{"schemaVersion":1}\'')
content = content.replace('["{"schemaVersion":1}"]', '[\'{"schemaVersion":1}\']')

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print("Updated")
