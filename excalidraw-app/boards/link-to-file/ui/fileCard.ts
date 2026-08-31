import { newElement, newTextElement } from "@excalidraw/element";
import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { LinkToFileData } from "../types";

export function getIconForExtension(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "pdf": return "📕";
    case "doc":
    case "docx": return "📘";
    case "txt":
    case "md": return "📄";
    case "mp4":
    case "mkv":
    case "avi": return "🎬";
    case "jpg":
    case "jpeg":
    case "png":
    case "gif": return "🖼️";
    case "zip":
    case "rar":
    case "7z": return "📦";
    default: return "📎";
  }
}

export function newGroupId(): string {
  return `l2f-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function createFileCardElements(opts: {
  sceneX: number;
  sceneY: number;
  customData: LinkToFileData;
}): ExcalidrawElement[] {
  const groupId = newGroupId();
  const name = opts.customData.metadata.name;

  const CARD_WIDTH = 280;
  const CARD_HEIGHT = 60;

  // 1. Rectangle (Background)
  const bg = newElement({
    type: "rectangle",
    x: opts.sceneX,
    y: opts.sceneY,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    strokeColor: "#ced4da",
    backgroundColor: "#f8f9fa",
    fillStyle: "solid",
    strokeWidth: 1,
    roundness: { type: 3 }, // adaptive radius
    groupIds: [groupId],
    customData: { ...opts.customData, role: "background" },
  });

  // 2. Icon
  const icon = newTextElement({
    text: getIconForExtension(name),
    x: opts.sceneX + 16,
    y: opts.sceneY + 16,
    fontSize: 24,
    strokeColor: "#000000",
    groupIds: [groupId],
    customData: { ...opts.customData, role: "icon" },
  });

  // 3. Label (Truncated visually if too long)
  let displayName = name;
  if (displayName.length > 22) {
    displayName = displayName.substring(0, 19) + "...";
  }

  const label = newTextElement({
    text: displayName,
    x: opts.sceneX + 54,
    y: opts.sceneY + 18,
    fontSize: 16,
    fontFamily: 1, // Virgil
    strokeColor: "#1e1e1e",
    groupIds: [groupId],
    customData: { ...opts.customData, role: "label" },
  });

  return [bg, icon, label];
}
