import os

paste_ts_path = 'excalidraw-app/boards/host/paste.ts'
with open(paste_ts_path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    'console.warn("Cross-tab clipboard schema mismatch. Expected " + BOARD_CLIPBOARD_SCHEMA_VERSION + ", got " + parsed.schemaVersion);',
    'console.warn(`Cross-tab clipboard schema mismatch. Expected ${BOARD_CLIPBOARD_SCHEMA_VERSION}, got ${parsed.schemaVersion}`);'
)

content = content.replace(
    'throw new Error("cloneFromClipboard failed: " + res.reason);',
    'throw new Error(`cloneFromClipboard failed: ${res.reason}`);'
)

with open(paste_ts_path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)

paste_test_ts_path = 'excalidraw-app/tests/boards/paste.test.ts'
with open(paste_test_ts_path, 'rb') as f:
    content_bytes = f.read()

if content_bytes.startswith(b'\xef\xbb\xbf'):
    content_bytes = content_bytes[3:]

with open(paste_test_ts_path, 'wb') as f:
    f.write(content_bytes)

print("Done")
