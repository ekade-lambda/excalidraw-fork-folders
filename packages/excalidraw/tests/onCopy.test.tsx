import { vi } from "vitest";

import { Excalidraw } from "../index";

import { actionCopy, actionCut } from "../actions/actionClipboard";

import { render, waitFor } from "./test-utils";
import { API } from "./helpers/api";

Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn(),
  },
});
document.execCommand = vi.fn().mockReturnValue(true);

describe("onCopy hook", () => {
  it("should trigger onCopy with selected elements", async () => {
    const onCopy = vi.fn();
    await render(<Excalidraw onCopy={onCopy} />);
    const app = window.h.app;
    const rect = API.createElement({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    const rect2 = API.createElement({
      type: "rectangle",
      x: 200,
      y: 200,
      width: 100,
      height: 100,
    });

    // Board System entity simulation
    const folder = API.createElement({
      type: "rectangle",
      x: 300,
      y: 300,
      width: 100,
      height: 100,
    });
    Object.defineProperty(folder, "customData", {
      value: { folderBoard: { folderId: "f1", boardId: "b1" } },
      writable: true,
      enumerable: true,
    });

    API.setElements([rect, rect2, folder]);
    API.setSelectedElements([rect, folder]); // Mixed selection

    app.actionManager.executeAction(actionCopy);

    await waitFor(() => {
      expect(onCopy).toHaveBeenCalledTimes(1);
    });

    const copiedElements = onCopy.mock.calls[0][0];
    expect(copiedElements.length).toBe(2);
    expect(copiedElements.some((e: any) => e.id === rect.id)).toBe(true);
    expect(copiedElements.some((e: any) => e.id === folder.id)).toBe(true);

    // Verify customData is intact
    const copiedFolder = copiedElements.find((e: any) => e.id === folder.id);
    expect(copiedFolder.customData.folderBoard.folderId).toBe("f1");
  });

  it("should trigger exactly once on cut and delete selected", async () => {
    const onCopy = vi.fn();
    await render(<Excalidraw onCopy={onCopy} />);
    const app = window.h.app;
    const rect = API.createElement({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    API.setElements([rect]);
    API.setSelectedElements([rect]);

    app.actionManager.executeAction(actionCut);

    await waitFor(() => {
      expect(onCopy).toHaveBeenCalledTimes(1);
    });
  });

  it("should isolate exceptions thrown by onCopy", async () => {
    const onCopy = vi.fn().mockImplementation(() => {
      throw new Error("Host error");
    });
    await render(<Excalidraw onCopy={onCopy} />);
    const app = window.h.app;
    const rect = API.createElement({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    API.setElements([rect]);
    API.setSelectedElements([rect]);

    expect(() => {
      app.actionManager.executeAction(actionCopy);
    }).not.toThrow();

    await waitFor(() => {
      expect(onCopy).toHaveBeenCalledTimes(1);
    });
  });
});
