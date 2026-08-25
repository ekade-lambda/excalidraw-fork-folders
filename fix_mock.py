import os
path = "excalidraw-app/tests/boards/repository.fallback.test.ts"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace('del: vi.fn(),', 'del: vi.fn().mockResolvedValue(undefined),')
with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Fixed mock")
