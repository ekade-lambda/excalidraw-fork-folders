
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PostgresBoardRepository } from '../../boards/repository/PostgresBoardRepository';
import { boardsStoreActions, bootStateAtom } from '../../boards/host/boardState';
import { appJotaiStore } from '../../app-jotai';
import { saveCurrentBoard, openFolder } from '../../boards/host/boardService';
import { createFolder } from '../../boards/host/folderService';

vi.mock('../../boards/host/reconciliation', () => ({
  startMultiTabSync: vi.fn(),
  reconcilePointerNamesInEditor: vi.fn(),
}));

describe('Microphase 2A: Frontera de escritura segura', () => {
  let repo: PostgresBoardRepository;
  let excalidrawAPI: any;

  beforeEach(async () => {
    repo = new PostgresBoardRepository();
    // Iniciar con BD limpia creando root
    await fetch((process.env.VITE_BRIDGE_URL || 'http://127.0.0.1:3006') + '/api/debug/reset', { method: 'POST' });
    
    // Mock basico de ExcalidrawAPI
    excalidrawAPI = {
      getName: () => 'Test Name',
      getSceneElements: () => [],
      getSceneElementsIncludingDeleted: () => [],
      getAppState: () => ({ zoom: { value: 1 } }),
      getFiles: () => ({}),
      updateScene: vi.fn(),
      addFiles: vi.fn(),
    };

    appJotaiStore.set(bootStateAtom, 'ready');
    boardsStoreActions.setCurrentBoardId('b-test-123');
    boardsStoreActions.setCurrentFolderId('f-test-123');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function checkBoardDidNotChange(boardId: string, action: () => Promise<any>) {
    // 1. Obtener estado previo de DB
    const before = await repo.loadBoard(boardId);
    
    // 2. Ejecutar accion esperando fallo
    await expect(action()).rejects.toThrow('Board system is not ready');
    
    // 3. Confirmar que la DB no fue tocada
    const after = await repo.loadBoard(boardId);
    expect(before).toEqual(after);
  }

  // TEST 1 y 2
  it('Test 1 y 2: saveCurrentBoard es bloqueado en booting y failed', async () => {
    appJotaiStore.set(bootStateAtom, 'booting');
    await checkBoardDidNotChange('b-test-123', () => saveCurrentBoard(excalidrawAPI, repo, 'b-test-123'));

    appJotaiStore.set(bootStateAtom, 'failed');
    await checkBoardDidNotChange('b-test-123', () => saveCurrentBoard(excalidrawAPI, repo, 'b-test-123'));
  });

  // TEST 3
  it('Test 3: saveCurrentBoard funciona en ready', async () => {
    appJotaiStore.set(bootStateAtom, 'ready');
    
    const before = await repo.loadBoard('b-test-123');
    // Forzar creacion del board inicial si no existiera
    if (!before) {
       await repo.saveBoard({
         schemaVersion: 1, boardId: 'b-test-123', name: 'Original', elements: [], files: {}, viewport: null, updatedAt: 0
       });
    }

    excalidrawAPI.getSceneElementsIncludingDeleted = () => [{ id: 'test-el', type: 'rectangle' }];
    await saveCurrentBoard(excalidrawAPI, repo, 'b-test-123');
    
    const after = await repo.loadBoard('b-test-123');
    expect(after?.elements.length).toBe(1);
    expect((after?.elements[0] as any).id).toBe('test-el');
  });

  // TEST 4 y 5
  it('Test 4 y 5: createFolder hace bypass de callers, pero es bloqueado en booting y failed', async () => {
    appJotaiStore.set(bootStateAtom, 'booting');
    await checkBoardDidNotChange('b-test-123', () => createFolder({ repo, excalidrawAPI, parentFolderId: 'f-test-123', sceneX: 0, sceneY: 0 }));

    appJotaiStore.set(bootStateAtom, 'failed');
    await checkBoardDidNotChange('b-test-123', () => createFolder({ repo, excalidrawAPI, parentFolderId: 'f-test-123', sceneX: 0, sceneY: 0 }));
  });

  // TEST 6
  it('Test 6: createFolder funciona en ready', async () => {
    appJotaiStore.set(bootStateAtom, 'ready');
    
    // Necesita un graph base real para funcionar
    await repo.save({ schemaVersion: 1, rootFolderId: 'f-test-123', lastOpenBoardId: 'b-test-123', boards: { 'b-test-123': { id: 'b-test-123', name: 'root', rootFolderId: 'f-test-123', createdAt: 0, updatedAt: 0 } }, folders: { 'f-test-123': { id: 'f-test-123', name: 'root', parentId: null, boardId: 'b-test-123', createdAt: 0, updatedAt: 0 } }, pointers: {} } as any);
    await repo.saveBoard({ schemaVersion: 1, boardId: 'b-test-123', name: 'root', elements: [], files: {}, viewport: null, updatedAt: 0 });

    const result = await createFolder({ repo, excalidrawAPI, parentFolderId: 'f-test-123', name: 'Nueva', sceneX: 0, sceneY: 0 });
    expect(result.ok).toBe(true);

    // Confirmar escritura real
    const graph = await repo.load();
    expect(Object.keys(graph?.folders || {}).length).toBe(2);
  });

  // TEST 7
  it('Test 7: Navegacion no revive un boot fallido', async () => {
    appJotaiStore.set(bootStateAtom, 'failed');
    
    // La navegacion falla porque el guard bloquea openFolderInternal
    await expect(openFolder({ repo, excalidrawAPI, folderId: 'f-any' })).rejects.toThrow('Board system is not ready');
    
    // Y el estado se debe mantener en failed (ya que openFolderInternal no debio ejecutar setReady)
    expect(appJotaiStore.get(bootStateAtom)).toBe('failed');
  });
});

