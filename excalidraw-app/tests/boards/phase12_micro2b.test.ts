
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PostgresBoardRepository } from '../../boards/repository/PostgresBoardRepository';
import { boardsStoreActions, bootStateAtom } from '../../boards/host/boardState';
import { appJotaiStore } from '../../app-jotai';
import { startMultiTabSync } from '../../boards/host/reconciliation';
import * as boardService from '../../boards/host/boardService';

// Asegurarnos que STORAGE_KEYS esta disponible, si no, hardcodear para el evento
const STORAGE_KEYS = { BOARDS_GRAPH: 'excalidraw-boards-graph' };

describe('Microphase 2B: Blindaje MultiTab / StorageEvent', () => {
  let repo: PostgresBoardRepository;
  let excalidrawAPI: any;
  let unsubscribe: () => void;
  let saveCurrentBoardSpy: any;

  beforeEach(async () => {
    repo = new PostgresBoardRepository();
    // Limpieza de BD
    await fetch((process.env.VITE_BRIDGE_URL || 'http://127.0.0.1:3006') + '/api/debug/reset', { method: 'POST' });
    
    excalidrawAPI = {
      getName: () => 'MultiTab Editor',
      getSceneElementsIncludingDeleted: () => [],
      getAppState: () => ({ zoom: { value: 1 } }),
      getFiles: () => ({}),
      updateScene: vi.fn(),
      addFiles: vi.fn(),
    };

    saveCurrentBoardSpy = vi.spyOn(boardService, 'saveCurrentBoard');

    appJotaiStore.set(bootStateAtom, 'ready');
    boardsStoreActions.setCurrentBoardId('b-1');
    boardsStoreActions.setCurrentFolderId('f-1');

    // Iniciar el listener REAL
    unsubscribe = startMultiTabSync(repo, excalidrawAPI);
  });

  afterEach(() => {
    unsubscribe();
    vi.restoreAllMocks();
  });

  function fireStorageEvent() {
    window.dispatchEvent(new StorageEvent('storage', {
      key: STORAGE_KEYS.BOARDS_GRAPH,
      newValue: 'test-trigger'
    }));
  }

  // Esperar a que la Promise queue de syncQueue se resuelva (es interna a reconciliation)
  const flushPromises = () => new Promise(resolve => setTimeout(resolve, 50));

  it('TEST 1 - StorageEvent durante booting es ignorado', async () => {
    appJotaiStore.set(bootStateAtom, 'booting');
    
    const before = await repo.loadBoard('b-1');
    fireStorageEvent();
    await flushPromises();

    expect(saveCurrentBoardSpy).not.toHaveBeenCalled();
    const after = await repo.loadBoard('b-1');
    expect(before).toEqual(after);
  });

  it('TEST 2 - StorageEvent durante failed es ignorado', async () => {
    appJotaiStore.set(bootStateAtom, 'failed');
    
    const before = await repo.loadBoard('b-1');
    fireStorageEvent();
    await flushPromises();

    expect(saveCurrentBoardSpy).not.toHaveBeenCalled();
    const after = await repo.loadBoard('b-1');
    expect(before).toEqual(after);
  });

  it('TEST 3 - StorageEvent funciona durante ready', async () => {
    appJotaiStore.set(bootStateAtom, 'ready');

    await repo.save({ schemaVersion: 1, rootFolderId: 'f-other', lastOpenBoardId: 'b-other', boards: {}, folders: {}, pointers: {} } as any);
    await repo.saveBoard({ schemaVersion: 1, boardId: 'b-1', name: 'res', elements: [], files: {}, viewport: null, updatedAt: 0 });

    fireStorageEvent();
    await flushPromises();

    expect(saveCurrentBoardSpy).toHaveBeenCalled();
  });

  it('TEST 4 - Transicion booting -> ready funciona correctamente', async () => {
    appJotaiStore.set(bootStateAtom, 'booting');
    
    await repo.save({ schemaVersion: 1, rootFolderId: 'f-other', lastOpenBoardId: 'b-other', boards: {}, folders: {}, pointers: {} } as any);
    await repo.saveBoard({ schemaVersion: 1, boardId: 'b-1', name: 'res', elements: [], files: {}, viewport: null, updatedAt: 0 });

    fireStorageEvent();
    await flushPromises();
    // En booting, es ignorado
    expect(saveCurrentBoardSpy).not.toHaveBeenCalled();

    // Ahora transicionamos
    appJotaiStore.set(bootStateAtom, 'ready');

    fireStorageEvent();
    await flushPromises();
    // Ahora si funciona!
    expect(saveCurrentBoardSpy).toHaveBeenCalled();
  });

  it('TEST 5 - Defensa en profundidad (si un proceso lograra bypassear MultiTab en booting)', async () => {
    // Fingimos que por alguna razon (un timeout residual de MultiTab) se intenta guardar durante booting
    appJotaiStore.set(bootStateAtom, 'booting');

    // Comprobamos que el guard nativo de saveCurrentBoard tambien lo rechaza!
    await expect(boardService.saveCurrentBoard(excalidrawAPI, repo, 'b-1')).rejects.toThrow('Board system is not ready');
  });
});

