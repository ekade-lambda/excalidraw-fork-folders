import sys

with open('excalidraw-app/App.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

imports_to_add = '''
import { useAtom } from \"jotai\";
import { sessionClipboardAtom } from \"./boards/clipboard\";
import { handleOnCopy } from \"./boards/host/copy\";
import { handleOnPaste } from \"./boards/host/paste\";
'''

# Add imports after import { AppSidebar } from \"./components/AppSidebar\";
content = content.replace(
    'import { AppSidebar } from \"./components/AppSidebar\";',
    'import { AppSidebar } from \"./components/AppSidebar\";\\n' + imports_to_add
)

# Add hooks near onDuplicate
on_copy_paste_hooks = '''
  const [clipboardData, setClipboardData] = useAtom(sessionClipboardAtom);

  const onCopy = useCallback(
    (elements: readonly ExcalidrawElement[]) => {
      if (boardRepo.loadSync) {
        const graph = boardRepo.loadSync();
        if (graph) {
          setClipboardData(handleOnCopy(elements, graph));
        }
      }
    },
    [boardRepo, setClipboardData],
  );

  const onPaste = useCallback(
    (data: any, event: ClipboardEvent | null) => {
      return handleOnPaste(
        data,
        clipboardData,
        boardRepo,
        boardsStoreActions.getCurrentFolderId(),
      );
    },
    [boardRepo, clipboardData],
  );

'''

content = content.replace(
    '  const onDuplicate = useCallback(',
    on_copy_paste_hooks + '  const onDuplicate = useCallback('
)

# Pass onCopy and onPaste to Excalidraw
content = content.replace(
    'onDuplicate={onDuplicate}',
    'onDuplicate={onDuplicate}\\n          onCopy={onCopy}\\n          onPaste={onPaste}'
)

with open('excalidraw-app/App.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
