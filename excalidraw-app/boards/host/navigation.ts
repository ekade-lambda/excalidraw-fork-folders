/**
 * Board System — host / navigation (Fase 5).
 *
 * Módulo PURE de historial de navegación (back/forward). No depende de React
 * ni de Excalidraw; las operaciones son funciones puras sobre `NavigationHistory`.
 *
 * Modelo: `back` es la pila de entries visitados (el último es el actual).
 * `forward` es la pila de entries "futuros". Cuando se abre un destino nuevo
 * (no por back/forward), se limpia el forward.
 */

import type { NavigationHistory, NavEntry } from "../types";

/** Crea un historial vacío. */
export function createNavigationHistory(): NavigationHistory {
  return { back: [], forward: [] };
}

/** ¿Se puede ir atrás? (hay al menos un entry antes del actual). */
export function canGoBack(history: NavigationHistory): boolean {
  return history.back.length > 1;
}

/** ¿Se puede ir adelante? (hay entries en el forward). */
export function canGoForward(history: NavigationHistory): boolean {
  return history.forward.length > 0;
}

/** Devuelve el entry actual (el último del back). */
export function getCurrentEntry(history: NavigationHistory): NavEntry | null {
  return history.back[history.back.length - 1] ?? null;
}

/**
 * Registra una navegación a `entry` (abrir un destino nuevo).
 * Si el último del back ya es `entry`, no hace nada (evita duplicados).
 * Limpia el forward (comportamiento de navegador).
 */
export function navigateToHistory(
  history: NavigationHistory,
  entry: NavEntry,
): NavigationHistory {
  const last = history.back[history.back.length - 1];
  if (last && last.id === entry.id && last.kind === entry.kind) {
    // Ya estamos en ese destino; no duplicar.
    return history;
  }
  return {
    back: [...history.back, entry],
    forward: [], // nueva navegación invalida la rama forward.
  };
}

/**
 * Inicializa el historial con el entry actual (boot). No limpia el forward
 * (porque no hay forward en el boot).
 */
export function initializeHistory(entry: NavEntry): NavigationHistory {
  return { back: [entry], forward: [] };
}

/**
 * Va atrás. Devuelve el nuevo historial y el entry destino (el nuevo último
 * del back). Si no se puede ir atrás, devuelve null.
 */
export function goBackInHistory(history: NavigationHistory): {
  history: NavigationHistory;
  entry: NavEntry | null;
} {
  if (!canGoBack(history)) {
    return { history, entry: null };
  }
  const current = history.back[history.back.length - 1];
  const newBack = history.back.slice(0, -1);
  const newForward = [...history.forward, current];
  const destination = newBack[newBack.length - 1] ?? null;
  return {
    history: { back: newBack, forward: newForward },
    entry: destination,
  };
}

/**
 * Va adelante. Devuelve el nuevo historial y el entry destino (el nuevo último
 * del back). Si no se puede ir adelante, devuelve null.
 */
export function goForwardInHistory(history: NavigationHistory): {
  history: NavigationHistory;
  entry: NavEntry | null;
} {
  if (!canGoForward(history)) {
    return { history, entry: null };
  }
  const destination = history.forward[history.forward.length - 1];
  const newForward = history.forward.slice(0, -1);
  const newBack = [...history.back, destination];
  return {
    history: { back: newBack, forward: newForward },
    entry: destination,
  };
}
