import os

path = 'excalidraw-app/boards/host/boardService.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

instrumentation = """
    // [INSTRUMENTACION TEMPORAL]
    for (const f of files) {
      if (f.mimeType === "image/svg+xml") {
        const dataURL = f.dataURL;
        const b64Part = dataURL.slice(dataURL.indexOf(",") + 1);
        const isValid = /^[A-Za-z0-9+/=\\s]*$/.test(b64Part);
        if (!isValid || /%/.test(dataURL)) {
            console.error("[DATAURL] source=loadBoardIntoEditor (boardService)");
            console.error("[DATAURL] boardId=" + board.id);
            console.error("[DATAURL] fileId=" + f.id);
            console.error("[DATAURL] isBase64=" + isValid);
            console.error("[DATAURL] hasPercentEncoding=" + /%/.test(dataURL));
            console.error("[DATAURL] length=" + dataURL.length);
            console.error("[DATAURL] prefix=" + dataURL.substring(0, 50));
            console.error("[DATAURL] invalid chars: " + b64Part.replace(/[A-Za-z0-9+/=\\s]/g, "").substring(0, 50));
        }
      }
    }
    // [/INSTRUMENTACION TEMPORAL]
    excalidrawAPI.addFiles(files);
"""

content = content.replace("excalidrawAPI.addFiles(files);", instrumentation)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print("Instrumented boardService.ts")
