import React from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

export const LINK_TO_FILE_TOOL_CUSTOM_TYPE = "link-to-file";

export const LinkToFileToolButton = ({
  excalidrawAPI,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI;
}) => {
  const activate = () => {
    excalidrawAPI.setActiveTool({
      type: "custom",
      customType: LINK_TO_FILE_TOOL_CUSTOM_TYPE,
      locked: true,
    });
  };

  return (
    <button
      type="button"
      title="Link to File Tool"
      className="board-tool-button"
      onClick={activate}
    >
      🔗
    </button>
  );
};
