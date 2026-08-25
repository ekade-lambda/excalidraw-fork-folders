import os

path = 'excalidraw-app/tests/boards/boardService.normalization.test.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('as any', 'as unknown as any') # Actually, casting to the right types is better.

# Let's just fix it completely:
new_content = """import { describe, expect, it, vi } from "vitest";
import { loadBoardIntoEditor } from "../../boards/host/boardService";
import type { BoardData } from "../../boards/types";
import type { ExcalidrawImperativeAPI } from "../../../packages/excalidraw/types";
import type { BinaryFileData, FileId, DataURL } from "../../../packages/excalidraw/types";

const MIME_TYPES = { svg: "image/svg+xml" as const };

describe("Board System :: legacy Data URL normalization", () => {
  it("normaliza un SVG URI-encoded antiguo a Base64 válido sin tocar Base64 nuevos", () => {
    const mockAddFiles = vi.fn();
    const mockUpdateScene = vi.fn();
    const mockGetAppState = vi.fn(() => ({ width: 1000, height: 1000 }));
    
    const excalidrawAPI = {
      addFiles: mockAddFiles,
      updateScene: mockUpdateScene,
      getAppState: mockGetAppState,
    } as unknown as ExcalidrawImperativeAPI;

    const legacyUriPayload = "%3Csvg%3E%C3%B1%C3%A1%C3%A9%C3%AD%C3%B3%C3%BA%20%F0%9F%93%81%20%E2%9C%A8%3C%2Fsvg%3E";
    const legacyDataUrl = `data:${MIME_TYPES.svg};charset=utf-8,${legacyUriPayload}`;
    const base64DataUrl = `data:${MIME_TYPES.svg};base64,PHN2Zz50ZXN0PC9zdmc+`;
    const unknownDataUrl = `data:${MIME_TYPES.svg};unknown,some-weird-data`;

    const boardData: BoardData = {
      schemaVersion: 1,
      boardId: "board-1",
      elements: [],
      name: "Test Board",
      updatedAt: 0,
      files: {
        "file-legacy": {
          id: "file-legacy" as FileId,
          mimeType: MIME_TYPES.svg,
          created: 0,
          dataURL: legacyDataUrl as DataURL,
        },
        "file-base64": {
          id: "file-base64" as FileId,
          mimeType: MIME_TYPES.svg,
          created: 0,
          dataURL: base64DataUrl as DataURL,
        },
        "file-unknown": {
          id: "file-unknown" as FileId,
          mimeType: MIME_TYPES.svg,
          created: 0,
          dataURL: unknownDataUrl as DataURL,
        }
      }
    };

    loadBoardIntoEditor(excalidrawAPI, boardData);

    expect(mockAddFiles).toHaveBeenCalledTimes(1);
    const addedFiles = mockAddFiles.mock.calls[0][0];
    
    const normalizedLegacy = addedFiles.find((f: BinaryFileData) => f.id === "file-legacy");
    expect(normalizedLegacy.dataURL.startsWith("data:image/svg+xml;base64,")).toBe(true);
    
    const b64Payload = normalizedLegacy.dataURL.slice(normalizedLegacy.dataURL.indexOf(",") + 1);
    const byteString = window.atob(b64Payload);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const decodedSvg = new TextDecoder("utf-8").decode(ab);
    expect(decodedSvg).toBe("<svg>ñáéíóú 📁 ✨</svg>");

    const normalizedBase64 = addedFiles.find((f: BinaryFileData) => f.id === "file-base64");
    expect(normalizedBase64.dataURL).toBe(base64DataUrl);

    const normalizedUnknown = addedFiles.find((f: BinaryFileData) => f.id === "file-unknown");
    expect(normalizedUnknown.dataURL).toBe(unknownDataUrl);
  });
});
"""

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(new_content)
print("Cleaned types in test")
