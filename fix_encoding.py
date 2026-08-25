with open('excalidraw-app/App.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('\ufffd', '')

with open('excalidraw-app/App.tsx', 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)

print("Removed replacement characters")
