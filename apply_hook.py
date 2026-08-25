import os

path = 'excalidraw-app/App.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the style to include className and visibility
old_div = """        {renameCtx && (
          <div
            style={{
              position: "absolute",
              top: renameCtx.y,
              left: renameCtx.x,"""

new_div = """        {renameCtx && (
          <div
            className="board-rename-ui"
            style={{
              position: "absolute",
              top: renameCtx.y,
              left: renameCtx.x,
              visibility: "hidden","""

content = content.replace(old_div, new_div)

# Remove the transform style
content = content.replace('              transform: "translate(0, -110%)",\n', '')

# Insert the hook
hook_code = """
  useEffect(() => {
    if (!renameCtx) return;

    let rafId: number;
    let hasFoundMenu = false;
    let lastKnownLeft = renameCtx.x;
    let lastKnownTop = renameCtx.y;

    const syncPosition = () => {
      const menuElement = document.querySelector(".context-menu") as HTMLElement | null;
      const renameElement = document.querySelector(".board-rename-ui") as HTMLElement | null;

      if (menuElement && renameElement) {
        hasFoundMenu = true;
        const menuRect = menuElement.getBoundingClientRect();
        const renameRect = renameElement.getBoundingClientRect();

        let left = menuRect.right + 4;
        let top = menuRect.top;

        if (left + renameRect.width > window.innerWidth) {
          left = menuRect.left - renameRect.width - 4;
        }

        lastKnownLeft = left;
        lastKnownTop = top;

        renameElement.style.left = `${left}px`;
        renameElement.style.top = `${top}px`;
        renameElement.style.transform = `none`;
        renameElement.style.visibility = "visible";
      } else if (renameElement) {
        if (!hasFoundMenu) {
          renameElement.style.visibility = "hidden";
        } else {
          // The native menu disappeared.
          const isEditing = !!renameElement.querySelector("input");
          if (!isEditing) {
            setRenameCtx(null);
            return;
          } else {
            renameElement.style.left = `${lastKnownLeft}px`;
            renameElement.style.top = `${lastKnownTop}px`;
            renameElement.style.transform = `none`;
            renameElement.style.visibility = "visible";
          }
        }
      }
      rafId = requestAnimationFrame(syncPosition);
    };

    rafId = requestAnimationFrame(syncPosition);
    return () => cancelAnimationFrame(rafId);
  }, [renameCtx]);
"""

# Find the insertion point
lines = content.split('\n')
for i, line in enumerate(lines):
    if "const [renameCtx, setRenameCtx] = useState" in line:
        for j in range(i, i+15):
            if ">(null);" in lines[j] or "} | null>(null);" in lines[j]:
                lines.insert(j + 1, hook_code)
                break
        break

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write('\n'.join(lines))
print("Updated correctly!")
