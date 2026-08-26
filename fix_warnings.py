import os

path_recon = "excalidraw-app/boards/host/reconciliation.ts"
with open(path_recon, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("import type { BoardsGraph, BoardId, FolderId } from \"../types\";", "import type { BoardsGraph, BoardId } from \"../types\";")
content = content.replace("import { findFolderVisual } from \"./materialize\";\n", "")

with open(path_recon, "w", encoding="utf-8") as f:
    f.write(content)

path_test = "excalidraw-app/tests/boards/reconciliation.test.ts"
with open(path_test, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("import { describe, expect, it, vi } from \"vitest\";", "import { describe, expect, it } from \"vitest\";")
content = content.replace("import type { BoardsGraph, BoardId, FolderId } from \"../../boards/types\";", "import type { BoardId, FolderId } from \"../../boards/types\";")

with open(path_test, "w", encoding="utf-8") as f:
    f.write(content)

print("Fixed warnings")
