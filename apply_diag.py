import os

path = 'excalidraw-app/App.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add logs
content = content.replace(
    'setRenameCtx(null);',
    '''console.log("diagnostico: setRenameCtx(null) at", new Error().stack.split("\\n")[2]); setRenameCtx(null);'''
)
content = content.replace(
    'onBlur={(e) => handleRenameConfirm(e.currentTarget.value)}',
    '''onBlur={(e) => { console.log("diagnostico: onBlur triggered!"); handleRenameConfirm(e.currentTarget.value); }}'''
)
content = content.replace(
    'setRenameCtx({ ...renameCtx, editing: true });',
    '''console.log("diagnostico: setting editing to true!"); setRenameCtx({ ...renameCtx, editing: true });'''
)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print("Added diagnostics!")
