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

import {
  buildProjectExport,
  downloadProjectExport,
} from "../import-export/exportService";
import {
  importProject,
  validateProjectExport,
} from "../import-export/importService";

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
  const { currentFolderId, navigationHistory, graphVersion } = useBoardsState();
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
  }, [repo, currentFolderId, graphVersion]);

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

  const handleExport = async () => {
    try {
      const project = await buildProjectExport(repo);
      if (!project) {
        window.alert("No hay proyecto para exportar.");
        return;
      }
      downloadProjectExport(project, "ekade-project.json");
    } catch (err: any) {
      console.error(err);
      window.alert(`Export failed: ${err.message}`);
    }
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) {
        return;
      }

      try {
        const text = await file.text();

        // 2. Parse JSON
        let parsedJSON: any;
        try {
          parsedJSON = JSON.parse(text);
        } catch (err) {
          window.alert(
            "Error de importación: El archivo no es un JSON válido.",
          );
          return;
        }

        // 3. Validar JSON
        const validation = validateProjectExport(parsedJSON);
        if (!validation.isValid) {
          window.alert(
            `Error de importación: Formato de proyecto inválido. ${validation.error}`,
          );
          return;
        }

        // 4. Confirmación antes de reemplazar
        const confirmed = window.confirm(
          "El proyecto actual será reemplazado completamente por el proyecto importado.\n\nEsta operación no se puede deshacer.\n\n¿Estás seguro de que deseas proceder con la importación?",
        );
        if (!confirmed) {
          return;
        }

        // 5. Persistir (Preflight y escrituras)
        await importProject(repo, parsedJSON);

        // 6. Recargar UI solo si fue exitoso
        window.alert(
          "Proyecto importado exitosamente. La aplicación se recargará para mostrar el nuevo proyecto.",
        );
        window.location.reload();
      } catch (err: any) {
        console.error(err);
        window.alert(`Error de importación/persistencia: ${err.message}`);
      }
    };
    input.click();
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
      <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
        <button type="button" onClick={handleImport} title="Import Workspace">
          Import
        </button>
        <button type="button" onClick={handleExport} title="Exportar proyecto">
          Exportar proyecto
        </button>
      </div>
    </div>
  );
};

export default NavBar;
