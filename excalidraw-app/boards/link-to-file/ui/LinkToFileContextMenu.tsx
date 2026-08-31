import React, { useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { LinkToFileData, LinkToFileVisualData } from "../types";
import { updateFileCardVisuals } from "./fileCard";

export interface LinkToFileCtx {
  element: ExcalidrawElement;
  linkData: LinkToFileData;
  x: number;
  y: number;
}

interface Props {
  ctx: LinkToFileCtx;
  excalidrawAPI: ExcalidrawImperativeAPI;
  onClose: () => void;
}

export const LinkToFileContextMenu: React.FC<Props> = ({ ctx, excalidrawAPI, onClose }) => {
  const [editingName, setEditingName] = useState(false);
  const visual = ctx.linkData.visual;
  const currentName = visual?.displayName || ctx.linkData.metadata.name;

  const handleUpdateVisuals = (newVisual: LinkToFileVisualData | undefined) => {
    const groupId = ctx.element.groupIds[0];
    if (!groupId) return;

    const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
    const updatedElements = updateFileCardVisuals(elements, groupId, newVisual);
    
    // updateScene updates history if we just pass the elements
    excalidrawAPI.updateScene({ elements: updatedElements });
  };

  const handleNameConfirm = (newName: string) => {
    const trimmed = newName.trim();
    const updatedVisual: LinkToFileVisualData = {
      ...visual,
      displayName: trimmed ? trimmed : undefined,
    };
    if (updatedVisual.displayName === undefined && updatedVisual.customImageFileId === undefined) {
       handleUpdateVisuals(undefined);
    } else {
       handleUpdateVisuals(updatedVisual);
    }
    setEditingName(false);
  };

  const handleSelectImage = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async () => {
        const dataURL = reader.result as string;
        
        // Generate BinaryFileData native to Excalidraw
        const fileId = "l2f-img-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
        
        excalidrawAPI.addFiles([{
          id: fileId as any,
          mimeType: file.type as any,
          dataURL: dataURL as any,
          created: Date.now(),
        }]);

        const updatedVisual: LinkToFileVisualData = {
          ...visual,
          customImageFileId: fileId,
        };
        handleUpdateVisuals(updatedVisual);
        onClose();
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const handleResetImage = () => {
    const updatedVisual: LinkToFileVisualData = { ...visual };
    delete updatedVisual.customImageFileId;

    if (updatedVisual.displayName === undefined && updatedVisual.customImageFileId === undefined) {
       handleUpdateVisuals(undefined);
    } else {
       handleUpdateVisuals(updatedVisual);
    }
    onClose();
  };

  const handleResetName = () => {
    const updatedVisual: LinkToFileVisualData = { ...visual };
    delete updatedVisual.displayName;

    if (updatedVisual.displayName === undefined && updatedVisual.customImageFileId === undefined) {
       handleUpdateVisuals(undefined);
    } else {
       handleUpdateVisuals(updatedVisual);
    }
    onClose();
  };

  return (
    <div
      className="link-to-file-ui"
      style={{
        position: "absolute",
        top: ctx.y,
        left: ctx.x,
        zIndex: 999999,
        background: "white",
        padding: "4px",
        boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
        transform: "translate(0, -110%)",
        borderRadius: "4px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {editingName ? (
        <input
          autoFocus
          defaultValue={currentName}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleNameConfirm(e.currentTarget.value);
            if (e.key === "Escape") setEditingName(false);
          }}
          onBlur={(e) => {
             const relatedTarget = e.relatedTarget as HTMLElement | null;
             if (relatedTarget && relatedTarget.closest(".excalidraw-container")) {
                 setEditingName(false);
             }
          }}
          style={{ marginBottom: "4px" }}
        />
      ) : (
        <>
          <div
            onClick={() => setEditingName(true)}
            style={{ padding: "4px 8px", cursor: "pointer", borderBottom: "1px solid #eee" }}
          >
            Rename File Card
          </div>
          {visual?.displayName && (
            <div
              onClick={handleResetName}
              style={{ padding: "4px 8px", cursor: "pointer", borderBottom: "1px solid #eee", color: "orange" }}
            >
              Reset Original Name
            </div>
          )}
          <div
            onClick={handleSelectImage}
            style={{ padding: "4px 8px", cursor: "pointer", borderBottom: "1px solid #eee" }}
          >
            Set Custom Image
          </div>
          {visual?.customImageFileId && (
            <div
              onClick={handleResetImage}
              style={{ padding: "4px 8px", cursor: "pointer", color: "orange" }}
            >
              Reset Original Icon
            </div>
          )}
        </>
      )}
    </div>
  );
};
