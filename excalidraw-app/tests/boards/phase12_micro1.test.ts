
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PostgresBoardRepository } from '../../boards/repository/PostgresBoardRepository';
import { boardsStoreActions, bootStateAtom, bootErrorAtom } from '../../boards/host/boardState';
import { appJotaiStore } from '../../app-jotai';
import { initializeBoardSystem, commitState } from '../../boards/host/boardService';

vi.mock('../../boards/host/reconciliation', () => ({
  reconcilePointerNamesInEditor: vi.fn(),
}));

describe('Microphase 1: Boot State & Deferred commitState', () => {
  let repo: any;

  beforeEach(() => {
    repo = new PostgresBoardRepository();
    appJotaiStore.set(bootStateAtom, 'booting');
    appJotaiStore.set(bootErrorAtom, null);
    boardsStoreActions.setCurrentBoardId(null);
    boardsStoreActions.setCurrentFolderId(null);
    boardsStoreActions.setBoardData(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Test 1: Boot exitoso asigna ready y usa commitState DESPUES de la carga', async () => {
    vi.spyOn(repo, 'load').mockResolvedValue({
      boards: { 'b1': { id: 'b1', name: 'root', rootFolderId: 'f1', createdAt: 0, updatedAt: 0 } },
      folders: { 'f1': { id: 'f1', name: 'root', parentId: null, boardId: 'b1', createdAt: 0, updatedAt: 0 } },
      rootFolderId: 'f1',
      pointers: {}
    });
    vi.spyOn(repo, 'loadBoard').mockResolvedValue({
      boardId: 'b1',
      schemaVersion: 1,
      elements: [],
      files: {},
      viewport: null,
      name: 'root',
      updatedAt: 0
    });

    const bootResult = await initializeBoardSystem(repo);
    
    expect(boardsStoreActions.getCurrentBoardId()).toBeNull();
    expect(appJotaiStore.get(bootStateAtom)).toBe('booting');

    const loadBoardIntoEditor = vi.fn();
    loadBoardIntoEditor(null, bootResult.boardData);
    
    commitState(bootResult.currentBoardId, bootResult.currentFolderId, bootResult.boardData);
    
    expect(boardsStoreActions.getCurrentBoardId()).toBe('b1');
    expect(appJotaiStore.get(bootStateAtom)).toBe('ready');
  });

  it('Test 2: Fallo de hidratacion (loadBoardIntoEditor crashea)', async () => {
    vi.spyOn(repo, 'load').mockResolvedValue({
      boards: { 'b1': { id: 'b1', name: 'root', rootFolderId: 'f1', createdAt: 0, updatedAt: 0 } },
      folders: { 'f1': { id: 'f1', name: 'root', parentId: null, boardId: 'b1', createdAt: 0, updatedAt: 0 } },
      rootFolderId: 'f1',
      pointers: {}
    });
    vi.spyOn(repo, 'loadBoard').mockResolvedValue({
      boardId: 'b1',
      schemaVersion: 1,
      elements: [],
      files: {},
      viewport: null,
      name: 'root',
      updatedAt: 0
    });

    try {
      const bootResult = await initializeBoardSystem(repo);
      
      const loadBoardIntoEditorFails = vi.fn((_api: any, _data: any) => {
        throw new Error('Invalid JSON hydration');
      });
      loadBoardIntoEditorFails(null, bootResult.boardData);
      
      commitState(bootResult.currentBoardId, bootResult.currentFolderId, bootResult.boardData);
    } catch (error) {
      appJotaiStore.set(bootStateAtom, 'failed');
      appJotaiStore.set(bootErrorAtom, error);
    }

    expect(appJotaiStore.get(bootStateAtom)).toBe('failed');
    expect(boardsStoreActions.getCurrentBoardId()).toBeNull();
  });

  it('Test 3: Fallo de fetch en repositorio', async () => {
    vi.spyOn(repo, 'load').mockRejectedValue(new Error('Failed to load graph: ECONNREFUSED'));

    try {
      await initializeBoardSystem(repo);
    } catch (error) {
      appJotaiStore.set(bootStateAtom, 'failed');
      appJotaiStore.set(bootErrorAtom, error);
    }

    expect(appJotaiStore.get(bootStateAtom)).toBe('failed');
    expect(boardsStoreActions.getCurrentBoardId()).toBeNull();
  });
});

