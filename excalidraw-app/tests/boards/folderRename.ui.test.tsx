import { describe, expect, it, beforeEach } from "vitest";
import React from "react";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";

import ExcalidrawApp from "../../App";
import { LocalStorageBoardRepository } from "../../boards/repository/LocalStorageBoardRepository";

describe("Folder Rename UI Tests", () => {
  beforeEach(() => {
    localStorage.clear();
    const repo = new LocalStorageBoardRepository();
    // Ensure repo has some data so it doesn't crash
    repo.saveSync({
      schemaVersion: 1,
      rootFolderId: "root",
      folders: {
        root: {
          id: "root",
          name: "root",
          parentId: null,
          boardId: "b-root",
          createdAt: 0,
          updatedAt: 0,
          icon: null,
        },
      },
      boards: {
        "b-root": {
          id: "b-root",
          name: "root",
          createdAt: 0,
          updatedAt: 0,
          rootFolderId: "root",
        },
      },
      pointers: {},
      lastOpenBoardId: "b-root",
      folderCounter: 0,
    });
  });

  it("should show rename context menu on right click of folder and rename it", async () => {
    const { container } = render(<ExcalidrawApp />);

    // Wait for the app wrapper to be available
    await waitFor(() => {
      expect(container.querySelector(".excalidraw-app")).not.toBeNull();
    });

    const wrapper = container.querySelector(".excalidraw-app")!;

    // Inject a fake excalidraw container to simulate focusContainer()
    const excalidrawContainer = document.createElement("div");
    excalidrawContainer.className = "excalidraw-container";
    excalidrawContainer.tabIndex = -1;
    wrapper.appendChild(excalidrawContainer);

    // We need to inject an element via window.h
    const h = (window as any).h;

    await waitFor(() => {
      expect(h.elements).toBeDefined();
    });

    // Inject a visual folder element
    const folderTextElement = {
      id: "f-el-1",
      type: "rectangle",
      x: 100,
      y: 100,
      width: 100,
      height: 50,
      text: "Carpeta Vieja",
      isDeleted: false,
      customData: {
        folderBoard: { folderId: "f1", kind: "folder", role: "text" },
      },
    };

    h.elements = [folderTextElement];

    // Perform right click inside the element's bounding box
    fireEvent.contextMenu(wrapper, { clientX: 110, clientY: 110 });

    // The Rename menu should appear
    await waitFor(() => {
      expect(screen.getByText("Rename")).toBeInTheDocument();
      // AND the native Excalidraw context menu MUST also appear!
      expect(
        document.querySelector(".context-menu") ||
          document.querySelector(".excalidraw-contextMenuContainer"),
      ).not.toBeNull();
    });

    // Click Rename

    // Simulamos pointerDown sobre Rename
    fireEvent.pointerDown(screen.getByText("Rename"));

    // Simulamos que Excalidraw cierra su context-menu en pointerdown (como lo hace en la realidad)
    document.querySelector(".context-menu")?.remove();

    // Input should appear
    const input = screen.getByDisplayValue("Carpeta Vieja") as HTMLInputElement;
    expect(input).toBeInTheDocument();

    // Simular el robo programático de foco por Excalidraw's focusContainer()
    fireEvent.blur(input, { relatedTarget: excalidrawContainer });

    // Rename NO debe destruirse
    expect(input).toBeInTheDocument();

    // Change value
    fireEvent.change(input, { target: { value: "Nueva Carpeta" } });

    // Press Escape to cancel
    fireEvent.keyDown(input, { key: "Escape" });

    // The menu should close and the input should disappear
    await waitFor(() => {
      expect(
        screen.queryByDisplayValue("Nueva Carpeta"),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Rename")).not.toBeInTheDocument();
    });

    // Right click again
    fireEvent.contextMenu(wrapper, { clientX: 110, clientY: 110 });
    await waitFor(() => {
      expect(screen.getByText("Rename")).toBeInTheDocument();
    });

    // Click Rename

    // Simulamos pointerDown sobre Rename
    fireEvent.pointerDown(screen.getByText("Rename"));

    // Simulamos que Excalidraw cierra su context-menu en pointerdown (como lo hace en la realidad)
    document.querySelector(".context-menu")?.remove();

    const input2 = screen.getByDisplayValue(
      "Carpeta Vieja",
    ) as HTMLInputElement;

    // Change value
    fireEvent.change(input2, { target: { value: "Carpeta 2" } });

    // Press Enter to confirm
    fireEvent.keyDown(input2, { key: "Enter" });

    // Input disappears
    await waitFor(() => {
      expect(screen.queryByDisplayValue("Carpeta 2")).not.toBeInTheDocument();
    });

    // We can't trivially check BoardsGraph here without spying,
    // but the test verifies the UI flow works completely!
  });

  it("should NOT show rename menu when clicking outside a folder", async () => {
    const { container } = render(<ExcalidrawApp />);
    await waitFor(() => {
      expect(container.querySelector(".excalidraw-app")).not.toBeNull();
    });

    const wrapper = container.querySelector(".excalidraw-app")!;

    // Inject a fake excalidraw container to simulate focusContainer()
    const excalidrawContainer = document.createElement("div");
    excalidrawContainer.className = "excalidraw-container";
    excalidrawContainer.tabIndex = -1;
    wrapper.appendChild(excalidrawContainer);

    const h = (window as any).h;
    await waitFor(() => expect(h.elements).toBeDefined());

    h.elements = [
      {
        id: "normal-rect",
        type: "rectangle",
        x: 10,
        y: 10,
        width: 100,
        height: 100,
        isDeleted: false,
      },
    ];

    // Right click on normal rect
    fireEvent.contextMenu(wrapper, { clientX: 20, clientY: 20 });

    // "Rename" should NOT appear (Excalidraw's native context menu might, but not our custom one)
    expect(screen.queryByText("Rename")).not.toBeInTheDocument();
  });
});
