import { describe, it, expect } from "vitest";
import { getCustomToolExecutionPlan } from "./customToolsDispatcher";
import { FOLDER_TOOL_CUSTOM_TYPE, FOLDER_POINTER_TOOL_CUSTOM_TYPE } from "../ui/ToolButtons";
import { LINK_TO_FILE_TOOL_CUSTOM_TYPE } from "../link-to-file/ui/LinkToFileToolButton";

describe("getCustomToolExecutionPlan", () => {
  it("LINK_TO_FILE_TOOL_CUSTOM_TYPE funciona cuando parentFolderId === null", () => {
    const plan = getCustomToolExecutionPlan(LINK_TO_FILE_TOOL_CUSTOM_TYPE, null);
    expect(plan).toBe("CREATE_LINK_TO_FILE");
  });

  it("LINK_TO_FILE_TOOL_CUSTOM_TYPE funciona cuando parentFolderId existe", () => {
    const plan = getCustomToolExecutionPlan(LINK_TO_FILE_TOOL_CUSTOM_TYPE, "folder-123");
    expect(plan).toBe("CREATE_LINK_TO_FILE");
  });

  it("FOLDER_TOOL y FOLDER_POINTER_TOOL siguen requiriendo su contexto correspondiente (parentFolderId)", () => {
    // Si no hay parentFolderId, fallan (devuelven NONE)
    expect(getCustomToolExecutionPlan(FOLDER_TOOL_CUSTOM_TYPE, null)).toBe("NONE");
    expect(getCustomToolExecutionPlan(FOLDER_POINTER_TOOL_CUSTOM_TYPE, null)).toBe("NONE");

    // Si hay parentFolderId, funcionan
    expect(getCustomToolExecutionPlan(FOLDER_TOOL_CUSTOM_TYPE, "folder-123")).toBe("CREATE_FOLDER");
    expect(getCustomToolExecutionPlan(FOLDER_POINTER_TOOL_CUSTOM_TYPE, "folder-123")).toBe("SET_POINTER_POS");
  });
});
