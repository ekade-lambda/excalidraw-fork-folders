import os
path = "excalidraw-app/boards/app_constants.ts"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

old_str = 'BOARDS_BOARD_PREFIX: "excalidraw-board-",'
new_str = 'BOARDS_BOARD_PREFIX: "excalidraw-board-",\n  BOARDS_WAR_PREFIX: "excalidraw-war-",'
content = content.replace(old_str, new_str)

with open(path, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print("Patched app_constants.ts")
