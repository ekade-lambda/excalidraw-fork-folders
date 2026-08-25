import os

path = 'excalidraw-app/App.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# First, remove the forbidden .remove() hack
content = content.replace('document.querySelector(".context-menu")?.remove();', '')

# We will inject logging into:
# 1. onPointerDown
# 2. onBlur
# 3. handleRenameConfirm
# 4. handleCanvasDoubleClick (to trace pointerdown on canvas?)
# 5. syncPosition (when it decides to setRenameCtx(null))
# 6. handleHostContextMenu

import re

# Add window.logTrace
trace_code = """
if (!(window as any).traceLog) {
  (window as any).traceLog = [];
}
const logEvent = (msg: string) => {
  console.log("[TRACE]", msg);
  (window as any).traceLog.push(msg);
};
"""
# inject right inside App component
content = content.replace('export default function ExcalidrawApp() {', 'export default function ExcalidrawApp() {\n' + trace_code)

# Instrument handleRenameConfirm
content = content.replace('const handleRenameConfirm = (newName: string) => {', 'const handleRenameConfirm = (newName: string) => {\n      logEvent("handleRenameConfirm called with " + newName);')

# Instrument onBlur
content = content.replace('onBlur={(e) => {', 'onBlur={(e) => {\n                    logEvent("onBlur fired. relatedTarget=" + (e.relatedTarget ? (e.relatedTarget as Element).tagName : "null"));')

# Instrument onPointerDown on Rename button
content = content.replace('onPointerDown={(e) => {', 'onPointerDown={(e) => {\n                    logEvent("onPointerDown on Rename button");')

# Instrument syncPosition
content = re.sub(
    r'if \(!isEditing\) \{\s*setRenameCtx\(null\);\s*return;\s*\}',
    'if (!isEditing) { logEvent("syncPosition: isEditing false -> setRenameCtx(null)"); setRenameCtx(null); return; }',
    content
)
content = re.sub(
    r'\} else \{\s*setRenameCtx\(null\);\s*\}',
    '} else { logEvent("syncPosition: folder NOT in target Elements -> setRenameCtx(null)"); setRenameCtx(null); }',
    content
)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print("Instrumented App.tsx")
