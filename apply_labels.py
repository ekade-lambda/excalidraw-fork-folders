import os

path = 'excalidraw-app/App.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    'console.log("diagnostico: setRenameCtx(null) at", new Error().stack.split("\\n")[2]); setRenameCtx(null);',
    '''console.log("diagnostico: setRenameCtx(null) at SYNC", new Error().stack.split("\\n")[2]); setRenameCtx(null);''',
    1
)
content = content.replace(
    'console.log("diagnostico: setRenameCtx(null) at", new Error().stack.split("\\n")[2]); setRenameCtx(null);',
    '''console.log("diagnostico: setRenameCtx(null) at CONTEXTMENU", new Error().stack.split("\\n")[2]); setRenameCtx(null);''',
    1
)
content = content.replace(
    'console.log("diagnostico: setRenameCtx(null) at", new Error().stack.split("\\n")[2]); setRenameCtx(null);',
    '''console.log("diagnostico: setRenameCtx(null) at CONFIRM", new Error().stack.split("\\n")[2]); setRenameCtx(null);''',
    1
)
content = content.replace(
    'console.log("diagnostico: setRenameCtx(null) at", new Error().stack.split("\\n")[2]); \nsetRenameCtx(null);',
    '''console.log("diagnostico: setRenameCtx(null) at ESCAPE", new Error().stack.split("\\n")[2]); setRenameCtx(null);''',
    1
)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print("Updated labels!")
