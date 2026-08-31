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

  it("creates a File Card (3 elements) and updates scene when file is picked", async () => {
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
    expect(elements).toHaveLength(3); // Background, Icon, Label

    const bg = elements[0];
    const icon = elements[1];
    const label = elements[2];

    expect(bg.type).toBe("rectangle");
    expect(icon.type).toBe("text");
    expect(label.type).toBe("text");

    expect(icon.text).toBe("📄"); // Icono para .txt
    expect(label.text).toBe("doc.txt"); // Nombre

    // Tienen el mismo groupId
    const groupId = bg.groupIds[0];
    expect(groupId).toBeDefined();
    expect(icon.groupIds[0]).toBe(groupId);
    expect(label.groupIds[0]).toBe(groupId);

    // Tienen customData idéntica excepto el role
    expect(bg.customData.type).toBe("link-to-file");
    expect(bg.customData.role).toBe("background");
    expect(icon.customData.role).toBe("icon");
    expect(label.customData.role).toBe("label");

    expect(bg.customData.fileIdentity).toEqual({
      volumeGuid: "VOL1",
      fileId: [1, 2, 3],
    });
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
