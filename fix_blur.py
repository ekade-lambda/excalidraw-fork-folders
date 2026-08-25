import os

path = 'excalidraw-app/App.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

import re
old_blur = 'onBlur={(e) => handleRenameConfirm(e.currentTarget.value)}'
new_blur = """onBlur={(e) => {
                  const relatedTarget = e.relatedTarget as HTMLElement | null;
                  if (relatedTarget && relatedTarget.closest(".excalidraw-container")) {
                    // This blur was caused by Excalidraw's programmatic focusContainer() 
                    // pulling focus away from our input when Popover closed.
                    // We must ignore this blur and return focus asynchronously.
                    requestAnimationFrame(() => e.target.focus());
                    return;
                  }
                  handleRenameConfirm(e.currentTarget.value);
                }}"""

content = content.replace(old_blur, new_blur)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)

print("Implemented onBlur fix")
