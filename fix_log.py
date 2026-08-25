import os

path = 'excalidraw-app/App.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('logEvent(', '(window as any).logEvent(')
content = content.replace('const logEvent =', '(window as any).logEvent =')

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print("Fixed logEvent")
