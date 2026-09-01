import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PostgresBoardRepository } from '../../boards/repository/PostgresBoardRepository';
import { initializeBoardSystem } from '../../boards/host/boardService';
import { createStore, clear, set, get } from 'idb-keyval';
import 'fake-indexeddb/auto'; // Proveedor real para el test

describe('Fase 8.1 - Migración Segura E2E (Sin Mocks de DB)', () => {
  let repo: PostgresBoardRepository;

  beforeEach(async () => {
    window.localStorage.clear();
    const store = createStore('files-db', 'files-store');
    const myClear: any = clear;
    await myClear(store);

    repo = new PostgresBoardRepository();
  });

  afterEach(async () => {
    window.localStorage.clear();
    const store = createStore('files-db', 'files-store');
    const myClear: any = clear;
    await myClear(store);
  });

  it('1. Migración Legacy concurriendo con BD existente (CAS + IDB)', async () => {
    // 1. Crear un Graph existente real en PostgreSQL
    // Hacemos que initializeBoardSystem cree el root inicial vacío
    const rootBoot = await initializeBoardSystem(repo);
    expect(rootBoot.graph).toBeDefined();

    // 2. Crear datos legacy en LocalStorage e IndexedDB
    window.localStorage.setItem('excalidraw', JSON.stringify([
      { id: 'elem-legacy-1', type: 'rectangle', x: 10, y: 10, fileId: 'file-test-legacy' }
    ]));

    // Generar un base64 de > 2MB para probar el límite de Axum
    const heavyBase64 = Buffer.alloc(2.5 * 1024 * 1024, 'A').toString('base64');
    const dataURL = `data:image/png;base64,${heavyBase64}`;

    const store = createStore('files-db', 'files-store');
    await set('file-test-legacy', {
      id: 'file-test-legacy',
      dataURL: dataURL,
      mimeType: 'image/png',
      created: Date.now()
    }, store);

    // Confirmar que legacy existe
    expect(window.localStorage.getItem('excalidraw')).not.toBeNull();
    const idbData = await get('file-test-legacy', store);
    expect(idbData).toBeDefined();

    // 3. Inicializar de nuevo (debe detectar legacy y añadirlo al graph existente)
    const boot2 = await initializeBoardSystem(repo);
    expect(boot2.migrated).toBe(true);

    // 4. Verificar limpieza del Web Storage
    expect(window.localStorage.getItem('excalidraw')).toBeNull();
    const idbDataAfter = await get('file-test-legacy', store);
    expect(idbDataAfter).toBeUndefined();

    // 5. Verificar Round-Trip (Legacy -> DB -> Bridge -> CAS)
    const loadedBoard = await repo.loadBoard(boot2.currentBoardId);
    expect(loadedBoard).not.toBeNull();
    expect(loadedBoard!.elements[0].id).toBe('elem-legacy-1');
    expect(loadedBoard!.files['file-test-legacy']).toBeDefined();
    expect(loadedBoard!.files['file-test-legacy'].dataURL.length).toBeGreaterThan(2 * 1024 * 1024);
  });

  it('2. Tolerancia a fallos: Backend error NO limpia el legacy storage', async () => {
    window.localStorage.setItem('excalidraw', JSON.stringify([
      { id: 'elem-legacy-2', type: 'rectangle', x: 10, y: 10 }
    ]));

    const originalSave = repo.saveBoard.bind(repo);
    repo.saveBoard = async () => { throw new Error('Simulated HTTP 500'); };

    try {
      await initializeBoardSystem(repo);
    } catch (e) {}

    repo.saveBoard = originalSave;

    // Verificar que Web Storage permanece intacto
    expect(window.localStorage.getItem('excalidraw')).not.toBeNull();
  });
});
