import os
path = 'excalidraw-app/App.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the previous window.prompt UI with proper input
old_ui = """        {renameCtx && (
          <div
            style={{
              position: "absolute",
              top: renameCtx.y,
              left: renameCtx.x,
              zIndex: 999999,
              background: "white",
              padding: "4px",
              boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
              borderRadius: "4px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div 
               style={{ padding: "4px 8px", cursor: "pointer", fontWeight: "bold" }}
               onClick={() => {
                 const newName = window.prompt("New folder name:", renameCtx.initialName);
                 if (newName !== null) {
                   handleRenameConfirm(newName);
                 } else {
                   setRenameCtx(null);
                 }
               }}
            >
              Rename
            </div>
            <div 
               style={{ padding: "4px 8px", cursor: "pointer" }}
               onClick={() => setRenameCtx(null)}
            >
              Cancel
            </div>
          </div>
        )}"""

new_ui = """        {renameCtx && (
          <div
            style={{
              position: "absolute",
              top: renameCtx.y,
              left: renameCtx.x,
              zIndex: 999999,
              background: "white",
              padding: "4px",
              boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
              borderRadius: "4px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {renameCtx.editing ? (
              <input
                autoFocus
                defaultValue={renameCtx.initialName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRenameConfirm(e.currentTarget.value);
                  if (e.key === "Escape") setRenameCtx(null);
                }}
                onBlur={(e) => handleRenameConfirm(e.currentTarget.value)}
                style={{
                  padding: "4px",
                  fontSize: "14px",
                  border: "1px solid #ccc",
                  borderRadius: "2px",
                  outline: "none",
                }}
              />
            ) : (
              <div 
                 style={{ padding: "4px 8px", cursor: "pointer", fontWeight: "bold" }}
                 onClick={() => setRenameCtx({ ...renameCtx, editing: true })}
              >
                Rename
              </div>
            )}
          </div>
        )}"""

content = content.replace(old_ui, new_ui)

# Update the state type to include editing flag
content = content.replace(
    '    x: number;\n    y: number;\n  } | null>(null);',
    '    x: number;\n    y: number;\n    editing?: boolean;\n  } | null>(null);'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated App.tsx UI")
