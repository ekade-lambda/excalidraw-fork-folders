import os
path = "excalidraw-app/boards/repository/LocalStorageBoardRepository.ts"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

import_statement = 'import { createStore, get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";\n'
if "idb-keyval" not in content:
    content = import_statement + content

with open(path, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print("Added imports")
