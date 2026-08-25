import os

path = 'excalidraw-app/tests/boards/folderService.test.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Only replace back the one that has graph.folders[fId] = ...
lines = content.split('\n')
for i, line in enumerate(lines):
    if "const fId = \"f-target\";" in line:
        # the line before it or two lines before it should be fixed
        for j in range(i, i-5, -1):
            if "const { rootFolderId } = await seedRoot(repo);" in lines[j]:
                lines[j] = '    const { graph, rootFolderId } = await seedRoot(repo);'
                break

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write('\n'.join(lines))
print("Restored graph where needed")
