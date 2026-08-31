import { describe, it, expect, vi, beforeEach } from "vitest";
import { openLinkToFile } from "./openLinkToFile";
import { resolveFile, openFile } from "../bridgeClient";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/element/types";
import { FileNotFoundBridgeError, InternalBridgeError } from "../types";

vi.mock("../bridgeClient", () => ({
  resolveFile: vi.fn(),
  openFile: vi.fn(),
}));

describe("openLinkToFile", () => {
  let excalidrawAPI: ExcalidrawImperativeAPI;
  let updateSceneMock: ReturnType<typeof vi.fn>;
  let getSceneElementsMock: ReturnType<typeof vi.fn>;

  const dummyElement = {
    id: "el-1",
    type: "text",
    customData: {
      type: "link-to-file",
      lastKnownPath: "C:\\doc.txt",
    }
  } as unknown as ExcalidrawElement;

  const dummyLinkData = {
    type: "link-to-file" as const,
    fileIdentity: { volumeGuid: "VOL1", fileId: [1, 2, 3] },
    lastKnownPath: "C:\\doc.txt",
    metadata: { name: "doc.txt", extension: "txt", size: 123 },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    updateSceneMock = vi.fn();
    getSceneElementsMock = vi.fn().mockReturnValue([dummyElement]);

    excalidrawAPI = {
      updateScene: updateSceneMock,
      getSceneElements: getSceneElementsMock,
    } as unknown as ExcalidrawImperativeAPI;
  });

  it("resolves and opens file without updating scene if path is unchanged", async () => {
    vi.mocked(resolveFile).mockResolvedValueOnce({
      status: "resolved",
      currentPath: "C:\\doc.txt",
    });
    vi.mocked(openFile).mockResolvedValueOnce();

    await openLinkToFile({ excalidrawAPI, element: dummyElement, linkData: dummyLinkData });

    expect(resolveFile).toHaveBeenCalledWith(dummyLinkData.fileIdentity, "C:\\doc.txt");
    expect(openFile).toHaveBeenCalledWith(dummyLinkData.fileIdentity, "C:\\doc.txt");
    expect(updateSceneMock).not.toHaveBeenCalled(); // no path change
  });

  it("updates lastKnownPath if path has changed after resolve", async () => {
    vi.mocked(resolveFile).mockResolvedValueOnce({
      status: "resolved",
      currentPath: "C:\\new_folder\\doc.txt",
    });
    vi.mocked(openFile).mockResolvedValueOnce();

    await openLinkToFile({ excalidrawAPI, element: dummyElement, linkData: dummyLinkData });

    expect(updateSceneMock).toHaveBeenCalled();
    const updatedElements = updateSceneMock.mock.calls[0][0].elements;
    expect(updatedElements[0].customData.lastKnownPath).toBe("C:\\new_folder\\doc.txt");
    
    // Debería pasar la ruta actualizada a openFile
    expect(openFile).toHaveBeenCalledWith(dummyLinkData.fileIdentity, "C:\\new_folder\\doc.txt");
  });

  it("handles FileNotFoundBridgeError gracefully without crashing", async () => {
    vi.mocked(resolveFile).mockRejectedValueOnce(new FileNotFoundBridgeError());

    // Should not throw
    await openLinkToFile({ excalidrawAPI, element: dummyElement, linkData: dummyLinkData });

    expect(updateSceneMock).not.toHaveBeenCalled();
    expect(openFile).not.toHaveBeenCalled();
  });

  it("handles unexpected errors gracefully", async () => {
    vi.mocked(resolveFile).mockRejectedValueOnce(new Error("Random crash"));

    // Should not throw
    await openLinkToFile({ excalidrawAPI, element: dummyElement, linkData: dummyLinkData });

    expect(updateSceneMock).not.toHaveBeenCalled();
    expect(openFile).not.toHaveBeenCalled();
  });
});
