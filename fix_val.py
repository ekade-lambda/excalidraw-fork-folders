import os
import re

path = 'excalidraw-app/boards/host/workspace.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

new_validation = """
  for (const boardId of Object.keys(bundle.graph.boards)) {
    const board = bundle.boards[boardId as BoardId];
    if (!board) {
      return false; 
    }
    for (const element of board.elements) {
      if (element.type === "image" && (element as any).fileId) {
        if (!bundle.files[(element as any).fileId as FileId]) {
          return false;
        }
      }
    }
  }
"""

content = re.sub(
    r'  for \(const boardId of Object.keys\(bundle.graph.boards\)\) \{\n    if \(!bundle.boards\[boardId\]\) \{\n      return false; \n    \}\n  \}',
    new_validation.strip('\n'),
    content
)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print("Updated workspace.ts")
