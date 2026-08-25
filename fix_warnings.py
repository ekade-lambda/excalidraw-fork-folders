import os
path = 'excalidraw-app/tests/boards/workspace.ui.test.tsx'

# 1. Read content without BOM
with open(path, 'rb') as f:
    content_bytes = f.read()

if content_bytes.startswith(b'\xef\xbb\xbf'):
    content_bytes = content_bytes[3:]

content = content_bytes.decode('utf-8')

# 2. Fix let mockInput -> const mockInput
content = content.replace('let mockInput: any = { type: "file", click: vi.fn() };', 'const mockInput: any = { type: "file", click: vi.fn() };')

# 3. Fix curly braces
# if (tag === "a") return mockAnchor as any;
content = content.replace(
    'if (tag === "a") return mockAnchor as any;',
    'if (tag === "a") {\n        return mockAnchor as any;\n      }'
)
# if (tag === "input") return mockInput;
content = content.replace(
    'if (tag === "input") return mockInput;',
    'if (tag === "input") {\n        return mockInput;\n      }'
)

# 4. Fix import order
# Current:
# import { describe, expect, it, vi, beforeEach } from "vitest";
# import { render, fireEvent, screen } from "@testing-library/react";
# import React from "react";
# import { NavBar } from "../../boards/ui/NavBar";
content = content.replace(
    'import { render, fireEvent, screen } from "@testing-library/react";\nimport React from "react";',
    'import React from "react";\n\nimport { render, fireEvent, screen } from "@testing-library/react";'
)

with open(path, 'wb') as f:
    f.write(content.encode('utf-8'))

print("Updated")
