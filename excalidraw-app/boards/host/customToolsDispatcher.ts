import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { FOLDER_TOOL_CUSTOM_TYPE, FOLDER_POINTER_TOOL_CUSTOM_TYPE } from "../ui/ToolButtons";
import { LINK_TO_FILE_TOOL_CUSTOM_TYPE } from "../link-to-file/ui/LinkToFileToolButton";

export function getCustomToolExecutionPlan(
  customType: string,
  parentFolderId: string | null
): "CREATE_FOLDER" | "SET_POINTER_POS" | "CREATE_LINK_TO_FILE" | "NONE" {
  if (customType === FOLDER_TOOL_CUSTOM_TYPE) {
    if (!parentFolderId) return "NONE";
    return "CREATE_FOLDER";
  } else if (customType === FOLDER_POINTER_TOOL_CUSTOM_TYPE) {
    if (!parentFolderId) return "NONE";
    return "SET_POINTER_POS";
  } else if (customType === LINK_TO_FILE_TOOL_CUSTOM_TYPE) {
    // LINK_TO_FILE_TOOL NO requiere parentFolderId (root canvas u otro contexto está bien)
    return "CREATE_LINK_TO_FILE";
  }
  return "NONE";
}
