import os

path = 'excalidraw-app/App.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add useEffect hook for global pointerdown
hook_code = """  // Global click-outside detector for Rename UI
  useEffect(() => {
    if (!renameCtx) return;

    const handleGlobalPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      const renameElement = document.querySelector(".board-rename-ui");
      
      if (renameElement && renameElement.contains(target)) {
        // Clicked inside Rename UI, do nothing
        return;
      }
      
      // Clicked outside, close Rename
      setRenameCtx(null);
    };

    document.addEventListener("pointerdown", handleGlobalPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handleGlobalPointerDown, true);
    };
  }, [renameCtx]);

  // Positioning loop (visual only, NO lifecycle control)
  useEffect(() => {
    if (!renameCtx) return;
    
    let rafId: number;
    const syncPosition = () => {
      const menuElement = document.querySelector(".context-menu") as HTMLElement | null;
      const renameElement = document.querySelector(".board-rename-ui") as HTMLElement | null;
      
      if (menuElement && renameElement) {
        const menuRect = menuElement.getBoundingClientRect();
        renameElement.style.left = `${menuRect.right}px`;
        renameElement.style.top = `${menuRect.top}px`;
        renameElement.style.transform = `none`;
      }
      rafId = requestAnimationFrame(syncPosition);
    };
    rafId = requestAnimationFrame(syncPosition);
    return () => cancelAnimationFrame(rafId);
  }, [renameCtx]);
"""

# inject right before handleHostContextMenu
content = content.replace('const handleHostContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {', hook_code + '\n  const handleHostContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {')

# update handleRenameConfirm
content = content.replace(
"""  const handleRenameConfirm = (newName: string) => {
    if (renameCtx && newName && newName.trim() && excalidrawAPI) {
      renameFolder({
        repo: boardRepo,
        excalidrawAPI,
        folderId: renameCtx.folderId,
        newName: newName.trim(),
      }).catch((e) => console.error("Rename failed", e));
    }
    setRenameCtx(null);
  };""",
"""  const handleRenameConfirm = (newName: string) => {
    if (renameCtx && newName && newName.trim() && excalidrawAPI) {
      renameFolder({
        repo: boardRepo,
        excalidrawAPI,
        folderId: renameCtx.folderId,
        newName: newName.trim(),
      }).catch((e) => console.error("Rename failed", e));
    }
    setRenameCtx(null);
  };""")

# Now fix the render of Rename UI
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
              transform: "translate(0, -110%)",
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
                  if (e.key === "Enter") {
                    handleRenameConfirm(e.currentTarget.value);
                  }
                  if (e.key === "Escape") {
                    setRenameCtx(null);
                  }
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
                style={{
                  padding: "4px 8px",
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
                onClick={() => setRenameCtx({ ...renameCtx, editing: true })}
              >
                Rename
              </div>
            )}
          </div>
        )}"""

new_ui = """        {renameCtx && (
          <div
            className="board-rename-ui"
            style={{
              position: "absolute",
              top: renameCtx.y,
              left: renameCtx.x,
              zIndex: 999999,
              background: "white",
              padding: "4px",
              boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
              transform: "translate(0, -110%)", // initial fallback position
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
                  if (e.key === "Enter") {
                    handleRenameConfirm(e.currentTarget.value);
                  }
                  if (e.key === "Escape") {
                    setRenameCtx(null);
                  }
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
                style={{
                  padding: "4px 8px",
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
                onPointerDown={() => setRenameCtx({ ...renameCtx, editing: true })}
              >
                Rename
              </div>
            )}
          </div>
        )}"""

content = content.replace(old_ui, new_ui)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print("Updated App.tsx with robust architecture")
