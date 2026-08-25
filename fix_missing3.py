import os

path = 'excalidraw-app/App.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

import re
content = re.sub(r'if \(!isEditing\) \{\s*return;\s*\}', 'if (!isEditing) {\n              setRenameCtx(null);\n              return;\n            }', content)

content = re.sub(r'\} else \{\s*\}\s*};\s*const handleRenameConfirm', '} else {\n        setRenameCtx(null);\n      }\n    };\n  \n    const handleRenameConfirm', content)

content = re.sub(r'\)\.catch\(\(e\) => console\.error\("Rename failed", e\)\);\s*\}\s*\};\s*const handleCanvasDoubleClick', ').catch((e) => console.error("Rename failed", e));\n      }\n      setRenameCtx(null);\n    };\n  \n    const handleCanvasDoubleClick', content)

content = re.sub(r'if \(e\.key === "Escape"\) \{\s*\}\s*\}\}\s*onBlur', 'if (e.key === "Escape") {\n                      setRenameCtx(null);\n                    }\n                  }}\n                  onBlur', content)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print("Regex replaced!")
