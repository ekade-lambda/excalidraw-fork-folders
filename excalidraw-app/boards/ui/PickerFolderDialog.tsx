import React, { useEffect, useState } from "react";

import { Dialog } from "../../../packages/excalidraw/components/Dialog";

import type { BoardRepository } from "../repository/BoardRepository";
import type { FolderId, BoardsGraph } from "../types";

export const PickerFolderDialog = ({
  repo,
  onSelect,
  onClose,
}: {
  repo: BoardRepository;
  onSelect: (folderId: FolderId, folderName: string) => void;
  onClose: () => void;
}) => {
  const [graph, setGraph] = useState<BoardsGraph | null>(null);

  useEffect(() => {
    let active = true;
    repo.load().then((g) => {
      if (active) {
        setGraph(g);
      }
    });
    return () => {
      active = false;
    };
  }, [repo]);

  if (!graph) {
    return null;
  }

  // Obtenemos todos los folders ordenados (excluimos pointers, por definicion graph.folders solo tiene carpetas reales)
  const folders = Object.values(graph.folders).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <Dialog
      onCloseRequest={onClose}
      title="Seleccionar Carpeta Destino"
      className="board-picker-dialog"
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          maxHeight: 400,
          overflowY: "auto",
        }}
      >
        {folders.map((f) => (
          <button
            key={f.id}
            onClick={() => onSelect(f.id, f.name)}
            style={{ padding: 8, textAlign: "left", cursor: "pointer" }}
          >
            📁 {f.name}
          </button>
        ))}
      </div>
    </Dialog>
  );
};

export default PickerFolderDialog;
