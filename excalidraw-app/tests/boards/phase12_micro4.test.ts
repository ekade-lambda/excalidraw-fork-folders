import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PostgresBoardRepository } from '../../boards/repository/PostgresBoardRepository';
import { boardsStoreActions, hydrationStateAtom, bootStateAtom } from '../../boards/host/boardState';
import { appJotaiStore } from '../../app-jotai';
import { openFolder, saveCurrentBoard, navigateBack } from '../../boards/host/boardService';

vi.mock('../../boards/host/reconciliation', async (importOriginal: any) => {
  const actual = await importOriginal();
  return {
    ...actual,
    reconcilePointerNamesInEditor: vi.fn(),
  };
});

const mockExcalidrawAPI: any = {
  getSceneElementsIncludingDeleted: vi.fn(() => []),
  getFiles: vi.fn(() => ({})),
  getName: vi.fn(() => 'Test Board'),
  getAppState: vi.fn(() => ({ width: 100, height: 100 })),
  updateScene: vi.fn(),
  addFiles: vi.fn(),
};

describe('Microphase 4: Hydration State Protection', () => {
  let repo: any;

  beforeEach(() => {
    repo = new PostgresBoardRepository();
    vi.spyOn(repo, 'saveBoard').mockResolvedValue(undefined);
    vi.spyOn(repo, 'save').mockResolvedValue(undefined);

    appJotaiStore.set(bootStateAtom, 'ready');
    boardsStoreActions.setCurrentBoardId(null);
    boardsStoreActions.setCurrentFolderId(null);
    boardsStoreActions.setBoardData(null);
    boardsStoreActions.setHydrationState('complete');
    
    vi.spyOn(repo, 'load').mockResolvedValue({
      boards: { 
        'b1': { id: 'b1', rootFolderId: 'f1', name: 'board 1' },
        'b2': { id: 'b2', rootFolderId: 'f2', name: 'board 2' }
      },
      folders: { 
        'f1': { id: 'f1', boardId: 'b1', name: 'folder 1' },
        'f2': { id: 'f2', boardId: 'b2', name: 'folder 2' }
      },
      rootFolderId: 'f1',
      pointers: {}
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Test 1: board sin assets', async () => {
    vi.spyOn(repo, 'loadBoard').mockResolvedValue({ boardId: 'b1', elements: [], files: {} });
    await openFolder({ repo, excalidrawAPI: mockExcalidrawAPI, folderId: 'f1' });
    
    expect(boardsStoreActions.getHydrationState()).toBe('complete');
    await saveCurrentBoard(mockExcalidrawAPI, repo, 'b1');
    expect(repo.saveBoard).toHaveBeenCalled();
  });

  it('Test 2: todos los assets disponibles', async () => {
    vi.spyOn(repo, 'loadBoard').mockResolvedValue({ 
      boardId: 'b1', elements: [], 
      files: { 'img1': { mimeType: 'image/png', dataURL: 'data:...' } } 
    });
    await openFolder({ repo, excalidrawAPI: mockExcalidrawAPI, folderId: 'f1' });
    
    expect(boardsStoreActions.getHydrationState()).toBe('complete');
    await saveCurrentBoard(mockExcalidrawAPI, repo, 'b1');
    expect(repo.saveBoard).toHaveBeenCalled();
  });

  it('Test 3: asset sin dataURL', async () => {
    vi.spyOn(repo, 'loadBoard').mockResolvedValue({ 
      boardId: 'b1', elements: [], 
      files: { 'img1': { mimeType: 'image/png' } } 
    });
    await openFolder({ repo, excalidrawAPI: mockExcalidrawAPI, folderId: 'f1' });
    
    expect(boardsStoreActions.getHydrationState()).toBe('partial');
    await saveCurrentBoard(mockExcalidrawAPI, repo, 'b1');
    expect(repo.saveBoard).not.toHaveBeenCalled();
  });

  it('Test 4: multiples assets, uno roto', async () => {
    vi.spyOn(repo, 'loadBoard').mockResolvedValue({ 
      boardId: 'b1', elements: [], 
      files: { 
        'img1': { mimeType: 'image/png', dataURL: 'data:...' },
        'img2': { mimeType: 'image/png' } 
      } 
    });
    await openFolder({ repo, excalidrawAPI: mockExcalidrawAPI, folderId: 'f1' });
    
    expect(boardsStoreActions.getHydrationState()).toBe('partial');
    await saveCurrentBoard(mockExcalidrawAPI, repo, 'b1');
    expect(repo.saveBoard).not.toHaveBeenCalled();
  });

  it('Test 5 y 6: board parcial -> navegacion a board complete', async () => {
    vi.spyOn(repo, 'loadBoard').mockResolvedValue({ 
      boardId: 'b1', elements: [], files: { 'img1': { mimeType: 'image/png' } } 
    });
    await openFolder({ repo, excalidrawAPI: mockExcalidrawAPI, folderId: 'f1' });
    expect(boardsStoreActions.getHydrationState()).toBe('partial');

    vi.spyOn(repo, 'loadBoard').mockResolvedValue({ boardId: 'b2', elements: [], files: {} });
    await openFolder({ repo, excalidrawAPI: mockExcalidrawAPI, folderId: 'f2' });

    expect(repo.saveBoard).not.toHaveBeenCalledWith(expect.objectContaining({ boardId: 'b1' }));
    
    expect(boardsStoreActions.getCurrentBoardId()).toBe('b2');
    expect(boardsStoreActions.getHydrationState()).toBe('complete');

    await saveCurrentBoard(mockExcalidrawAPI, repo, 'b2');
    expect(repo.saveBoard).toHaveBeenCalledWith(expect.objectContaining({ boardId: 'b2' }));
  });

  it('Test 7: board complete -> navegacion a board partial', async () => {
    vi.spyOn(repo, 'loadBoard').mockResolvedValue({ boardId: 'b1', elements: [], files: {} });
    await openFolder({ repo, excalidrawAPI: mockExcalidrawAPI, folderId: 'f1' });
    expect(boardsStoreActions.getHydrationState()).toBe('complete');

    vi.spyOn(repo, 'loadBoard').mockResolvedValue({ 
      boardId: 'b2', elements: [], files: { 'img1': { mimeType: 'image/png' } } 
    });
    await openFolder({ repo, excalidrawAPI: mockExcalidrawAPI, folderId: 'f2' });

    expect(repo.saveBoard).toHaveBeenCalledWith(expect.objectContaining({ boardId: 'b1' }));
    
    expect(boardsStoreActions.getCurrentBoardId()).toBe('b2');
    expect(boardsStoreActions.getHydrationState()).toBe('partial');

    repo.saveBoard.mockClear();
    await saveCurrentBoard(mockExcalidrawAPI, repo, 'b2');
    expect(repo.saveBoard).not.toHaveBeenCalled();
  });

  it('Test 8: MultiTab es irrelevante si esta partial', async () => {
    vi.spyOn(repo, 'loadBoard').mockResolvedValue({ 
      boardId: 'b1', elements: [], files: { 'img1': { mimeType: 'image/png' } } 
    });
    await openFolder({ repo, excalidrawAPI: mockExcalidrawAPI, folderId: 'f1' });
    expect(boardsStoreActions.getHydrationState()).toBe('partial');

    await saveCurrentBoard(mockExcalidrawAPI, repo, 'b1');
    expect(repo.saveBoard).not.toHaveBeenCalled();
  });

  it('Test 9: bootState failed aborta save independientemente', async () => {
    vi.spyOn(repo, 'loadBoard').mockResolvedValue({ boardId: 'b1', elements: [], files: {} });
    await openFolder({ repo, excalidrawAPI: mockExcalidrawAPI, folderId: 'f1' });
    expect(boardsStoreActions.getHydrationState()).toBe('complete');
    
    appJotaiStore.set(bootStateAtom, 'failed'); 
    
    await expect(saveCurrentBoard(mockExcalidrawAPI, repo, 'b1')).rejects.toThrow();
  });
});
