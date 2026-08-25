import os
path = 'excalidraw-app/tests/boards/workspace.ui.test.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    'const spyCreateElement = vi.spyOn(document, "createElement").mockImplementation((tag) => {',
    'const originalCreateElement = document.createElement.bind(document);\n    const spyCreateElement = vi.spyOn(document, "createElement").mockImplementation((tag) => {'
)

content = content.replace(
    'return document.createElement.getMockImplementation()!(tag);',
    'return originalCreateElement(tag);'
)

# Fix file.text not a function for the mock File
content = content.replace(
    'const mockFile = new File([\'{"schemaVersion":1}\'], "Workspace.excaliwork", { type: "application/json" });',
    'const mockFile = { text: async () => \'{"schemaVersion":1}\' } as any;'
)
content = content.replace(
    'const mockFile = new File(["corrupt"], "Workspace.excaliwork", { type: "application/json" });',
    'const mockFile = { text: async () => "corrupt" } as any;'
)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print("Updated")
