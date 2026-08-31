import os

path = "excalidraw-app/App.tsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

import re

old_jsx = r"""            \) : \(
              <div
                style=\{\{
                  padding: "4px 8px",
                  cursor: "pointer",
                  fontWeight: "bold",
                \}\}
                onPointerDown=\{\(e\) => \{
                  e\.preventDefault\(\);
                  setRenameCtx\(\{ \.\.\.renameCtx, editing: true \}\);
                \}\}
              >
                Rename
              </div>

              <div
                onClick=\{handleDeleteFolder\}
                style=\{\{
                  padding: "4px 8px",
                  cursor: "pointer",
                  color: "red",
                  borderTop: "1px solid #ccc",
                \}\}
              >
                Delete
              </div>
            \)\}"""

new_jsx = """            ) : (
              <>
              <div
                style={{
                  padding: "4px 8px",
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  setRenameCtx({ ...renameCtx, editing: true });
                }}
              >
                Rename
              </div>

              <div
                onClick={handleDeleteFolder}
                style={{
                  padding: "4px 8px",
                  cursor: "pointer",
                  color: "red",
                  borderTop: "1px solid #ccc",
                }}
              >
                Delete
              </div>
              </>
            )}"""

if re.search(old_jsx, content):
    content = re.sub(old_jsx, new_jsx, content)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Fixed JSX")
else:
    print("JSX Not found")
