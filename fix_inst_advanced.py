import os

def refine_instrumentation(path, search_start, search_end, new_inst):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    start_idx = content.find(search_start)
    end_idx = content.find(search_end) + len(search_end)
    if start_idx != -1 and end_idx != -1:
        content = content[:start_idx] + new_inst + content[end_idx:]
        with open(path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(content)
        print(f"Refined {path}")
    else:
        print(f"Could not find instrumentation block in {path}")

# folderService.ts
folder_inst = """
  // [INSTRUMENTACION TEMPORAL]
  try {
    const dataURL = imageFile.dataURL;
    const hasBase64Header = dataURL.startsWith("data:image/svg+xml;base64,");
    const hasPercentEncoding = /%/.test(dataURL);
    
    let payloadAtobValid = false;
    const b64Part = dataURL.slice(dataURL.indexOf(",") + 1);
    try {
      if (typeof window !== 'undefined' && window.atob) {
         window.atob(b64Part);
         payloadAtobValid = true;
      }
    } catch(e) {}

    console.error("[DATAURL] source=createFolder (folderService)");
    console.error("[DATAURL] fileId=" + imageFile.id);
    console.error("[DATAURL] boardId=" + boardId);
    console.error("[DATAURL] folderId=" + folderId);
    console.error("[DATAURL] hasBase64Header=" + hasBase64Header);
    console.error("[DATAURL] hasPercentEncoding=" + hasPercentEncoding);
    console.error("[DATAURL] payloadAtobValid=" + payloadAtobValid);
    console.error("[DATAURL] length=" + dataURL.length);
    console.error("[DATAURL] prefix=" + dataURL.substring(0, 50));
    console.error("[DATAURL] suffix=" + dataURL.substring(dataURL.length - 50));
  } catch (e) {
    console.error("[DATAURL] error instrumenting: ", e);
  }
  // [/INSTRUMENTACION TEMPORAL]
"""
refine_instrumentation('excalidraw-app/boards/host/folderService.ts', '// [INSTRUMENTACION TEMPORAL]', '// [/INSTRUMENTACION TEMPORAL]\n', folder_inst)

# boardService.ts
board_inst = """
    // [INSTRUMENTACION TEMPORAL]
    for (const f of files) {
      if (f.mimeType === "image/svg+xml") {
        try {
          const dataURL = f.dataURL;
          const hasBase64Header = dataURL.startsWith("data:image/svg+xml;base64,");
          const hasPercentEncoding = /%/.test(dataURL);
          
          let payloadAtobValid = false;
          const b64Part = dataURL.slice(dataURL.indexOf(",") + 1);
          try {
            if (typeof window !== 'undefined' && window.atob) {
               window.atob(b64Part);
               payloadAtobValid = true;
            }
          } catch(e) {}
          
          // Solo logueamos si el payload es problemático (no es atob válido o no tiene header correcto)
          if (!hasBase64Header || !payloadAtobValid || hasPercentEncoding) {
            console.error("[DATAURL] source=loadBoardIntoEditor (boardService)");
            console.error("[DATAURL] boardId=" + boardData.id);
            console.error("[DATAURL] fileId=" + f.id);
            console.error("[DATAURL] hasBase64Header=" + hasBase64Header);
            console.error("[DATAURL] hasPercentEncoding=" + hasPercentEncoding);
            console.error("[DATAURL] payloadAtobValid=" + payloadAtobValid);
            console.error("[DATAURL] length=" + dataURL.length);
            console.error("[DATAURL] prefix=" + dataURL.substring(0, 50));
            console.error("[DATAURL] suffix=" + dataURL.substring(dataURL.length - 50));
          }
        } catch (e) {
          console.error("[DATAURL] error instrumenting: ", e);
        }
      }
    }
    // [/INSTRUMENTACION TEMPORAL]
"""
refine_instrumentation('excalidraw-app/boards/host/boardService.ts', '// [INSTRUMENTACION TEMPORAL]', '// [/INSTRUMENTACION TEMPORAL]\n', board_inst)

