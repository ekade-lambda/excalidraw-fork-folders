import os
path = 'excalidraw-app/tests/boards/workspace.ui.test.tsx'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'mockResolvedValue' in line and 'schemaVersion' in line:
        if 'exportWorkspace' in line:
            lines[i] = '    vi.spyOn(workspaceModule, "exportWorkspace").mockResolvedValue(\'{"schemaVersion":1}\');\n'
    if 'mockFile = new File' in line and 'schemaVersion' in line:
        lines[i] = '    const mockFile = new File([\'{"schemaVersion":1}\'], "Workspace.excaliwork", { type: "application/json" });\n'

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.writelines(lines)
print("Updated")
