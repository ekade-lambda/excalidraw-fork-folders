import os
for path in ["excalidraw-app/tests/boards/deleteOrchestration.test.ts", "excalidraw-app/tests/boards/gc.test.ts"]:
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    content = content.replace("../../../app_constants", "../../app_constants")
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
