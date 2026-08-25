import os

path = 'excalidraw-app/App.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Remove console.logs
import re
content = re.sub(r'console\.log\("diagnostico:[^"]*",?[^)]*\);\s*', '', content)
content = re.sub(r'console\.log\("diagnostico:[^"]*"\);\s*', '', content)

# Update onPointerDown
old_ptr = '''                  onPointerDown={(e) => {
                    e.currentTarget
                      .closest(".board-rename-ui")
                      ?.setAttribute("data-editing", "true");
                    setRenameCtx({ ...renameCtx, editing: true });
                  }}'''
new_ptr = '''                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    document.querySelector(".context-menu")?.remove();
                    
                    e.currentTarget
                      .closest(".board-rename-ui")
                      ?.setAttribute("data-editing", "true");
                    setRenameCtx({ ...renameCtx, editing: true });
                  }}'''
content = content.replace(old_ptr, new_ptr)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print("Updated App.tsx")
