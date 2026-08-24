/**
 * Board System — ui / NavBar (Fase 5).
 *
 * Controles de navegación: Back, Forward y Breadcrumb/path navegable.
 * El breadcrumb se deriva del grafo (no se almacena). Se monta desde App.tsx.
 */

import React, { useEffect, useState } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { ancestors } from "../domain/graph";
import { useBoardsState } from "../host/boardState";
import {
  navigateBack,
  navigateForward,
  navigateToBreadcrumb,
} from "../host/boardService";
import { canGoBack, canGoForward } from "../host/navigation";

import type { FolderId } from "../types";
import type { BoardRepository } from "../repository/BoardRepository";

interface BreadcrumbItem {
  folderId: FolderId;
  name: string;
}

export const NavBar = ({
  repo,
  excalidrawAPI,
}: {
  repo: BoardRepository;
  excalidrawAPI: ExcalidrawImperativeAPI;
}) => {
  const { currentFolderId, navigationHistory } = useBoardsState();
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([]);

  // Cargar el grafo y derivar el breadcrumb cuando cambie el folder actual.
  useEffect(() => {
    let cancelled = false;
    repo.load().then((g) => {
      if (cancelled) {
        return;
      }
      if (g && currentFolderId) {
        const ancestorFolders = ancestors(g, currentFolderId);
        const currentFolder = g.folders[currentFolderId];
        const items: BreadcrumbItem[] = [
          ...ancestorFolders.map((f) => ({ folderId: f.id, name: f.name })),
        ];
        if (currentFolder) {
          items.push({ folderId: currentFolder.id, name: currentFolder.name });
        }
        setBreadcrumb(items);
      } else {
        setBreadcrumb([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [repo, currentFolderId]);

  const backEnabled = canGoBack(navigationHistory);
  const forwardEnabled = canGoForward(navigationHistory);

  const handleBack = () => {
    void navigateBack({ repo, excalidrawAPI });
  };
  const handleForward = () => {
    void navigateForward({ repo, excalidrawAPI });
  };
  const handleBreadcrumbClick = (folderId: FolderId) => {
    void navigateToBreadcrumb({ repo, excalidrawAPI, folderId });
  };

  return (
    <div
      className="board-navbar"
      style={{ display: "flex", alignItems: "center", gap: 8 }}
    >
      <button
        type="button"
        className="board-navbar-back"
        onClick={handleBack}
        disabled={!backEnabled}
        title="Back"
      >
        ←
      </button>
      <button
        type="button"
        className="board-navbar-forward"
        onClick={handleForward}
        disabled={!forwardEnabled}
        title="Forward"
      >
        →
      </button>
      <div
        className="board-navbar-breadcrumb"
        style={{ display: "flex", gap: 4 }}
      >
        {breadcrumb.map((item, idx) => (
          <React.Fragment key={item.folderId}>
            {idx > 0 && <span>/</span>}
            <button
              type="button"
              className="board-navbar-breadcrumb-item"
              onClick={() => handleBreadcrumbClick(item.folderId)}
              title={item.name}
            >
              {item.name}
            </button>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default NavBar;
