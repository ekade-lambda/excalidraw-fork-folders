/**
 * Board System — host / materialize (Fase 3).
 *
 * Materialización VISUAL de una Folder en el canvas como 2 elementos nativos
 * de Excalidraw (imagen + texto) agrupados, con `customData.folderBoard` como
 * identidad. Funciones PURAS (tests fáciles, sin core/React): la orquestación
 * con el editor (updateScene) está en folderService.
 *
 * customData (§5.2):
 *   { kind:"folder", folderId, boardId, reprId, role:"image"|"text" }
 */

import { newImageElement, newTextElement } from "@excalidraw/element";

import type { FileId } from "@excalidraw/element/types";
import type { BinaryFileData } from "@excalidraw/excalidraw/types";
import type {
  ExcalidrawElement,
  ExcalidrawImageElement,
  ExcalidrawTextElement,
} from "@excalidraw/element/types";

import type { BoardId, FolderId } from "../types";

/** Identidad de un elemento del Board System almacenada en customData. */
export type FolderBoardVisualMeta =
  | {
      kind: "folder";
      folderId: FolderId;
      boardId: BoardId;
      reprId: string;
      role: "image" | "text";
    }
  | {
      kind: "pointer";
      pointerId: string;
      targetFolderId: FolderId;
      boardId: BoardId;
      reprId: string;
      role: "image" | "text";
    };

export interface FolderVisual {
  primary: ExcalidrawImageElement;
  text: ExcalidrawTextElement;
  groupId: string;
  fileId: FileId;
  imageFile: BinaryFileData;
}

const FOLDER_SIZE = 120;
const LABEL_GAP = 8;
const LABEL_FONT_SIZE = 16;

/** dataURL SVG de una carpeta por defecto (icono). */
export function buildFolderImageDataUrl(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90" viewBox="0 0 120 90" fill="none">
  <rect x="4" y="20" width="112" height="66" rx="6" fill="#f1c15d" stroke="#b8860b" stroke-width="3"/>
  <path d="M4 38 L116 38" stroke="#b8860b" stroke-width="3"/>
  <rect x="10" y="26" width="30" height="12" rx="3" fill="#f7d794"/>
  <rect x="48" y="26" width="30" height="12" rx="3" fill="#f7d794"/>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Genera un FileId con alta entropía para la imagen de la carpeta. */
export function newFileId(): FileId {
  return `boardfile-${Math.random().toString(36).slice(2)}${Date.now().toString(
    36,
  )}` as FileId;
}

/** Genera un reprId único de representación visual. */
export function newReprId(): string {
  return `repr-${Math.random().toString(36).slice(2)}${Date.now().toString(
    36,
  )}`;
}

/** Crea el BinaryFileData (imagen) para el fileId indicado. */
export function buildFolderImageFile(
  fileId: FileId,
  dataUrl: string,
): BinaryFileData {
  return {
    id: fileId,
    mimeType: "image/svg+xml" as BinaryFileData["mimeType"],
    dataURL: dataUrl as BinaryFileData["dataURL"],
    created: Date.now(),
  };
}

function withMeta<T extends ExcalidrawElement>(
  el: T,
  meta: FolderBoardVisualMeta,
): T {
  return { ...el, customData: { ...el.customData, folderBoard: meta } } as T;
}

/**
 * Construye los 2 elementos de Excalidraw que representan una Folder en el
 * board padre (imagen + texto agrupados) + el archivo de imagen.
 */
export function buildFolderVisual(opts: {
  folderId: FolderId;
  boardId: BoardId;
  name: string;
  sceneX: number;
  sceneY: number;
  iconDataUrl?: string;
}): FolderVisual {
  const reprId = newReprId();
  const groupId = newReprId();
  const icon = opts.iconDataUrl ?? buildFolderImageDataUrl();
  const fileId = newFileId();
  const imageFile = buildFolderImageFile(fileId, icon);

  const image = withMeta(
    newImageElement({
      type: "image",
      fileId,
      width: FOLDER_SIZE,
      height: FOLDER_SIZE,
      x: opts.sceneX,
      y: opts.sceneY,
      groupIds: [groupId],
    }),
    {
      kind: "folder",
      folderId: opts.folderId,
      boardId: opts.boardId,
      reprId,
      role: "image",
    },
  );

  const text = withMeta(
    newTextElement({
      text: opts.name,
      fontSize: LABEL_FONT_SIZE,
      x: opts.sceneX,
      y: opts.sceneY + FOLDER_SIZE + LABEL_GAP,
      groupIds: [groupId],
    }),
    {
      kind: "folder",
      folderId: opts.folderId,
      boardId: opts.boardId,
      reprId,
      role: "text",
    },
  );

  return { primary: image, text, groupId, fileId, imageFile };
}

/** Encuentra los elementos visuales de una folder en una lista (§5.3). */
export function findFolderVisual(
  elements: readonly ExcalidrawElement[],
  folderId: FolderId,
): { primary?: ExcalidrawElement; text?: ExcalidrawElement } | null {
  let primary: ExcalidrawElement | undefined;
  let text: ExcalidrawElement | undefined;
  for (const el of elements) {
    const meta = el.customData?.folderBoard as
      | FolderBoardVisualMeta
      | undefined;
    if (meta?.kind === "folder" && meta.folderId === folderId) {
      if (meta.role === "image") {
        primary = el;
      } else if (meta.role === "text") {
        text = el;
      }
    }
  }
  return primary || text ? { primary, text } : null;
}

export function buildPointerVisual(opts: {
  pointerId: string;
  targetFolderId: FolderId;
  boardId: BoardId;
  name: string;
  sceneX: number;
  sceneY: number;
}): FolderVisual {
  const reprId = newReprId();
  const fileId = newFileId();
  const groupId = newReprId(); // un random string que sirve de group id

  // 1. Imagen por defecto
  const dataUrl = buildFolderImageDataUrl();
  const imageFile = buildFolderImageFile(fileId, dataUrl);

  const baseImage = newImageElement({
    type: "image",
    x: opts.sceneX,
    y: opts.sceneY,
    width: FOLDER_SIZE,
    height: (FOLDER_SIZE * 3) / 4,
    fileId,
    status: "saved",
    groupIds: [groupId],
    strokeColor: "transparent",
    backgroundColor: "transparent",
  });

  const image = withMeta<ExcalidrawImageElement>(
    baseImage as ExcalidrawImageElement,
    {
      kind: "pointer",
      pointerId: opts.pointerId,
      targetFolderId: opts.targetFolderId,
      boardId: opts.boardId,
      reprId,
      role: "image",
    },
  );

  // 2. Etiqueta (con prefijo ↗)
  const label = opts.name.startsWith("↗") ? opts.name : `↗ ${opts.name}`;
  const baseText = newTextElement({
    x: opts.sceneX,
    y: opts.sceneY + image.height + LABEL_GAP,
    text: label,
    originalText: label,
    fontSize: LABEL_FONT_SIZE,
    fontFamily: 1, // Virgil
    textAlign: "center",
    groupIds: [groupId],
    strokeColor: "#000000",
    backgroundColor: "transparent",
    width: Math.max(FOLDER_SIZE, label.length * 10), // aprox
  });

  const text = withMeta<ExcalidrawTextElement>(
    baseText as ExcalidrawTextElement,
    {
      kind: "pointer",
      pointerId: opts.pointerId,
      targetFolderId: opts.targetFolderId,
      boardId: opts.boardId,
      reprId,
      role: "text",
    },
  );

  return { primary: image, text, groupId, fileId, imageFile };
}
