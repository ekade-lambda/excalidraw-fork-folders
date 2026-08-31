path = "excalidraw-app/App.tsx"
with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()
for i, l in enumerate(lines):
    if 1675 <= i <= 1735:
        print(f"{i+1}: {l.rstrip()}")
