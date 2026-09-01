import {
  BridgeUnavailableError,
  CancelledBridgeError,
  FileIdentity,
  FileNotFoundBridgeError,
  InternalBridgeError,
  LinkedFileMetadata,
} from "./types";

const BRIDGE_URL = "http://127.0.0.1:3005";

export interface PickFileResult {
  fileIdentity: FileIdentity;
  lastKnownPath: string;
  metadata: LinkedFileMetadata;
}

export interface ResolveFileResult {
  status: "resolved";
  currentPath: string;
}

export interface BridgeHealth {
  ok: boolean;
  dbConnected: boolean;
  dbError?: string;
}

/**
 * Verifica si el Bridge está vivo y responde en 127.0.0.1:3005
 * Ahora también devuelve el estado de la conexión a PostgreSQL.
 */
export async function checkBridgeHealth(): Promise<BridgeHealth> {
  try {
    const res = await fetch(`${BRIDGE_URL}/health`, { method: "GET" });
    if (!res.ok) {
      return { ok: false, dbConnected: false };
    }
    const data = await res.json();
    return {
      ok: data.status === "ok",
      dbConnected: !!data.db_connected,
      dbError: data.db_error,
    };
  } catch (e) {
    return { ok: false, dbConnected: false };
  }
}

/**
 * Invoca el File Picker nativo.
 * Retorna los datos del archivo o lanza un BridgeError.
 */
export async function pickFile(): Promise<PickFileResult> {
  let res: Response;
  try {
    res = await fetch(`${BRIDGE_URL}/pick-file`, { method: "GET" });
  } catch (e) {
    throw new BridgeUnavailableError();
  }

  if (!res.ok) {
    throw new InternalBridgeError(`HTTP Error ${res.status}`);
  }

  const data = await res.json();

  if (data.status === "cancelled") {
    throw new CancelledBridgeError();
  }

  if (data.status === "success" && data.file_identity && data.metadata) {
    return {
      fileIdentity: {
        volumeGuid: data.file_identity.volume_guid,
        fileId: data.file_identity.file_id,
      },
      lastKnownPath: data.last_known_path || "",
      metadata: {
        name: data.metadata.name,
        extension: data.metadata.extension,
        size: data.metadata.size,
      },
    };
  }

  throw new InternalBridgeError(data.status || "Unknown error");
}

/**
 * Resuelve la identidad física devolviendo la ruta actual.
 */
export async function resolveFile(
  identity: FileIdentity,
  lastKnownPath?: string,
): Promise<ResolveFileResult> {
  let res: Response;
  try {
    res = await fetch(`${BRIDGE_URL}/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        volume_guid: identity.volumeGuid,
        file_id: identity.fileId,
        last_known_path: lastKnownPath || null,
      }),
    });
  } catch (e) {
    throw new BridgeUnavailableError();
  }

  if (!res.ok) {
    throw new InternalBridgeError(`HTTP Error ${res.status}`);
  }

  const data = await res.json();

  if (data.status === "resolved" && data.current_path) {
    return {
      status: "resolved",
      currentPath: data.current_path,
    };
  }

  if (data.status === "not_found") {
    throw new FileNotFoundBridgeError();
  }

  throw new InternalBridgeError(data.status);
}

/**
 * Ordena a Windows abrir el archivo.
 */
export async function openFile(
  identity: FileIdentity,
  lastKnownPath?: string,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${BRIDGE_URL}/open`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        volume_guid: identity.volumeGuid,
        file_id: identity.fileId,
        last_known_path: lastKnownPath || null,
      }),
    });
  } catch (e) {
    throw new BridgeUnavailableError();
  }

  if (!res.ok) {
    throw new InternalBridgeError(`HTTP Error ${res.status}`);
  }

  const data = await res.json();

  if (data.status === "resolved") {
    return;
  }

  if (data.status === "not_found") {
    throw new FileNotFoundBridgeError();
  }

  throw new InternalBridgeError(data.status);
}
