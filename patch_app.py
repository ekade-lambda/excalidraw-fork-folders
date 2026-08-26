import os
path = "excalidraw-app/App.tsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

import_statement = 'import { startMultiTabSync } from "./boards/host/reconciliation";\n'
content = content.replace('import { LocalStorageBoardRepository } from "./boards/repository/LocalStorageBoardRepository";', import_statement + 'import { LocalStorageBoardRepository } from "./boards/repository/LocalStorageBoardRepository";')

old_logic = """    initializeBoardSystem(new LocalStorageBoardRepository()).catch((error) => {
      console.error("BoardSystem: boot failed", error);
    });
  }, [excalidrawAPI]);"""

new_logic = """    const repo = new LocalStorageBoardRepository();
    initializeBoardSystem(repo).catch((error) => {
      console.error("BoardSystem: boot failed", error);
    });
    return startMultiTabSync(repo, excalidrawAPI);
  }, [excalidrawAPI]);"""

content = content.replace(old_logic, new_logic)

with open(path, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print("Patched App.tsx")
