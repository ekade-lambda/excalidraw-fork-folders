import os

path = "excalidraw-app/App.tsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

import re
old_block = r"""\s*useEffect\(\(\) => \{
\s*if \(\!excalidrawAPI\) \{
\s*return;
\s*\}
\s*const repo = new LocalStorageBoardRepository\(\);
\s*initializeBoardSystem\(repo\)\.catch\(\(error\) => \{
\s*console\.error\("BoardSystem: boot failed", error\);
\s*\}\);
\s*return startMultiTabSync\(repo, excalidrawAPI\);
\s*\}, \[excalidrawAPI\]\);"""

new_block = """  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }
    const repo = new LocalStorageBoardRepository();
    initializeBoardSystem(repo).catch((error) => {
      console.error("BoardSystem: boot failed", error);
    });
    
    const gcTimer = setTimeout(() => {
      repo.load().then(graph => {
        if (graph && repo.runGarbageCollector) {
          repo.runGarbageCollector(graph).catch(e => console.error("GC failed", e));
        }
      });
    }, 10000);

    const unsubscribe = startMultiTabSync(repo, excalidrawAPI);
    return () => {
      clearTimeout(gcTimer);
      unsubscribe();
    };
  }, [excalidrawAPI]);"""

if re.search(old_block, content):
    content = re.sub(old_block, new_block, content)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Replaced")
else:
    print("Not found")
