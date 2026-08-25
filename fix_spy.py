import os
path = "excalidraw-app/tests/boards/repository.fallback.test.ts"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace('vi.spyOn(Storage.prototype, "setItem")', 'vi.spyOn(window.localStorage, "setItem")')
with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Fixed spy")
