const fs = require('fs');
let content = fs.readFileSync('excalidraw-app/App.tsx', 'utf8');

// 1. Add import
if (!content.includes('LinkToFileContextMenu')) {
    content = content.replace(
        'import { hitTestLinkToFileAtPoint } from "./boards/link-to-file/host/hitTestLinkToFile";',
        'import { hitTestLinkToFileAtPoint } from "./boards/link-to-file/host/hitTestLinkToFile";\nimport { LinkToFileContextMenu, type LinkToFileCtx } from "./boards/link-to-file/ui/LinkToFileContextMenu";'
    );
}

// 2. Add state
if (!content.includes('linkToFileCtx')) {
    content = content.replace(
        'const [renameCtx, setRenameCtx] = useState<{',
        'const [linkToFileCtx, setLinkToFileCtx] = useState<LinkToFileCtx | null>(null);\n  const [renameCtx, setRenameCtx] = useState<{'
    );
}

// 3. handleGlobalPointerDown
content = content.replace(
    '// Clicked outside, close Rename\n      setRenameCtx(null);',
    '// Clicked outside, close Rename\n      setRenameCtx(null);\n      setLinkToFileCtx(null);'
);

// 4. handleHostContextMenu
const target =   const handleHostContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!excalidrawAPI) {
      return;
    }
    const { clientX, clientY } = event;
    const { x: sceneX, y: sceneY } = viewportCoordsToSceneCoords(
      { clientX, clientY },
      excalidrawAPI.getAppState(),
    );
    const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
    const hit = hitTestFolderAtPoint(elements, { x: sceneX, y: sceneY });

    if (hit.kind !== "none") {
      const fId = hit.kind === "folder" ? hit.folderId : hit.targetFolderId;
      let initialName = "";
      for (const el of elements) {
        const m = el.customData?.folderBoard;
        if (
          m &&
          (m.folderId === fId || m.targetFolderId === fId) &&
          m.role === "text"
        ) {
          initialName = (el as any).text || "";
          break;
        }
      }

      // It's a folder or pointer, but DO NOT intercept native menu to preserve it

      setRenameCtx({
        folderId: fId,
        initialName,
        x: clientX,
        y: clientY,
      });
    } else {
      setRenameCtx(null);
    }
  };;

const replacement =   const handleHostContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!excalidrawAPI) {
      return;
    }
    const { clientX, clientY } = event;
    const { x: sceneX, y: sceneY } = viewportCoordsToSceneCoords(
      { clientX, clientY },
      excalidrawAPI.getAppState(),
    );
    const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
    const hit = hitTestFolderAtPoint(elements, { x: sceneX, y: sceneY });
    const linkHit = hitTestLinkToFileAtPoint(elements, { x: sceneX, y: sceneY });

    if (hit.kind !== "none") {
      const fId = hit.kind === "folder" ? hit.folderId : hit.targetFolderId;
      let initialName = "";
      for (const el of elements) {
        const m = el.customData?.folderBoard;
        if (
          m &&
          (m.folderId === fId || m.targetFolderId === fId) &&
          m.role === "text"
        ) {
          initialName = (el as any).text || "";
          break;
        }
      }

      setRenameCtx({
        folderId: fId,
        initialName,
        x: clientX,
        y: clientY,
      });
      setLinkToFileCtx(null);
    } else if (linkHit.hit && linkHit.element && linkHit.linkData) {
      setLinkToFileCtx({
        element: linkHit.element,
        linkData: linkHit.linkData,
        x: clientX,
        y: clientY,
      });
      setRenameCtx(null);
    } else {
      setRenameCtx(null);
      setLinkToFileCtx(null);
    }
  };;

content = content.replace(target, replacement);

// 5. Render LinkToFileContextMenu
const renderTarget = {renameCtx && (;
const renderReplacement = {linkToFileCtx && (
          <LinkToFileContextMenu
            ctx={linkToFileCtx}
            excalidrawAPI={excalidrawAPI!}
            onClose={() => setLinkToFileCtx(null)}
          />
        )}

        {renameCtx && (;

content = content.replace(renderTarget, renderReplacement);

fs.writeFileSync('excalidraw-app/App.tsx', content);
