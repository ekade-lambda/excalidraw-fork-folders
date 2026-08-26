import os

path = "excalidraw-app/tests/boards/reconciliation.test.ts"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace any occurrence of `createdAt: 0 };` with `createdAt: 0, updatedAt: 0 };`
content = content.replace("createdAt: 0 };", "createdAt: 0, updatedAt: 0 };")

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Updated reconciliation.test.ts")
