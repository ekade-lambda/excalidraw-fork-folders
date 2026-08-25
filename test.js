import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import {
  Excalidraw,
  LiveCollaborationTrigger,
  TTDDialogTrigger,
  CaptureUpdateAction,
  reconcileElements,
  useEditorInterface,
  ExcalidrawAPIProvider,
  useExcalidrawAPI,
  viewportCoordsToSceneCoords
} from "@excalidraw/excalidraw";
import { trackEvent } from "@excalidraw/excalidraw/analytics";
import { getDefaultAppState } from "@excalidraw/excalidraw/appState";
import {
  CommandPalette,
  DEFAULT_CATEGORIES
} from "@excalidraw/excalidraw/components/CommandPalette/CommandPalette";
import { ErrorDialog } from "@excalidraw/excalidraw/components/ErrorDialog";
import { OverwriteConfirmDialog } from "@excalidraw/excalidraw/components/OverwriteConfirm/OverwriteConfirm";
import { openConfirmModal } from "@excalidraw/excalidraw/components/OverwriteConfirm/OverwriteConfirmState";
import { ShareableLinkDialog } from "@excalidraw/excalidraw/components/ShareableLinkDialog";
import Trans from "@excalidraw/excalidraw/components/Trans";
import {
  APP_NAME,
  EVENT,
  VERSION_TIMEOUT,
  debounce,
  getVersion,
  getFrame,
  isTestEnv,
  preventUnload,
  resolvablePromise,
  isRunningInIframe,
  isDevEnv
} from "@excalidraw/common";
import polyfill from "@excalidraw/excalidraw/polyfill";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadFromBlob } from "@excalidraw/excalidraw/data/blob";
import { t } from "@excalidraw/excalidraw/i18n";
import {
  GithubIcon,
  XBrandIcon,
  DiscordIcon,
  ExcalLogo,
  usersIcon,
  exportToPlus,
  share,
  youtubeIcon
} from "@excalidraw/excalidraw/components/icons";
import { isElementLink } from "@excalidraw/element";
import {
  bumpElementVersions,
  restoreAppState,
  restoreElements
} from "@excalidraw/excalidraw/data/restore";
import { newElementWith } from "@excalidraw/element";
import { isInitializedImageElement } from "@excalidraw/element";
import clsx from "clsx";
import {
  parseLibraryTokensFromUrl,
  useHandleLibrary
} from "@excalidraw/excalidraw/data/library";
import { handleOnDuplicate } from "./boards/host/duplicate";
import CustomStats from "./CustomStats";
import {
  Provider,
  useAtom,
  useAtomValue,
  useAtomWithInitialValue,
  appJotaiStore
} from "./app-jotai";
import {
  FIREBASE_STORAGE_PREFIXES,
  isExcalidrawPlusSignedUser,
  STORAGE_KEYS,
  SYNC_BROWSER_TABS_TIMEOUT
} from "./app_constants";
import Collab, {
  collabAPIAtom,
  isCollaboratingAtom,
  isOfflineAtom,
  userToFollowAtom
} from "./collab/Collab";
import { AppFooter } from "./components/AppFooter";
import { AppMainMenu } from "./components/AppMainMenu";
import { AppWelcomeScreen } from "./components/AppWelcomeScreen";
import {
  ExportToExcalidrawPlus,
  exportToExcalidrawPlus
} from "./components/ExportToExcalidrawPlus";
import { TopErrorBoundary } from "./components/TopErrorBoundary";
import {
  exportToBackend,
  getCollaborationLinkData,
  importFromBackend,
  isCollaborationLink
} from "./data";
import { updateStaleImageStatuses } from "./data/FileManager";
import { FileStatusStore } from "./data/fileStatusStore";
import {
  importFromLocalStorage,
  importUsernameFromLocalStorage
} from "./data/localStorage";
import { loadFilesFromFirebase } from "./data/firebase";
import {
  LibraryIndexedDBAdapter,
  LibraryLocalStorageMigrationAdapter,
  LocalData,
  localStorageQuotaExceededAtom
} from "./data/LocalData";
import { isBrowserStorageStateNewer } from "./data/tabSync";
import { ShareDialog, shareDialogStateAtom } from "./share/ShareDialog";
import CollabError, { collabErrorIndicatorAtom } from "./collab/CollabError";
import { useHandleAppTheme } from "./useHandleAppTheme";
import { getPreferredLanguage } from "./app-language/language-detector";
import { useAppLangCode } from "./app-language/language-state";
import DebugCanvas, {
  debugRenderer,
  isVisualDebuggerEnabled,
  loadSavedDebugState
} from "./components/DebugCanvas";
import { useSimulatedCollaborators } from "./debugCollaborators";
import { AIComponents } from "./components/AI";
import { ExcalidrawPlusIframeExport } from "./ExcalidrawPlusIframeExport";
import "./index.scss";
import { ExcalidrawPlusPromoBanner } from "./components/ExcalidrawPlusPromoBanner";
import { AppSidebar } from "./components/AppSidebar";
import { sessionClipboardAtom } from "./boards/clipboard";
import { handleOnCopy } from "./boards/host/copy";
import { handleOnPaste } from "./boards/host/paste";
import { initializeBoardSystem } from "./boards/host/boardService";
import { LocalStorageBoardRepository } from "./boards/repository/LocalStorageBoardRepository";
import { createFolder } from "./boards/host/folderService";
import { boardsStoreActions } from "./boards/host/boardState";
import { openFolder } from "./boards/host/boardService";
import { hitTestFolderAtPoint } from "./boards/host/hitTest";
import { renameFolder } from "./boards/host/folderService";
import {
  FOLDER_TOOL_CUSTOM_TYPE,
  FOLDER_POINTER_TOOL_CUSTOM_TYPE,
  FolderToolButton,
  FolderPointerToolButton
} from "./boards/ui/ToolButtons";
import { NavBar } from "./boards/ui/NavBar";
import { PickerFolderDialog } from "./boards/ui/PickerFolderDialog";
import { createPointerInCanvas } from "./boards/host/pointerService";
polyfill();
window.EXCALIDRAW_THROTTLE_RENDER = true;
let pwaEvent = null;
window.addEventListener(
  "beforeinstallprompt",
  (event) => {
    event.preventDefault();
    pwaEvent = event;
  }
);
let isSelfEmbedding = false;
if (window.self !== window.top) {
  try {
    const parentUrl = new URL(document.referrer);
    const currentUrl = new URL(window.location.href);
    if (parentUrl.origin === currentUrl.origin) {
      isSelfEmbedding = true;
    }
  } catch (error) {
  }
}
const shareableLinkConfirmDialog = {
  title: t("overwriteConfirm.modal.shareableLink.title"),
  description: /* @__PURE__ */ jsx(
    Trans,
    {
      i18nKey: "overwriteConfirm.modal.shareableLink.description",
      bold: (text) => /* @__PURE__ */ jsx("strong", { children: text }),
      br: () => /* @__PURE__ */ jsx("br", {})
    }
  ),
  actionLabel: t("overwriteConfirm.modal.shareableLink.button"),
  color: "danger"
};
const initializeScene = async (opts) => {
  const searchParams = new URLSearchParams(window.location.search);
  const id = searchParams.get("id");
  const jsonBackendMatch = window.location.hash.match(
    /^#json=([a-zA-Z0-9_-]+),([a-zA-Z0-9_-]+)$/
  );
  const externalUrlMatch = window.location.hash.match(/^#url=(.*)$/);
  const localDataState = importFromLocalStorage();
  let scene = {
    elements: restoreElements(localDataState?.elements, null, {
      repairBindings: true,
      deleteInvisibleElements: true
    }),
    appState: restoreAppState(localDataState?.appState, null)
  };
  let roomLinkData = getCollaborationLinkData(window.location.href);
  const isExternalScene = !!(id || jsonBackendMatch || roomLinkData);
  if (isExternalScene) {
    if (
      // don't prompt if scene is empty
      !scene.elements.length || // don't prompt for collab scenes because we don't override local storage
      roomLinkData || // otherwise, prompt whether user wants to override current scene
      await openConfirmModal(shareableLinkConfirmDialog)
    ) {
      if (jsonBackendMatch) {
        const imported = await importFromBackend(
          jsonBackendMatch[1],
          jsonBackendMatch[2]
        );
        scene = {
          elements: bumpElementVersions(
            restoreElements(imported.elements, null, {
              repairBindings: true,
              deleteInvisibleElements: true
            }),
            localDataState?.elements
          ),
          appState: restoreAppState(
            imported.appState,
            // local appState when importing from backend to ensure we restore
            // localStorage user settings which we do not persist on server.
            localDataState?.appState
          )
        };
      }
      scene.scrollToContent = true;
      if (!roomLinkData) {
        window.history.replaceState({}, APP_NAME, window.location.origin);
      }
    } else {
      if (document.hidden) {
        return new Promise((resolve, reject) => {
          window.addEventListener(
            "focus",
            () => initializeScene(opts).then(resolve).catch(reject),
            {
              once: true
            }
          );
        });
      }
      roomLinkData = null;
      window.history.replaceState({}, APP_NAME, window.location.origin);
    }
  } else if (externalUrlMatch) {
    window.history.replaceState({}, APP_NAME, window.location.origin);
    const url = externalUrlMatch[1];
    try {
      const request = await fetch(window.decodeURIComponent(url));
      const data = await loadFromBlob(await request.blob(), null, null);
      if (!scene.elements.length || await openConfirmModal(shareableLinkConfirmDialog)) {
        return { scene: data, isExternalScene };
      }
    } catch (error) {
      return {
        scene: {
          appState: {
            errorMessage: t("alerts.invalidSceneUrl")
          }
        },
        isExternalScene
      };
    }
  }
  if (roomLinkData && opts.collabAPI) {
    const { excalidrawAPI } = opts;
    const scene2 = await opts.collabAPI.startCollaboration(roomLinkData);
    return {
      // when collaborating, the state may have already been updated at this
      // point (we may have received updates from other clients), so reconcile
      // elements and appState with existing state
      scene: {
        ...scene2,
        appState: {
          ...restoreAppState(
            {
              ...scene2?.appState,
              theme: localDataState?.appState?.theme || scene2?.appState?.theme
            },
            excalidrawAPI.getAppState()
          ),
          // necessary if we're invoking from a hashchange handler which doesn't
          // go through App.initializeScene() that resets this flag
          isLoading: false
        },
        elements: reconcileElements(
          scene2?.elements || [],
          excalidrawAPI.getSceneElementsIncludingDeleted(),
          excalidrawAPI.getAppState()
        )
      },
      isExternalScene: true,
      id: roomLinkData.roomId,
      key: roomLinkData.roomKey
    };
  } else if (scene) {
    return isExternalScene && jsonBackendMatch ? {
      scene,
      isExternalScene,
      id: jsonBackendMatch[1],
      key: jsonBackendMatch[2]
    } : { scene, isExternalScene: false };
  }
  return { scene: null, isExternalScene: false };
};
const ExcalidrawWrapper = () => {
  const excalidrawAPI = useExcalidrawAPI();
  const [errorMessage, setErrorMessage] = useState("");
  const isCollabDisabled = isRunningInIframe();
  const { editorTheme, appTheme, setAppTheme } = useHandleAppTheme();
  const [langCode, setLangCode] = useAppLangCode();
  const editorInterface = useEditorInterface();
  const initialStatePromiseRef = useRef({ promise: null });
  const boardRepo = useMemo(() => new LocalStorageBoardRepository(), []);
  if (!initialStatePromiseRef.current.promise) {
    initialStatePromiseRef.current.promise = resolvablePromise();
  }
  const debugCanvasRef = useRef(null);
  useEffect(() => {
    trackEvent("load", "frame", getFrame());
    setTimeout(() => {
      trackEvent("load", "version", getVersion());
    }, VERSION_TIMEOUT);
  }, []);
  const [, setShareDialogState] = useAtom(shareDialogStateAtom);
  const [collabAPI] = useAtom(collabAPIAtom);
  const [isCollaborating] = useAtomWithInitialValue(isCollaboratingAtom, () => {
    return isCollaborationLink(window.location.href);
  });
  const collabError = useAtomValue(collabErrorIndicatorAtom);
  const userToFollow = useAtomValue(userToFollowAtom);
  const viewportStatusFrame = useMemo(
    () => userToFollow ? {
      border: "var(--color-primary-hover)",
      label: {
        label: /* @__PURE__ */ jsxs(Fragment, { children: [
          "Following",
          " ",
          /* @__PURE__ */ jsx(
            "span",
            {
              style: {
                display: "block",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: 100
              },
              title: userToFollow.username,
              children: userToFollow.username
            }
          )
        ] }),
        onClose: () => collabAPI?.setUserToFollow(null)
      }
    } : null,
    [userToFollow, collabAPI]
  );
  useHandleLibrary({
    excalidrawAPI,
    adapter: LibraryIndexedDBAdapter,
    // TODO maybe remove this in several months (shipped: 24-03-11)
    migrationAdapter: LibraryLocalStorageMigrationAdapter
  });
  const [, forceRefresh] = useState(false);
  useEffect(() => {
    if (isDevEnv()) {
      const debugState = loadSavedDebugState();
      if (debugState.enabled && !window.visualDebug) {
        window.visualDebug = {
          data: []
        };
      } else {
        delete window.visualDebug;
      }
      forceRefresh((prev) => !prev);
    }
  }, [excalidrawAPI]);
  useSimulatedCollaborators(excalidrawAPI);
  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }
    initializeBoardSystem(new LocalStorageBoardRepository()).catch((error) => {
      console.error("BoardSystem: boot failed", error);
    });
  }, [excalidrawAPI]);
  const [pointerPickerPos, setPointerPickerPos] = useState(null);
  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }
    const unsubscribe = excalidrawAPI.onPointerUp(
      (activeTool, pointerDownState, event) => {
        if (activeTool.type !== "custom") {
          return;
        }
        const parentFolderId = boardsStoreActions.getCurrentFolderId();
        if (!parentFolderId) {
          return;
        }
        const { clientX, clientY } = event;
        const { x: sceneX, y: sceneY } = viewportCoordsToSceneCoords(
          { clientX, clientY },
          excalidrawAPI.getAppState()
        );
        if (activeTool.customType === FOLDER_TOOL_CUSTOM_TYPE) {
          createFolder({
            repo: new LocalStorageBoardRepository(),
            excalidrawAPI,
            parentFolderId,
            sceneX,
            sceneY
          }).catch((error) => {
            console.error("BoardSystem: create folder failed", error);
          });
        } else if (activeTool.customType === FOLDER_POINTER_TOOL_CUSTOM_TYPE) {
          setPointerPickerPos({ sceneX, sceneY });
        }
      }
    );
    return unsubscribe;
  }, [excalidrawAPI]);
  const [renameCtx, setRenameCtx] = useState(null);
  useEffect(() => {
    if (!renameCtx) {
      return;
    }
    const handleGlobalPointerDown = (e) => {
      const target = e.target;
      const renameElement = document.querySelector(".board-rename-ui");
      if (renameElement && renameElement.contains(target)) {
        return;
      }
      setRenameCtx(null);
    };
    document.addEventListener("pointerdown", handleGlobalPointerDown, true);
    return () => {
      document.removeEventListener(
        "pointerdown",
        handleGlobalPointerDown,
        true
      );
    };
  }, [renameCtx]);
  useEffect(() => {
    if (!renameCtx) {
      return;
    }
    let rafId;
    const syncPosition = () => {
      const menuElement = document.querySelector(
        ".context-menu"
      );
      const renameElement = document.querySelector(
        ".board-rename-ui"
      );
      if (menuElement && renameElement) {
        const menuRect = menuElement.getBoundingClientRect();
        renameElement.style.left = `${menuRect.right}px`;
        renameElement.style.top = `${menuRect.top}px`;
        renameElement.style.transform = `none`;
      }
      rafId = requestAnimationFrame(syncPosition);
    };
    rafId = requestAnimationFrame(syncPosition);
    return () => cancelAnimationFrame(rafId);
  }, [renameCtx]);
  const handleHostContextMenu = (event) => {
    if (!excalidrawAPI) {
      return;
    }
    const { clientX, clientY } = event;
    const { x: sceneX, y: sceneY } = viewportCoordsToSceneCoords(
      { clientX, clientY },
      excalidrawAPI.getAppState()
    );
    const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
    const hit = hitTestFolderAtPoint(elements, { x: sceneX, y: sceneY });
    if (hit.kind !== "none") {
      const fId = hit.kind === "folder" ? hit.folderId : hit.targetFolderId;
      let initialName = "";
      for (const el of elements) {
        const m = el.customData?.folderBoard;
        if (m && (m.folderId === fId || m.targetFolderId === fId) && m.role === "text") {
          initialName = el.text || "";
          break;
        }
      }
      setRenameCtx({
        folderId: fId,
        initialName,
        x: clientX,
        y: clientY
      });
    } else {
      setRenameCtx(null);
    }
  };
  const handleRenameConfirm = (newName) => {
    if (renameCtx && newName && newName.trim() && excalidrawAPI) {
      renameFolder({
        repo: boardRepo,
        excalidrawAPI,
        folderId: renameCtx.folderId,
        newName: newName.trim()
      }).catch((e) => console.error("Rename failed", e));
    }
    setRenameCtx(null);
  };
  const handleCanvasDoubleClick = (event) => {
    if (!excalidrawAPI) {
      return;
    }
    const { x, y } = viewportCoordsToSceneCoords(
      { clientX: event.clientX, clientY: event.clientY },
      excalidrawAPI.getAppState()
    );
    const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
    const hit = hitTestFolderAtPoint(elements, { x, y });
    if (hit.kind === "none") {
      return;
    }
    const targetFolderId = hit.kind === "folder" ? hit.folderId : hit.targetFolderId;
    void openFolder({
      repo: new LocalStorageBoardRepository(),
      excalidrawAPI,
      folderId: targetFolderId
    }).catch((error) => {
      console.error("BoardSystem: open folder failed", error);
    });
  };
  const loadImages = useCallback(
    (data, isInitialLoad = false) => {
      if (!data.scene || !excalidrawAPI) {
        return;
      }
      if (collabAPI?.isCollaborating()) {
        if (data.scene.elements) {
          collabAPI.fetchImageFilesFromFirebase({
            elements: data.scene.elements,
            forceFetchFiles: true
          }).then(({ loadedFiles, erroredFiles }) => {
            excalidrawAPI.addFiles(loadedFiles);
            updateStaleImageStatuses({
              excalidrawAPI,
              erroredFiles,
              elements: excalidrawAPI.getSceneElementsIncludingDeleted()
            });
          });
        }
      } else {
        const fileIds = data.scene.elements?.reduce((acc, element) => {
          if (isInitializedImageElement(element)) {
            return acc.concat(element.fileId);
          }
          return acc;
        }, []) || [];
        if (data.isExternalScene) {
          if (fileIds.length) {
            FileStatusStore.updateStatuses(
              fileIds.map((id) => [id, "loading"])
            );
          }
          loadFilesFromFirebase(
            `${FIREBASE_STORAGE_PREFIXES.shareLinkFiles}/${data.id}`,
            data.key,
            fileIds
          ).then(({ loadedFiles, erroredFiles }) => {
            excalidrawAPI.addFiles(loadedFiles);
            updateStaleImageStatuses({
              excalidrawAPI,
              erroredFiles,
              elements: excalidrawAPI.getSceneElementsIncludingDeleted()
            });
            FileStatusStore.updateStatuses([
              ...loadedFiles.map((f) => [f.id, "loaded"]),
              ...[...erroredFiles.keys()].map(
                (id) => [id, "error"]
              )
            ]);
          });
        } else if (isInitialLoad) {
          if (fileIds.length) {
            LocalData.fileStorage.getFiles(fileIds).then(async ({ loadedFiles, erroredFiles }) => {
              if (loadedFiles.length) {
                excalidrawAPI.addFiles(loadedFiles);
              }
              updateStaleImageStatuses({
                excalidrawAPI,
                erroredFiles,
                elements: excalidrawAPI.getSceneElementsIncludingDeleted()
              });
            });
          }
          LocalData.fileStorage.clearObsoleteFiles({
            currentFileIds: fileIds
          });
        }
      }
    },
    [collabAPI, excalidrawAPI]
  );
  useEffect(() => {
    if (!excalidrawAPI || !isCollabDisabled && !collabAPI) {
      return;
    }
    initializeScene({ collabAPI, excalidrawAPI }).then(async (data) => {
      loadImages(
        data,
        /* isInitialLoad */
        true
      );
      initialStatePromiseRef.current.promise.resolve(data.scene);
    });
    const onHashChange = async (event) => {
      event.preventDefault();
      const libraryUrlTokens = parseLibraryTokensFromUrl();
      if (!libraryUrlTokens) {
        if (collabAPI?.isCollaborating() && !isCollaborationLink(window.location.href)) {
          collabAPI.stopCollaboration(false);
        }
        excalidrawAPI.updateScene({ appState: { isLoading: true } });
        initializeScene({ collabAPI, excalidrawAPI }).then((data) => {
          loadImages(data);
          if (data.scene) {
            excalidrawAPI.updateScene({
              elements: restoreElements(data.scene.elements, null, {
                repairBindings: true
              }),
              appState: restoreAppState(data.scene.appState, null),
              captureUpdate: CaptureUpdateAction.IMMEDIATELY
            });
          }
        });
      }
    };
    const syncData = debounce(() => {
      if (isTestEnv()) {
        return;
      }
      if (!document.hidden && (collabAPI && !collabAPI.isCollaborating() || isCollabDisabled)) {
        if (isBrowserStorageStateNewer(STORAGE_KEYS.VERSION_DATA_STATE)) {
          const localDataState = importFromLocalStorage();
          const username = importUsernameFromLocalStorage();
          setLangCode(getPreferredLanguage());
          excalidrawAPI.updateScene({
            ...localDataState,
            captureUpdate: CaptureUpdateAction.NEVER
          });
          LibraryIndexedDBAdapter.load().then((data) => {
            if (data) {
              excalidrawAPI.updateLibrary({
                libraryItems: data.libraryItems
              });
            }
          });
          collabAPI?.setUsername(username || "");
        }
        if (isBrowserStorageStateNewer(STORAGE_KEYS.VERSION_FILES)) {
          const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
          const currFiles = excalidrawAPI.getFiles();
          const fileIds = elements?.reduce((acc, element) => {
            if (isInitializedImageElement(element) && // only load and update images that aren't already loaded
            !currFiles[element.fileId]) {
              return acc.concat(element.fileId);
            }
            return acc;
          }, []) || [];
          if (fileIds.length) {
            LocalData.fileStorage.getFiles(fileIds).then(({ loadedFiles, erroredFiles }) => {
              if (loadedFiles.length) {
                excalidrawAPI.addFiles(loadedFiles);
              }
              updateStaleImageStatuses({
                excalidrawAPI,
                erroredFiles,
                elements: excalidrawAPI.getSceneElementsIncludingDeleted()
              });
            });
          }
        }
      }
    }, SYNC_BROWSER_TABS_TIMEOUT);
    const onUnload = () => {
      LocalData.flushSave();
    };
    const visibilityChange = (event) => {
      if (event.type === EVENT.BLUR || document.hidden) {
        LocalData.flushSave();
      }
      if (event.type === EVENT.VISIBILITY_CHANGE || event.type === EVENT.FOCUS) {
        syncData();
      }
    };
    window.addEventListener(EVENT.HASHCHANGE, onHashChange, false);
    window.addEventListener(EVENT.UNLOAD, onUnload, false);
    window.addEventListener(EVENT.BLUR, visibilityChange, false);
    document.addEventListener(EVENT.VISIBILITY_CHANGE, visibilityChange, false);
    window.addEventListener(EVENT.FOCUS, visibilityChange, false);
    return () => {
      window.removeEventListener(EVENT.HASHCHANGE, onHashChange, false);
      window.removeEventListener(EVENT.UNLOAD, onUnload, false);
      window.removeEventListener(EVENT.BLUR, visibilityChange, false);
      window.removeEventListener(EVENT.FOCUS, visibilityChange, false);
      document.removeEventListener(
        EVENT.VISIBILITY_CHANGE,
        visibilityChange,
        false
      );
    };
  }, [isCollabDisabled, collabAPI, excalidrawAPI, setLangCode, loadImages]);
  useEffect(() => {
    const unloadHandler = (event) => {
      LocalData.flushSave();
      if (excalidrawAPI && LocalData.fileStorage.shouldPreventUnload(
        excalidrawAPI.getSceneElements()
      )) {
        if (import.meta.env.VITE_APP_DISABLE_PREVENT_UNLOAD !== "true") {
          preventUnload(event);
        } else {
          console.warn(
            "preventing unload disabled (VITE_APP_DISABLE_PREVENT_UNLOAD)"
          );
        }
      }
    };
    window.addEventListener(EVENT.BEFORE_UNLOAD, unloadHandler);
    return () => {
      window.removeEventListener(EVENT.BEFORE_UNLOAD, unloadHandler);
    };
  }, [excalidrawAPI]);
  const onChange = (elements, appState, files) => {
    if (collabAPI?.isCollaborating()) {
      collabAPI.syncElements(elements);
    }
    if (!LocalData.isSavePaused()) {
      LocalData.save(elements, appState, files, () => {
        if (excalidrawAPI) {
          let didChange = false;
          const elements2 = excalidrawAPI.getSceneElementsIncludingDeleted().map((element) => {
            if (LocalData.fileStorage.shouldUpdateImageElementStatus(element)) {
              const newElement = newElementWith(element, { status: "saved" });
              if (newElement !== element) {
                didChange = true;
              }
              return newElement;
            }
            return element;
          });
          if (didChange) {
            excalidrawAPI.updateScene({
              elements: elements2,
              captureUpdate: CaptureUpdateAction.NEVER
            });
          }
        }
      });
    }
    if (debugCanvasRef.current && excalidrawAPI) {
      debugRenderer(
        debugCanvasRef.current,
        appState,
        elements,
        window.devicePixelRatio
      );
    }
  };
  const [clipboardData, setClipboardData] = useAtom(sessionClipboardAtom);
  const onCopy = useCallback(
    (elements) => {
      if (boardRepo.loadSync) {
        const graph = boardRepo.loadSync();
        if (graph) {
          setClipboardData(handleOnCopy(elements, graph));
        }
      }
    },
    [boardRepo, setClipboardData]
  );
  const onPaste = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data, event) => {
      return handleOnPaste(
        data,
        clipboardData,
        boardRepo,
        boardsStoreActions.getCurrentFolderId()
      );
    },
    [boardRepo, clipboardData]
  );
  const onDuplicate = useCallback(
    (nextElements, prevElements) => {
      return handleOnDuplicate(
        nextElements,
        prevElements,
        boardRepo,
        boardsStoreActions.getCurrentFolderId()
      );
    },
    [boardRepo]
  );
  const [latestShareableLink, setLatestShareableLink] = useState(
    null
  );
  const onExportToBackend = async (exportedElements, appState, files) => {
    if (exportedElements.length === 0) {
      throw new Error(t("alerts.cannotExportEmptyCanvas"));
    }
    try {
      const { url, errorMessage: errorMessage2 } = await exportToBackend(
        exportedElements,
        {
          ...appState,
          viewBackgroundColor: appState.exportBackground ? appState.viewBackgroundColor : getDefaultAppState().viewBackgroundColor
        },
        files
      );
      if (errorMessage2) {
        throw new Error(errorMessage2);
      }
      if (url) {
        setLatestShareableLink(url);
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        const { width, height } = appState;
        console.error(error, {
          width,
          height,
          devicePixelRatio: window.devicePixelRatio
        });
        throw new Error(error.message);
      }
    }
  };
  const renderCustomStats = (elements, appState) => {
    return /* @__PURE__ */ jsx(
      CustomStats,
      {
        setToast: (message) => excalidrawAPI.setToast({ message }),
        appState,
        elements
      }
    );
  };
  const isOffline = useAtomValue(isOfflineAtom);
  const localStorageQuotaExceeded = useAtomValue(localStorageQuotaExceededAtom);
  const onCollabDialogOpen = useCallback(
    () => setShareDialogState({ isOpen: true, type: "collaborationOnly" }),
    [setShareDialogState]
  );
  const onExport = useCallback(
    async function* () {
      let snapshot = FileStatusStore.getSnapshot();
      const { pending, total } = FileStatusStore.getPendingCount(
        snapshot.value
      );
      if (pending === 0) {
        return;
      }
      yield {
        type: "progress",
        progress: (total - pending) / total,
        message: `Loading images (${total - pending}/${total})...`
      };
      while (true) {
        snapshot = await FileStatusStore.pull(snapshot.version);
        const { pending: nowPending, total: nowTotal } = FileStatusStore.getPendingCount(snapshot.value);
        yield {
          type: "progress",
          progress: (nowTotal - nowPending) / nowTotal,
          message: `Loading images (${nowTotal - nowPending}/${nowTotal})...`
        };
        if (nowPending === 0) {
          await new Promise((r) => setTimeout(r, 500));
          yield {
            type: "progress",
            message: `Preparing export...`
          };
          return;
        }
      }
    },
    []
  );
  if (isSelfEmbedding) {
    return /* @__PURE__ */ jsx(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          height: "100%"
        },
        children: /* @__PURE__ */ jsx("h1", { children: "I'm not a pretzel!" })
      }
    );
  }
  const ExcalidrawPlusCommand = {
    label: "Excalidraw+",
    category: DEFAULT_CATEGORIES.links,
    predicate: true,
    icon: /* @__PURE__ */ jsx("div", { style: { width: 14 }, children: ExcalLogo }),
    keywords: ["plus", "cloud", "server"],
    perform: () => {
      window.open(
        `${import.meta.env.VITE_APP_PLUS_LP}/plus?utm_source=excalidraw&utm_medium=app&utm_content=command_palette`,
        "_blank"
      );
    }
  };
  const ExcalidrawPlusAppCommand = {
    label: "Sign up",
    category: DEFAULT_CATEGORIES.links,
    predicate: true,
    icon: /* @__PURE__ */ jsx("div", { style: { width: 14 }, children: ExcalLogo }),
    keywords: [
      "excalidraw",
      "plus",
      "cloud",
      "server",
      "signin",
      "login",
      "signup"
    ],
    perform: () => {
      window.open(
        `${import.meta.env.VITE_APP_PLUS_APP}?utm_source=excalidraw&utm_medium=app&utm_content=command_palette`,
        "_blank"
      );
    }
  };
  return /* @__PURE__ */ jsx(
    "div",
    {
      style: { height: "100%" },
      className: clsx("excalidraw-app", {
        "is-collaborating": isCollaborating
      }),
      onDoubleClick: handleCanvasDoubleClick,
      onContextMenu: handleHostContextMenu,
      children: /* @__PURE__ */ jsxs(
        Excalidraw,
        {
          viewportStatusFrame,
          userToFollow,
          onChange,
          onDuplicate,
          onCopy,
          onPaste,
          onExport,
          initialData: initialStatePromiseRef.current.promise,
          isCollaborating,
          onPointerUpdate: collabAPI?.onPointerUpdate,
          UIOptions: {
            canvasActions: {
              toggleTheme: true,
              export: {
                onExportToBackend,
                renderCustomUI: excalidrawAPI ? (elements, appState, files) => {
                  return /* @__PURE__ */ jsx(
                    ExportToExcalidrawPlus,
                    {
                      elements,
                      appState,
                      files,
                      name: excalidrawAPI.getName(),
                      onError: (error) => {
                        excalidrawAPI?.updateScene({
                          appState: {
                            errorMessage: error.message
                          }
                        });
                      },
                      onSuccess: () => {
                        excalidrawAPI.updateScene({
                          appState: { openDialog: null }
                        });
                      }
                    }
                  );
                } : void 0
              }
            }
          },
          langCode,
          renderCustomStats,
          detectScroll: false,
          handleKeyboardGlobally: true,
          autoFocus: true,
          theme: editorTheme,
          onThemeChange: setAppTheme,
          renderTopLeftUI: (isMobile, appState) => {
            if (!excalidrawAPI) {
              return null;
            }
            return /* @__PURE__ */ jsxs(
              "div",
              {
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  order: 1
                },
                children: [
                  /* @__PURE__ */ jsx(FolderToolButton, { excalidrawAPI }),
                  /* @__PURE__ */ jsx(FolderPointerToolButton, { excalidrawAPI }),
                  /* @__PURE__ */ jsx(NavBar, { repo: boardRepo, excalidrawAPI })
                ]
              }
            );
          },
          renderTopRightUI: (isMobile) => {
            if (isMobile || !collabAPI || isCollabDisabled) {
              return null;
            }
            return /* @__PURE__ */ jsxs("div", { className: "excalidraw-ui-top-right", children: [
              excalidrawAPI?.getEditorInterface().formFactor === "desktop" && /* @__PURE__ */ jsx(
                ExcalidrawPlusPromoBanner,
                {
                  isSignedIn: isExcalidrawPlusSignedUser
                }
              ),
              collabError.message && /* @__PURE__ */ jsx(CollabError, { collabError }),
              /* @__PURE__ */ jsx(
                LiveCollaborationTrigger,
                {
                  isCollaborating,
                  onSelect: () => setShareDialogState({ isOpen: true, type: "share" }),
                  editorInterface
                }
              )
            ] });
          },
          onLinkOpen: (element, event) => {
            if (element.link && isElementLink(element.link)) {
              event.preventDefault();
              excalidrawAPI?.setViewport({
                target: element.link,
                fit: "scale-down",
                animation: true
              });
            }
          },
          children: [
            /* @__PURE__ */ jsx(
              AppMainMenu,
              {
                onCollabDialogOpen,
                isCollaborating,
                isCollabEnabled: !isCollabDisabled,
                theme: appTheme,
                refresh: () => forceRefresh((prev) => !prev)
              }
            ),
            /* @__PURE__ */ jsx(
              AppWelcomeScreen,
              {
                onCollabDialogOpen,
                isCollabEnabled: !isCollabDisabled
              }
            ),
            /* @__PURE__ */ jsxs(OverwriteConfirmDialog, { children: [
              /* @__PURE__ */ jsx(OverwriteConfirmDialog.Actions.ExportToImage, {}),
              /* @__PURE__ */ jsx(OverwriteConfirmDialog.Actions.SaveToDisk, {}),
              excalidrawAPI && /* @__PURE__ */ jsx(
                OverwriteConfirmDialog.Action,
                {
                  title: t("overwriteConfirm.action.excalidrawPlus.title"),
                  actionLabel: t("overwriteConfirm.action.excalidrawPlus.button"),
                  onClick: () => {
                    exportToExcalidrawPlus(
                      excalidrawAPI.getSceneElements(),
                      excalidrawAPI.getAppState(),
                      excalidrawAPI.getFiles(),
                      excalidrawAPI.getName()
                    );
                  },
                  children: t("overwriteConfirm.action.excalidrawPlus.description")
                }
              )
            ] }),
            /* @__PURE__ */ jsx(AppFooter, { onChange: () => excalidrawAPI?.refresh() }),
            excalidrawAPI && /* @__PURE__ */ jsx(AIComponents, { excalidrawAPI }),
            /* @__PURE__ */ jsx(TTDDialogTrigger, {}),
            isCollaborating && isOffline && /* @__PURE__ */ jsx("div", { className: "alertalert--warning", children: t("alerts.collabOfflineWarning") }),
            localStorageQuotaExceeded && /* @__PURE__ */ jsx("div", { className: "alert alert--danger", children: t("alerts.localStorageQuotaExceeded") }),
            latestShareableLink && /* @__PURE__ */ jsx(
              ShareableLinkDialog,
              {
                link: latestShareableLink,
                onCloseRequest: () => setLatestShareableLink(null),
                setErrorMessage
              }
            ),
            excalidrawAPI && !isCollabDisabled && /* @__PURE__ */ jsx(Collab, { excalidrawAPI }),
            /* @__PURE__ */ jsx(
              ShareDialog,
              {
                collabAPI,
                onExportToBackend: async () => {
                  if (excalidrawAPI) {
                    try {
                      await onExportToBackend(
                        excalidrawAPI.getSceneElements(),
                        excalidrawAPI.getAppState(),
                        excalidrawAPI.getFiles()
                      );
                    } catch (error) {
                      setErrorMessage(error.message);
                    }
                  }
                }
              }
            ),
            /* @__PURE__ */ jsx(AppSidebar, {}),
            errorMessage && /* @__PURE__ */ jsx(ErrorDialog, { onClose: () => setErrorMessage(""), children: errorMessage }),
            /* @__PURE__ */ jsx(
              CommandPalette,
              {
                customCommandPaletteItems: [
                  {
                    label: t("labels.liveCollaboration"),
                    category: DEFAULT_CATEGORIES.app,
                    keywords: [
                      "team",
                      "multiplayer",
                      "share",
                      "public",
                      "session",
                      "invite"
                    ],
                    icon: usersIcon,
                    perform: () => {
                      setShareDialogState({
                        isOpen: true,
                        type: "collaborationOnly"
                      });
                    }
                  },
                  {
                    label: t("roomDialog.button_stopSession"),
                    category: DEFAULT_CATEGORIES.app,
                    predicate: () => !!collabAPI?.isCollaborating(),
                    keywords: [
                      "stop",
                      "session",
                      "end",
                      "leave",
                      "close",
                      "exit",
                      "collaboration"
                    ],
                    perform: () => {
                      if (collabAPI) {
                        collabAPI.stopCollaboration();
                        if (!collabAPI.isCollaborating()) {
                          setShareDialogState({ isOpen: false });
                        }
                      }
                    }
                  },
                  {
                    label: t("labels.share"),
                    category: DEFAULT_CATEGORIES.app,
                    predicate: true,
                    icon: share,
                    keywords: [
                      "link",
                      "shareable",
                      "readonly",
                      "export",
                      "publish",
                      "snapshot",
                      "url",
                      "collaborate",
                      "invite"
                    ],
                    perform: async () => {
                      setShareDialogState({ isOpen: true, type: "share" });
                    }
                  },
                  {
                    label: "GitHub",
                    icon: GithubIcon,
                    category: DEFAULT_CATEGORIES.links,
                    predicate: true,
                    keywords: [
                      "issues",
                      "bugs",
                      "requests",
                      "report",
                      "features",
                      "social",
                      "community"
                    ],
                    perform: () => {
                      window.open(
                        "https://github.com/excalidraw/excalidraw",
                        "_blank",
                        "noopener noreferrer"
                      );
                    }
                  },
                  {
                    label: t("labels.followUs"),
                    icon: XBrandIcon,
                    category: DEFAULT_CATEGORIES.links,
                    predicate: true,
                    keywords: ["twitter", "contact", "social", "community"],
                    perform: () => {
                      window.open(
                        "https://x.com/excalidraw",
                        "_blank",
                        "noopener noreferrer"
                      );
                    }
                  },
                  {
                    label: t("labels.discordChat"),
                    category: DEFAULT_CATEGORIES.links,
                    predicate: true,
                    icon: DiscordIcon,
                    keywords: [
                      "chat",
                      "talk",
                      "contact",
                      "bugs",
                      "requests",
                      "report",
                      "feedback",
                      "suggestions",
                      "social",
                      "community"
                    ],
                    perform: () => {
                      window.open(
                        "https://discord.gg/UexuTaE",
                        "_blank",
                        "noopener noreferrer"
                      );
                    }
                  },
                  {
                    label: "YouTube",
                    icon: youtubeIcon,
                    category: DEFAULT_CATEGORIES.links,
                    predicate: true,
                    keywords: ["features", "tutorials", "howto", "help", "community"],
                    perform: () => {
                      window.open(
                        "https://youtube.com/@excalidraw",
                        "_blank",
                        "noopener noreferrer"
                      );
                    }
                  },
                  ...isExcalidrawPlusSignedUser ? [
                    {
                      ...ExcalidrawPlusAppCommand,
                      label: "Sign in / Go to Excalidraw+"
                    }
                  ] : [ExcalidrawPlusCommand, ExcalidrawPlusAppCommand],
                  {
                    label: t("overwriteConfirm.action.excalidrawPlus.button"),
                    category: DEFAULT_CATEGORIES.export,
                    icon: exportToPlus,
                    predicate: true,
                    keywords: ["plus", "export", "save", "backup"],
                    perform: () => {
                      if (excalidrawAPI) {
                        exportToExcalidrawPlus(
                          excalidrawAPI.getSceneElements(),
                          excalidrawAPI.getAppState(),
                          excalidrawAPI.getFiles(),
                          excalidrawAPI.getName()
                        );
                      }
                    }
                  },
                  {
                    label: t("labels.installPWA"),
                    category: DEFAULT_CATEGORIES.app,
                    predicate: () => !!pwaEvent,
                    perform: () => {
                      if (pwaEvent) {
                        pwaEvent.prompt();
                        pwaEvent.userChoice.then(() => {
                          pwaEvent = null;
                        });
                      }
                    }
                  }
                ]
              }
            ),
            isVisualDebuggerEnabled() && excalidrawAPI && /* @__PURE__ */ jsx(
              DebugCanvas,
              {
                appState: excalidrawAPI.getAppState(),
                scale: window.devicePixelRatio,
                ref: debugCanvasRef
              }
            ),
            renameCtx && /* @__PURE__ */ jsx(
              "div",
              {
                className: "board-rename-ui",
                style: {
                  position: "absolute",
                  top: renameCtx.y,
                  left: renameCtx.x,
                  zIndex: 999999,
                  background: "white",
                  padding: "4px",
                  boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
                  transform: "translate(0, -110%)",
                  // initial fallback position
                  borderRadius: "4px",
                  display: "flex",
                  flexDirection: "column"
                },
                children: renameCtx.editing ? /* @__PURE__ */ jsx(
                  "input",
                  {
                    autoFocus: true,
                    defaultValue: renameCtx.initialName,
                    onKeyDown: (e) => {
                      if (e.key === "Enter") {
                        handleRenameConfirm(e.currentTarget.value);
                      }
                      if (e.key === "Escape") {
                        setRenameCtx(null);
                      }
                    },
                    onBlur: (e) => {
                      const relatedTarget = e.relatedTarget;
                      if (relatedTarget && relatedTarget.closest(".excalidraw-container")) {
                        requestAnimationFrame(() => e.target.focus());
                        return;
                      }
                      handleRenameConfirm(e.currentTarget.value);
                    },
                    style: {
                      padding: "4px",
                      fontSize: "14px",
                      border: "1px solid #ccc",
                      borderRadius: "2px",
                      outline: "none"
                    }
                  }
                ) : /* @__PURE__ */ jsx(
                  "div",
                  {
                    style: {
                      padding: "4px 8px",
                      cursor: "pointer",
                      fontWeight: "bold"
                    },
                    onPointerDown: (e) => {
                      e.preventDefault();
                      setRenameCtx({ ...renameCtx, editing: true });
                    },
                    children: "Rename"
                  }
                )
              }
            ),
            pointerPickerPos && excalidrawAPI && /* @__PURE__ */ jsx(
              PickerFolderDialog,
              {
                repo: boardRepo,
                onSelect: (folderId, folderName) => {
                  void createPointerInCanvas({
                    repo: boardRepo,
                    excalidrawAPI,
                    targetFolderId: folderId,
                    name: folderName,
                    sceneX: pointerPickerPos.sceneX,
                    sceneY: pointerPickerPos.sceneY
                  }).catch(
                    (e) => console.error("BoardSystem: failed to create pointer", e)
                  );
                  setPointerPickerPos(null);
                  excalidrawAPI.setActiveTool({ type: "selection" });
                },
                onClose: () => {
                  setPointerPickerPos(null);
                  excalidrawAPI.setActiveTool({ type: "selection" });
                }
              }
            )
          ]
        }
      )
    }
  );
};
const ExcalidrawApp = () => {
  const isCloudExportWindow = window.location.pathname === "/excalidraw-plus-export";
  if (isCloudExportWindow) {
    return /* @__PURE__ */ jsx(ExcalidrawPlusIframeExport, {});
  }
  return /* @__PURE__ */ jsx(TopErrorBoundary, { children: /* @__PURE__ */ jsx(Provider, { store: appJotaiStore, children: /* @__PURE__ */ jsx(ExcalidrawAPIProvider, { children: /* @__PURE__ */ jsx(ExcalidrawWrapper, {}) }) }) });
};
var App_default = ExcalidrawApp;
export {
  App_default as default
};
