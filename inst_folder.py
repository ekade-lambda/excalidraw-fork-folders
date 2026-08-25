import os

path = 'excalidraw-app/boards/host/folderService.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

instrumentation = """
  // [INSTRUMENTACION TEMPORAL]
  try {
    const dataURL = imageFile.dataURL;
    const b64Part = dataURL.slice(dataURL.indexOf(",") + 1);
    const isValid = /^[A-Za-z0-9+/=]*$/.test(b64Part);
    console.error("[DATAURL] source=createFolder (folderService)");
    console.error("[DATAURL] boardId=" + boardId);
    console.error("[DATAURL] folderId=" + folderId);
    console.error("[DATAURL] isBase64=" + isValid);
    console.error("[DATAURL] hasPercentEncoding=" + /%/.test(dataURL));
    console.error("[DATAURL] length=" + dataURL.length);
    console.error("[DATAURL] prefix=" + dataURL.substring(0, 50));
    console.error("[DATAURL] b64 length=" + b64Part.length);
    if (!isValid) {
      console.error("[DATAURL] invalid chars found: " + b64Part.replace(/[A-Za-z0-9+/=]/g, "").substring(0, 50));
    }
  } catch (e) {
    console.error("[DATAURL] error instrumenting: ", e);
  }
  // [/INSTRUMENTACION TEMPORAL]
  excalidrawAPI.addFiles([imageFile]);
"""

content = content.replace("excalidrawAPI.addFiles([imageFile]);", instrumentation)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print("Instrumented folderService.ts")
