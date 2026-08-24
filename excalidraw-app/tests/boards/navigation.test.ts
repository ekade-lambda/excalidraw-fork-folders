import { describe, expect, it } from "vitest";

import {
  createNavigationHistory,
  canGoBack,
  canGoForward,
  getCurrentEntry,
  navigateToHistory,
  initializeHistory,
  goBackInHistory,
  goForwardInHistory,
} from "../../boards/host/navigation";

import type { NavEntry } from "../../boards/types";

const entryA: NavEntry = { kind: "folder", id: "f-a", boardId: "b-a" };
const entryB: NavEntry = { kind: "folder", id: "f-b", boardId: "b-b" };
const entryC: NavEntry = { kind: "folder", id: "f-c", boardId: "b-c" };

describe("Board System :: navigation (Fase 5)", () => {
  it("createNavigationHistory crea un historial vacío", () => {
    const h = createNavigationHistory();
    expect(h.back).toEqual([]);
    expect(h.forward).toEqual([]);
    expect(canGoBack(h)).toBe(false);
    expect(canGoForward(h)).toBe(false);
  });

  it("initializeHistory registra el entry inicial", () => {
    const h = initializeHistory(entryA);
    expect(h.back).toEqual([entryA]);
    expect(h.forward).toEqual([]);
    expect(getCurrentEntry(h)).toEqual(entryA);
  });

  it("navigateToHistory empuja un entry nuevo y limpia el forward", () => {
    let h = initializeHistory(entryA);
    h = navigateToHistory(h, entryB);
    expect(h.back).toEqual([entryA, entryB]);
    expect(h.forward).toEqual([]);
    expect(getCurrentEntry(h)).toEqual(entryB);
  });

  it("navigateToHistory no duplica si el último ya es el entry", () => {
    let h = initializeHistory(entryA);
    h = navigateToHistory(h, entryA);
    expect(h.back).toEqual([entryA]);
    expect(h.back.length).toBe(1);
  });

  it("goBack mueve el último del back al forward", () => {
    let h = initializeHistory(entryA);
    h = navigateToHistory(h, entryB);
    const result = goBackInHistory(h);
    expect(result.entry).toEqual(entryA);
    expect(result.history.back).toEqual([entryA]);
    expect(result.history.forward).toEqual([entryB]);
  });

  it("goBack en el primer elemento no hace nada", () => {
    const h = initializeHistory(entryA);
    const result = goBackInHistory(h);
    expect(result.entry).toBeNull();
    expect(result.history.back).toEqual([entryA]);
    expect(result.history.forward).toEqual([]);
  });

  it("goForward mueve el último del forward al back", () => {
    let h = initializeHistory(entryA);
    h = navigateToHistory(h, entryB);
    const backResult = goBackInHistory(h);
    const forwardResult = goForwardInHistory(backResult.history);
    expect(forwardResult.entry).toEqual(entryB);
    expect(forwardResult.history.back).toEqual([entryA, entryB]);
    expect(forwardResult.history.forward).toEqual([]);
  });

  it("goForward en el último elemento no hace nada", () => {
    let h = initializeHistory(entryA);
    h = navigateToHistory(h, entryB);
    const result = goForwardInHistory(h);
    expect(result.entry).toBeNull();
    expect(result.history.back).toEqual([entryA, entryB]);
    expect(result.history.forward).toEqual([]);
  });

  it("Back → nueva navegación → Forward invalidado", () => {
    let h = initializeHistory(entryA);
    h = navigateToHistory(h, entryB);
    h = navigateToHistory(h, entryC);
    // Back a B
    const backResult = goBackInHistory(h);
    expect(backResult.entry).toEqual(entryB);
    // Nueva navegación a A (invalida el forward a C)
    const newNav = navigateToHistory(backResult.history, entryA);
    expect(newNav.forward).toEqual([]);
    expect(newNav.back).toEqual([entryA, entryB, entryA]);
  });

  it("múltiples niveles de jerarquía", () => {
    let h = initializeHistory(entryA);
    h = navigateToHistory(h, entryB);
    h = navigateToHistory(h, entryC);
    expect(h.back).toEqual([entryA, entryB, entryC]);
    // Back dos veces
    const back1 = goBackInHistory(h);
    expect(back1.entry).toEqual(entryB);
    const back2 = goBackInHistory(back1.history);
    expect(back2.entry).toEqual(entryA);
    // Forward dos veces
    const fwd1 = goForwardInHistory(back2.history);
    expect(fwd1.entry).toEqual(entryB);
    const fwd2 = goForwardInHistory(fwd1.history);
    expect(fwd2.entry).toEqual(entryC);
  });

  it("canGoBack/canGoForward reflejan el estado correctamente", () => {
    let h = initializeHistory(entryA);
    expect(canGoBack(h)).toBe(false);
    expect(canGoForward(h)).toBe(false);
    h = navigateToHistory(h, entryB);
    expect(canGoBack(h)).toBe(true);
    expect(canGoForward(h)).toBe(false);
    const backResult = goBackInHistory(h);
    expect(canGoBack(backResult.history)).toBe(false);
    expect(canGoForward(backResult.history)).toBe(true);
  });
});
