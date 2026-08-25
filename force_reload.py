import os

path1 = 'excalidraw-app/tests/boards/folderRename.ui.test.tsx'
with open(path1, 'r', encoding='utf-8') as f:
    content1 = f.read()

# Make a small semantic change to FORCE a change in the file that the user can see!
content1 = content1.replace('describe("Folder Rename UI"', 'describe("Folder Rename UI Tests"')

with open(path1, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content1)

path2 = 'excalidraw-app/tests/boards/pointer-regression.test.ts'
with open(path2, 'r', encoding='utf-8') as f:
    content2 = f.read()

# Make a small semantic change here too
content2 = content2.replace('describe("pointerService Regression & Acceptance"', 'describe("pointerService Regression Tests"')

with open(path2, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content2)

print("Forced semantic changes to test files to guarantee reload.")
