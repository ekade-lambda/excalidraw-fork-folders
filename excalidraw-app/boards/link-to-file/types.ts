/**
 * Tipos de dominio para el subsistema Link to File.
 */

/**
 * Identidad física estricta de un archivo en Windows.
 * Esta es la única fuente de verdad para la resolución (Nivel 1).
 */
export interface FileIdentity {
  /** GUID del volumen, ej: "\\?\Volume{b6bfe2fe-7937-4030-9464-23e89f2a10be}\" */
  volumeGuid: string;
  /** Identificador MFT de 128-bits preservado exactamente como array de bytes */
  fileId: number[];
}

/**
 * Metadata auxiliar del archivo. Sirve para UX y para heurísticas de Fallback.
 */
export interface LinkedFileMetadata {
  name: string;
  extension: string;
  size: number;
  creationTime?: string;
}

/**
 * Modelo de datos conceptual para el futuro elemento visual en BoardData.
 * (No se integra todavía con CustomData o ExcalidrawElement en esta fase).
 */
export interface LinkToFileData {
  type: "link-to-file";
  fileIdentity: FileIdentity;
  lastKnownPath: string;
  metadata: LinkedFileMetadata;
}

/**
 * Estados runtime derivados (NO persistidos).
 */
export type LinkToFileRuntimeStatus =
  | "unknown"
  | "resolved"
  | "broken"
  | "bridge-unavailable";

/**
 * Tipos de Error del Bridge (Domain Errors)
 */
export class BridgeError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "BridgeError";
  }
}

export class BridgeUnavailableError extends BridgeError {
  constructor() {
    super("El Bridge local no está disponible", "BridgeUnavailable");
  }
}

export class FileNotFoundBridgeError extends BridgeError {
  constructor() {
    super("El archivo no pudo ser resuelto por el Bridge", "FileNotFound");
  }
}

export class InvalidIdentityBridgeError extends BridgeError {
  constructor() {
    super("Identidad de archivo inválida", "InvalidIdentity");
  }
}

export class CancelledBridgeError extends BridgeError {
  constructor() {
    super("Operación cancelada por el usuario", "Cancelled");
  }
}

export class InternalBridgeError extends BridgeError {
  constructor(message = "Error interno en el Bridge") {
    super(message, "BridgeInternalError");
  }
}
