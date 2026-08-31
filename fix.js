const fs = require('fs');
let content = fs.readFileSync('excalidraw-app/App.tsx', 'utf8');

if (!content.includes('LinkToFileContextMenu')) {
    content = content.replace(
        'import { hitTestLinkToFileAtPoint } from "./boards/link-to-file/host/hitTestLinkToFile";',
        'import { hitTestLinkToFileAtPoint } from "./boards/link-to-file/host/hitTestLinkToFile";\nimport { LinkToFileContextMenu, type LinkToFileCtx } from "./boards/link-to-file/ui/LinkToFileContextMenu";'
    );
}

if (!content.includes('const [linkToFileCtx')) {
    content = content.replace(
        'const [renameCtx, setRenameCtx] = useState<{',
        'const [linkToFileCtx, setLinkToFileCtx] = useState<LinkToFileCtx | null>(null);\n  const [renameCtx, setRenameCtx] = useState<{'
    );
}

fs.writeFileSync('excalidraw-app/App.tsx', content);
