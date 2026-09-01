/**
 * Board System — ui / ToolButtons (Fase 3).
 *
 * Botones host para activar las custom tools del Board System. En Fase 3 solo
 * existe el botón de «Folder tool». Se monta desde App.tsx (composition root).
 *
 * No guarda en localStorage ni toca el dominio: solo llama a
 * `excalidrawAPI.setActiveTool` con la custom tool del fork.
 */

import React from "react";

import type { ExcalidrawImperativeAPI, AppState } from "@excalidraw/excalidraw/types";

export const FOLDER_TOOL_CUSTOM_TYPE = "folder";
export const FOLDER_POINTER_TOOL_CUSTOM_TYPE = "folderPointer";

export const FolderToolButton = ({
  excalidrawAPI,
  activeTool,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI;
  activeTool?: AppState["activeTool"];
}) => {
  const activate = () => {
    excalidrawAPI.setActiveTool({
      type: "custom",
      customType: FOLDER_TOOL_CUSTOM_TYPE,
      locked: true,
    });
  };

  const isActive =
    activeTool?.type === "custom" &&
    activeTool?.customType === FOLDER_TOOL_CUSTOM_TYPE;
  const className = `ToolIcon ToolIcon_type_toggle ${
    isActive ? "ToolIcon--checked" : ""
  }`;

  return (
    <button
      type="button"
      title="Folder tool"
      className={className}
      onClick={activate}
    >
      <div className="ToolIcon__icon">📁</div>
    </button>
  );
};

export const FolderPointerToolButton = ({
  excalidrawAPI,
  activeTool,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI;
  activeTool?: AppState["activeTool"];
}) => {
  const activate = () => {
    excalidrawAPI.setActiveTool({
      type: "custom",
      customType: FOLDER_POINTER_TOOL_CUSTOM_TYPE,
      locked: true, // Queda lockeado hasta que el usuario decida en el picker
    });
  };

  const isActive =
    activeTool?.type === "custom" &&
    activeTool?.customType === FOLDER_POINTER_TOOL_CUSTOM_TYPE;
  const className = `ToolIcon ToolIcon_type_toggle ${
    isActive ? "ToolIcon--checked" : ""
  }`;

  return (
    <button
      type="button"
      title="Folder Pointer tool"
      className={className}
      onClick={activate}
    >
      <div className="ToolIcon__icon">↗📁</div>
    </button>
  );
};
