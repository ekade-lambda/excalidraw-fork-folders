import os

path = 'excalidraw-app/tests/boards/boardService.normalization.test.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('import { MIME_TYPES } from "../../../packages/excalidraw/constants";', 'const MIME_TYPES = { svg: "image/svg+xml" };')

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print("Fixed test imports")
