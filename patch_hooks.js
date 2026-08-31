const fs = require('fs');
let content = fs.readFileSync('excalidraw-app/App.tsx', 'utf8');

const target =   // Global click-outside detector for Rename UI
  useEffect(() => {
    if (!renameCtx) {
      return;
    }

    const handleGlobalPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      const renameElement = document.querySelector(".board-rename-ui");

      if (renameElement && renameElement.contains(target)) {
        // Clicked inside Rename UI, do nothing
        return;
      }

      // Clicked outside, close Rename
      setRenameCtx(null);
      setLinkToFileCtx(null);
    };

    document.addEventListener("pointerdown", handleGlobalPointerDown, true);
    return () => {
      document.removeEventListener(
        "pointerdown",
        handleGlobalPointerDown,
        true,
      );
    };
  }, [renameCtx]);

  // Positioning loop (visual only, NO lifecycle control)
  useEffect(() => {
    if (!renameCtx) {
      return;
    }

    let rafId: number;
    const syncPosition = () => {
      const menuElement = document.querySelector(
        ".context-menu",
      ) as HTMLElement | null;
      const renameElement = document.querySelector(
        ".board-rename-ui",
      ) as HTMLElement | null;

      if (menuElement && renameElement) {
        const menuRect = menuElement.getBoundingClientRect();
        renameElement.style.left = \\px\;
        renameElement.style.top = \\px\;
        renameElement.style.transform = \
one\;
      }
      rafId = requestAnimationFrame(syncPosition);
    };
    rafId = requestAnimationFrame(syncPosition);
    return () => cancelAnimationFrame(rafId);
  }, [renameCtx]);;

const replacement =   // Global click-outside detector for Context Menus
  useEffect(() => {
    if (!renameCtx && !linkToFileCtx) {
      return;
    }

    const handleGlobalPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      const renameElement = document.querySelector(".board-rename-ui");
      const linkToFileElement = document.querySelector(".link-to-file-ui");

      if (renameElement && renameElement.contains(target)) {
        return;
      }
      if (linkToFileElement && linkToFileElement.contains(target)) {
        return;
      }

      setRenameCtx(null);
      setLinkToFileCtx(null);
    };

    document.addEventListener("pointerdown", handleGlobalPointerDown, true);
    return () => {
      document.removeEventListener(
        "pointerdown",
        handleGlobalPointerDown,
        true,
      );
    };
  }, [renameCtx, linkToFileCtx]);

  // Positioning loop (visual only, NO lifecycle control)
  useEffect(() => {
    if (!renameCtx && !linkToFileCtx) {
      return;
    }

    let rafId: number;
    const syncPosition = () => {
      const menuElement = document.querySelector(".context-menu") as HTMLElement | null;
      const renameElement = document.querySelector(".board-rename-ui") as HTMLElement | null;
      const linkToFileElement = document.querySelector(".link-to-file-ui") as HTMLElement | null;

      if (menuElement) {
        const menuRect = menuElement.getBoundingClientRect();
        
        if (renameElement) {
          renameElement.style.left = \\px\;
          renameElement.style.top = \\px\;
          renameElement.style.transform = \
one\;
        }
        if (linkToFileElement) {
          linkToFileElement.style.left = \\px\;
          linkToFileElement.style.top = \\px\;
          linkToFileElement.style.transform = \
one\;
        }
      } else {
        // If the context menu disappears (e.g. by hitting Escape while focused on the canvas),
        // we must close the dependent menus.
        setRenameCtx(null);
        setLinkToFileCtx(null);
      }
      rafId = requestAnimationFrame(syncPosition);
    };
    rafId = requestAnimationFrame(syncPosition);
    return () => cancelAnimationFrame(rafId);
  }, [renameCtx, linkToFileCtx]);;

content = content.replace(target, replacement);
fs.writeFileSync('excalidraw-app/App.tsx', content);
