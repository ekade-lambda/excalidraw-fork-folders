import os

path = 'excalidraw-app/App.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

import re
content = re.sub(r'console\.log\("diagnostico:[^\n]+;\s*', '', content)
content = re.sub(r'console\.log\("diagnostico:.*?\);\s*', '', content, flags=re.DOTALL)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print("Updated App.tsx again")
