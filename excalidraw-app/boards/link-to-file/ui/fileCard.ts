import { newElement, newTextElement, newImageElement } from "@excalidraw/element";
import type { ExcalidrawElement, ExcalidrawImageElement } from "@excalidraw/element/types";
import type { LinkToFileData, LinkToFileVisualData } from "../types";

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

  // 2. Icon (or Image)
  const icon = buildIconElement({
    sceneX: opts.sceneX,
    sceneY: opts.sceneY,
    groupId,
    customData: opts.customData,
  });

  // 3. Label (Truncated visually if too long)
  const rawName = opts.customData.visual?.displayName || name;
  let displayName = rawName;
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
export function buildIconElement(
  opts: {
    sceneX: number;
    sceneY: number;
    groupId: string;
    customData: LinkToFileData;
  }
): ExcalidrawElement {
  const visual = opts.customData.visual;
  if (visual?.customImageFileId) {
    return newImageElement({
      type: "image",
      x: opts.sceneX + 16,
      y: opts.sceneY + 16,
      width: 28, // Standard icon size
      height: 28,
      fileId: visual.customImageFileId as any,
      status: "saved",
      groupIds: [opts.groupId],
      customData: { ...opts.customData, role: "icon" },
    });
  }

  return newTextElement({
    text: getIconForExtension(opts.customData.metadata.name),
    x: opts.sceneX + 16,
    y: opts.sceneY + 16,
    fontSize: 24,
    strokeColor: "#000000",
    groupIds: [opts.groupId],
    customData: { ...opts.customData, role: "icon" },
  });
}

export function updateFileCardVisuals(
  elements: readonly ExcalidrawElement[],
  groupId: string,
  newVisual: LinkToFileVisualData | undefined
): readonly ExcalidrawElement[] {
  // Find all elements of this group
  const groupElements = elements.filter(el => el.groupIds.includes(groupId));
  const bg = groupElements.find(el => (el.customData as LinkToFileData)?.role === "background");
  const icon = groupElements.find(el => (el.customData as LinkToFileData)?.role === "icon");
  const label = groupElements.find(el => (el.customData as LinkToFileData)?.role === "label");

  if (!bg || !icon || !label) {
    return elements; // Incomplete card, fallback
  }

  const baseData = bg.customData as LinkToFileData;
  const newCustomData: LinkToFileData = {
    ...baseData,
    visual: newVisual
  };

  // Build new bg (preserve id)
  const newBg = { ...bg, customData: { ...newCustomData, role: "background" } };

  // Build new label (preserve id, update text)
  const rawName = newVisual?.displayName || newCustomData.metadata.name;
  let displayName = rawName;
  if (displayName.length > 22) {
    displayName = displayName.substring(0, 19) + "...";
  }
  const newLabel = { 
    ...label, 
    text: displayName,
    originalText: displayName,
    customData: { ...newCustomData, role: "label" } 
  };

  // Build new icon. If type changes or customImageFileId changes, we generate a fresh element
  // Or we could just always generate a fresh element, but preserving id is better if type hasn't changed.
  let newIcon = buildIconElement({
    sceneX: bg.x,
    sceneY: bg.y,
    groupId,
    customData: newCustomData,
  });

  // Preserve id if type matches (so Undo doesn't see a delete/create if not necessary)
  if (newIcon.type === icon.type) {
    newIcon = { ...newIcon, id: icon.id };
  }

  // Swap them in the array
  return elements.map(el => {
    if (el.id === bg.id) return newBg;
    if (el.id === label.id) return newLabel;
    if (el.id === icon.id) return newIcon;
    return el;
  });
}
