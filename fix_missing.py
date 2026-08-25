import os

path = 'excalidraw-app/App.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    'if (e.key === "Escape") {\n                    }',
    'if (e.key === "Escape") {\n                      setRenameCtx(null);\n                    }'
)

content = content.replace(
    'if (!isEditing) {\n              return;',
    'if (!isEditing) {\n              setRenameCtx(null);\n              return;'
)

content = content.replace(
    'x: clientX,\n          y: clientY,\n        });\n      } else {\n      }',
    'x: clientX,\n          y: clientY,\n        });\n      } else {\n        setRenameCtx(null);\n      }'
)

content = content.replace(
    '}).catch((e) => console.error("Rename failed", e));\n      }\n    };',
    '}).catch((e) => console.error("Rename failed", e));\n      }\n      setRenameCtx(null);\n    };'
)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print("Fixed missing setRenameCtx!")
