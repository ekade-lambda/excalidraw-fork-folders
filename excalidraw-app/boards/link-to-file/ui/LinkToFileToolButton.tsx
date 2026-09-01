import React from "react";
import type { ExcalidrawImperativeAPI, AppState } from "@excalidraw/excalidraw/types";

export const LINK_TO_FILE_TOOL_CUSTOM_TYPE = "link-to-file";

export const LinkToFileToolButton = ({
  excalidrawAPI,
  activeTool,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI;
  activeTool?: AppState["activeTool"];
}) => {
  const activate = () => {
    excalidrawAPI.setActiveTool({
      type: "custom",
      customType: LINK_TO_FILE_TOOL_CUSTOM_TYPE,
      locked: true,
    });
  };

  const isActive =
    activeTool?.type === "custom" &&
    activeTool?.customType === LINK_TO_FILE_TOOL_CUSTOM_TYPE;
  const className = `ToolIcon ToolIcon_type_toggle ${
    isActive ? "ToolIcon--checked" : ""
  }`;

  return (
    <button
      type="button"
      title="Link to File Tool"
      className={className}
      onClick={activate}
    >
      <div className="ToolIcon__icon">🔗</div>
    </button>
  );
};
