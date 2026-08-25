with open('excalidraw-app/App.tsx', 'rb') as f:
    content = f.read()
print(repr(content[-100:]))
