import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PostgresBoardRepository } from '../../boards/repository/PostgresBoardRepository';
import { initializeBoardSystem } from '../../boards/host/boardService';
import { createStore, clear, set } from 'idb-keyval';
import 'fake-indexeddb/auto';
import fs from 'fs';
import path from 'path';
const BACKUPS_DIR = path.resolve(__dirname, '../../../bridge/data/backups');
const ASSETS_DIR = path.resolve(__dirname, '../../../bridge/data/assets');

describe('Fase 9 - Export / Backup', () => {
  let repo: PostgresBoardRepository;

  beforeEach(async () => {
    window.localStorage.clear();
    const store = createStore('files-db', 'files-store');
    const myClear: any = clear;
    await myClear(store);
    
    // Limpiar BD y Assets para el test
    await fetch('http://127.0.0.1:3005/api/debug/reset', { method: 'POST' });
    if (fs.existsSync(BACKUPS_DIR)) fs.rmSync(BACKUPS_DIR, { recursive: true, force: true });
    if (fs.existsSync(ASSETS_DIR)) fs.rmSync(ASSETS_DIR, { recursive: true, force: true });
    
    repo = new PostgresBoardRepository();
  });

  afterEach(async () => {
    window.localStorage.clear();
  });

  it('1. Exportación de un workspace con boards y assets (deduplicados)', async () => {
    // 1. Inicializar (vacío)
    const boot1 = await initializeBoardSystem(repo);
    
    // 2. Insertar legacy que contenga dos assets repetidos y uno distinto
    const dataURL1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='; // Pixel 1
    const dataURL2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+BnwAFzADw/Z38HQAAAABJRU5ErkJggg=='; // Pixel 2
    
    window.localStorage.setItem('excalidraw', JSON.stringify([
      { id: 'elem1', type: 'rectangle', fileId: 'fileA' },
      { id: 'elem2', type: 'rectangle', fileId: 'fileB' }, // File B equals File A physical hash
      { id: 'elem3', type: 'rectangle', fileId: 'fileC' }
    ]));
    
    const store = createStore('files-db', 'files-store');
    await set('fileA', { id: 'fileA', dataURL: dataURL1, mimeType: 'image/png', created: Date.now() }, store);
    await set('fileB', { id: 'fileB', dataURL: dataURL1, mimeType: 'image/png', created: Date.now() }, store);
    await set('fileC', { id: 'fileC', dataURL: dataURL2, mimeType: 'image/png', created: Date.now() }, store);
    
    // Forzar guardado legacy para crear assets físicos y DB
    await initializeBoardSystem(repo);
    
    // Generar backup
    const res = await fetch('http://127.0.0.1:3005/api/backup', { method: 'POST' });
    expect(res.ok).toBe(true);
    const result = await res.json();
    
    expect(result.ok).toBe(true);
    const backupFile = path.join(BACKUPS_DIR, result.filename);
    expect(fs.existsSync(backupFile)).toBe(true);
    
    // Como File A y File B comparten DataURL, en FS habrá solo 2 archivos (deduplicación)
    const files = fs.readdirSync(ASSETS_DIR);
    expect(files.length).toBe(2);
  });

  it('2. Backup falla si el asset físico no existe o está corrupto', async () => {
    // 1. Inicializar y crear asset
    window.localStorage.setItem('excalidraw', JSON.stringify([{ id: 'elem', fileId: 'fileX' }]));
    const store = createStore('files-db', 'files-store');
    await set('fileX', { id: 'fileX', dataURL: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', mimeType: 'image/png', created: Date.now() }, store);
    
    await initializeBoardSystem(repo);
    
    // Corromper o eliminar un asset de FS manualmente
    const files = fs.readdirSync(ASSETS_DIR);
    fs.rmSync(path.join(ASSETS_DIR, files[0]));
    
    // Generar backup
    const res = await fetch('http://127.0.0.1:3005/api/backup', { method: 'POST' });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(500);
    
    // Verificar que no quedó archivo temporal (el cleanup se hizo)
    const backups = fs.existsSync(BACKUPS_DIR) ? fs.readdirSync(BACKUPS_DIR) : [];
    expect(backups.length).toBe(0);
  });
});
