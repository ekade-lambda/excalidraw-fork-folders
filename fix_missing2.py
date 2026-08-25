import os

path = 'excalidraw-app/App.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace 1
content = content.replace(
"""            if (!isEditing) {
              return;
            }""",
"""            if (!isEditing) {
              setRenameCtx(null);
              return;
            }""")

# Replace 2
content = content.replace(
"""      } else {
      }
    };""",
"""      } else {
        setRenameCtx(null);
      }
    };""")

# Replace 3
content = content.replace(
"""          newName: newName.trim(),
        }).catch((e) => console.error("Rename failed", e));
      }
    };""",
"""          newName: newName.trim(),
        }).catch((e) => console.error("Rename failed", e));
      }
      setRenameCtx(null);
    };""")

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print("Done manual replacement")
