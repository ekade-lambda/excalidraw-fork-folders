import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";

import { render, fireEvent, screen } from "@testing-library/react";

import { NavBar } from "../../boards/ui/NavBar";
import { LocalStorageBoardRepository } from "../../boards/repository/LocalStorageBoardRepository";
import * as workspaceModule from "../../boards/host/workspace";

// Mock dependencies
vi.mock("../../boards/host/boardState", () => ({
  useBoardsState: () => ({ currentFolderId: "f-root", navigationHistory: [] }),
}));
vi.mock("../../boards/host/navigation", () => ({
  canGoBack: () => false,
  canGoForward: () => false,
}));
vi.mock("../../boards/host/boardService", () => ({
  navigateBack: vi.fn(),
  navigateForward: vi.fn(),
  navigateToBreadcrumb: vi.fn(),
}));
vi.mock("@excalidraw/excalidraw/types", () => ({}));
vi.mock("../../boards/domain/graph", () => ({
  ancestors: () => [],
}));

describe("Workspace UI (NavBar)", () => {
  let repo: LocalStorageBoardRepository;
  let excalidrawAPI: any;

  beforeEach(() => {
    repo = new LocalStorageBoardRepository();
    repo.load = vi
      .fn()
      .mockResolvedValue({ folders: {}, rootFolderId: "f-root" });
    excalidrawAPI = {};

    // Mock global objects
    global.URL.createObjectURL = vi.fn(() => "blob:mock");
    global.URL.revokeObjectURL = vi.fn();
    global.alert = vi.fn();

    // Spy on workspace module
    vi.spyOn(workspaceModule, "exportWorkspace").mockResolvedValue(
      '{"schemaVersion":1}',
    );
    vi.spyOn(workspaceModule, "importWorkspace").mockResolvedValue(undefined);
  });

  it("Export from UI triggers exportWorkspace", async () => {
    render(<NavBar repo={repo} excalidrawAPI={excalidrawAPI} />);
    const exportBtn = await screen.findByTitle("Export Workspace");

    const mockAnchor = { href: "", download: "", click: vi.fn() };
    const originalCreateElement = document.createElement.bind(document);
    const spyCreateElement = vi
      .spyOn(document, "createElement")
      .mockImplementation((tag) => {
        if (tag === "a") {
          return mockAnchor as any;
        }
        return originalCreateElement(tag);
      });

    fireEvent.click(exportBtn);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(workspaceModule.exportWorkspace).toHaveBeenCalledWith(repo);
    expect(mockAnchor.download).toBe("Workspace.excaliwork");
    expect(mockAnchor.click).toHaveBeenCalled();

    spyCreateElement.mockRestore();
  });

  it("Import valid file executes flow when confirmed", async () => {
    render(<NavBar repo={repo} excalidrawAPI={excalidrawAPI} />);
    const importBtn = await screen.findByTitle("Import Workspace");

    const mockInput: any = { type: "file", click: vi.fn() };
    const originalCreateElement = document.createElement.bind(document);
    const spyCreateElement = vi
      .spyOn(document, "createElement")
      .mockImplementation((tag) => {
        if (tag === "input") {
          return mockInput;
        }
        return originalCreateElement(tag);
      });

    global.confirm = vi.fn(() => true);
    const locationReload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload: locationReload },
      writable: true,
    });

    fireEvent.click(importBtn);

    // Inject mock file
    const mockFile = new File(['{"schemaVersion":1}'], "Workspace.excaliwork", {
      type: "application/json",
    });
    mockFile.text = async () => '{"schemaVersion":1}';

    if (mockInput.onchange) {
      await mockInput.onchange({ target: { files: [mockFile] } });
    }

    expect(global.confirm).toHaveBeenCalled();
    expect(workspaceModule.importWorkspace).toHaveBeenCalledWith(
      '{"schemaVersion":1}',
      repo,
    );
    expect(locationReload).toHaveBeenCalled();

    spyCreateElement.mockRestore();
  });

  it("Import canceled at confirm does not modify workspace", async () => {
    render(<NavBar repo={repo} excalidrawAPI={excalidrawAPI} />);
    const importBtn = await screen.findByTitle("Import Workspace");

    const mockInput: any = { type: "file", click: vi.fn() };
    const originalCreateElement = document.createElement.bind(document);
    const spyCreateElement = vi
      .spyOn(document, "createElement")
      .mockImplementation((tag) => {
        if (tag === "input") {
          return mockInput;
        }
        return originalCreateElement(tag);
      });

    global.confirm = vi.fn(() => false);

    fireEvent.click(importBtn);

    const mockFile = new File(['{"schemaVersion":1}'], "Workspace.excaliwork", {
      type: "application/json",
    });
    mockFile.text = async () => '{"schemaVersion":1}';
    if (mockInput.onchange) {
      await mockInput.onchange({ target: { files: [mockFile] } });
    }

    expect(global.confirm).toHaveBeenCalled();
    expect(workspaceModule.importWorkspace).not.toHaveBeenCalled();

    spyCreateElement.mockRestore();
  });

  it("Import with error during importWorkspace alerts user and does not reload", async () => {
    render(<NavBar repo={repo} excalidrawAPI={excalidrawAPI} />);
    const importBtn = await screen.findByTitle("Import Workspace");

    const mockInput: any = { type: "file", click: vi.fn() };
    const originalCreateElement = document.createElement.bind(document);
    const spyCreateElement = vi
      .spyOn(document, "createElement")
      .mockImplementation((tag) => {
        if (tag === "input") {
          return mockInput;
        }
        return originalCreateElement(tag);
      });

    global.confirm = vi.fn(() => true);
    const locationReload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload: locationReload },
      writable: true,
    });

    vi.spyOn(workspaceModule, "importWorkspace").mockRejectedValue(
      new Error("Invalid file"),
    );

    fireEvent.click(importBtn);

    const mockFile = new File(["corrupt"], "Workspace.excaliwork", {
      type: "application/json",
    });
    mockFile.text = async () => "corrupt";
    if (mockInput.onchange) {
      await mockInput.onchange({ target: { files: [mockFile] } });
    }

    expect(global.alert).toHaveBeenCalledWith(
      expect.stringContaining("Import failed: Invalid file"),
    );
    expect(locationReload).not.toHaveBeenCalled();

    spyCreateElement.mockRestore();
  });
});
