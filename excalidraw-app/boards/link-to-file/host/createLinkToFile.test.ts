import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLinkToFile } from "./createLinkToFile";
import { pickFile } from "../bridgeClient";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { CancelledBridgeError, InternalBridgeError } from "../types";

vi.mock("../bridgeClient", () => ({
  pickFile: vi.fn(),
}));

describe("createLinkToFile", () => {
  let excalidrawAPI: ExcalidrawImperativeAPI;
  let getSceneElementsMock: ReturnType<typeof vi.fn>;
  let updateSceneMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();

    getSceneElementsMock = vi.fn().mockReturnValue([]);
    updateSceneMock = vi.fn();

    excalidrawAPI = {
      getSceneElements: getSceneElementsMock,
      updateScene: updateSceneMock,
    } as unknown as ExcalidrawImperativeAPI;
  });

  it("creates a text element and updates scene when file is picked", async () => {
    vi.mocked(pickFile).mockResolvedValueOnce({
      fileIdentity: { volumeGuid: "VOL1", fileId: [1, 2, 3] },
      lastKnownPath: "C:\\doc.txt",
      metadata: { name: "doc.txt", extension: "txt", size: 123 },
    });

    await createLinkToFile({ excalidrawAPI, sceneX: 100, sceneY: 200 });

    expect(pickFile).toHaveBeenCalled();
    expect(getSceneElementsMock).toHaveBeenCalled();
    expect(updateSceneMock).toHaveBeenCalled();

    const updateArgs = updateSceneMock.mock.calls[0][0];
    const elements = updateArgs.elements;
    expect(elements).toHaveLength(1);

    const el = elements[0];
    expect(el.type).toBe("text");
    expect(el.text).toBe("🔗 doc.txt");
    expect(el.x).toBe(100);
    expect(el.y).toBe(200);

    const customData = el.customData;
    expect(customData).toBeDefined();
    expect(customData.type).toBe("link-to-file");
    expect(customData.fileIdentity).toEqual({
      volumeGuid: "VOL1",
      fileId: [1, 2, 3],
    });
    expect(customData.metadata.name).toBe("doc.txt");
  });

  it("does not update scene if user cancels pickFile", async () => {
    vi.mocked(pickFile).mockRejectedValueOnce(new CancelledBridgeError());

    await expect(
      createLinkToFile({ excalidrawAPI, sceneX: 0, sceneY: 0 }),
    ).rejects.toThrow(CancelledBridgeError);

    expect(updateSceneMock).not.toHaveBeenCalled();
  });

  it("does not update scene if bridge is offline", async () => {
    vi.mocked(pickFile).mockRejectedValueOnce(new InternalBridgeError());

    await expect(
      createLinkToFile({ excalidrawAPI, sceneX: 0, sceneY: 0 }),
    ).rejects.toThrow(InternalBridgeError);

    expect(updateSceneMock).not.toHaveBeenCalled();
  });
});
