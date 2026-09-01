import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PostgresBoardRepository } from '../../boards/repository/PostgresBoardRepository';
import { initializeBoardSystem } from '../../boards/host/boardService';
import { createStore, clear, set } from 'idb-keyval';
import 'fake-indexeddb/auto';
import fs from 'fs';
import path from 'path';

const BACKUPS_DIR = path.resolve(__dirname, '../../../bridge/data/backups');
const ASSETS_DIR = path.resolve(__dirname, '../../../bridge/data/assets');

describe('Fase 10 - Restore', () => {
  let repo: PostgresBoardRepository;

  beforeEach(async () => {
    window.localStorage.clear();
    const store = createStore('files-db', 'files-store');
    const myClear: any = clear;
    await myClear(store);
    
    await fetch('http://127.0.0.1:3005/api/debug/reset', { method: 'POST' });
    if (fs.existsSync(BACKUPS_DIR)) fs.rmSync(BACKUPS_DIR, { recursive: true, force: true });
    if (fs.existsSync(ASSETS_DIR)) fs.rmSync(ASSETS_DIR, { recursive: true, force: true });
    
    repo = new PostgresBoardRepository();
  });

  afterEach(async () => {
    window.localStorage.clear();
  });

  it('1. Backup de Seguridad y Restore Exitoso', async () => {
    // 1. Crear workspace con datos A
    window.localStorage.setItem('excalidraw', JSON.stringify([
      { id: 'boardA', type: 'rectangle', fileId: 'fileA' }
    ]));
    const store = createStore('files-db', 'files-store');
    await set('fileA', { id: 'fileA', dataURL: 'data:image/png;base64,A', mimeType: 'image/png', created: 1 }, store);
    await initializeBoardSystem(repo);
    
    // Generar Backup de datos A
    const resBackup = await fetch('http://127.0.0.1:3005/api/backup', { method: 'POST' });
    const backupResult = await resBackup.json();
    const backupZipPath = path.join(BACKUPS_DIR, backupResult.filename);
    const backupZipBytes = fs.readFileSync(backupZipPath);
    
    // 2. Sobrescribir workspace actual con datos B
    await fetch('http://127.0.0.1:3005/api/debug/reset', { method: 'POST' });
    window.localStorage.setItem('excalidraw', JSON.stringify([
      { id: 'boardB', type: 'ellipse' }
    ]));
    await initializeBoardSystem(repo);
    
    // 3. Ejecutar Restore usando el ZIP de A
    const resRestore = await fetch('http://127.0.0.1:3005/api/restore', {
      method: 'POST',
      body: backupZipBytes as unknown as BodyInit
    });
    const restoreResult = await resRestore.json();
    expect(resRestore.ok).toBe(true);
    expect(restoreResult.ok).toBe(true);
    
    // Verificar que se creó el safety backup
    expect(restoreResult.safety_backup).toBeDefined();
    expect(fs.existsSync(path.join(BACKUPS_DIR, restoreResult.safety_backup))).toBe(true);
    
    // 4. Verificar que se cargó el workspace A
    const boardGraph = await repo.load();
    expect(boardGraph).not.toBeNull();
    const parsed = boardGraph as any;
    expect(parsed.elements[0].id).toBe('boardA');
    expect(parsed.files['fileA']).toBeDefined();
  });

  it('2. Rechaza archivos ZIP corruptos / aleatorios y protege la DB', async () => {
    const randomBytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6]);
    const res = await fetch('http://127.0.0.1:3005/api/restore', {
      method: 'POST',
      body: randomBytes as unknown as BodyInit
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400); // BAD_REQUEST
  });

  it('3. Fase 10.5: Rechaza schema_migrations incompatible (futuro)', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify({ version: "1.0" }));
    zip.file("database.json", JSON.stringify({
      schema_migrations: [{ version: 99999, applied_at: "2026-09-01" }],
      assets: []
    }));
    const content = await zip.generateAsync({ type: "nodebuffer" });
    const res = await fetch('http://127.0.0.1:3005/api/restore', { method: 'POST', body: content as unknown as BodyInit });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });

  it('4. Fase 10.5: Rechaza schema_migrations incompatible (pasado/downgrade)', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify({ version: "1.0" }));
    zip.file("database.json", JSON.stringify({
      schema_migrations: [{ version: 0, applied_at: "2026-09-01" }],
      assets: []
    }));
    const content = await zip.generateAsync({ type: "nodebuffer" });
    const res = await fetch('http://127.0.0.1:3005/api/restore', { method: 'POST', body: content as unknown as BodyInit });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });

  it('5. Fase 10.5: Limita descompresion (Zip Bomb de binario)', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify({ version: "1.0" }));
    zip.file("database.json", JSON.stringify({
      schema_migrations: [{ version: 2, applied_at: "2026-09-01" }], // matching current DB version
      assets: [{ hash: "deadbeef", size_bytes: 60 * 1024 * 1024, relative_path: "fake" }]
    }));
    const content = await zip.generateAsync({ type: "nodebuffer" });
    const res = await fetch('http://127.0.0.1:3005/api/restore', { method: 'POST', body: content as unknown as BodyInit });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });

  it('6. Fase 10.5: Limita descompresion (Zip Bomb de database.json)', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify({ version: "1.0" }));
    
    // Create a database.json string larger than 100MB by repeating spaces
    // Since this is JS, creating 105MB string could be heavy but ok for test
    const giantDb = '{"schema_migrations":[{"version": 2}],"assets":[]}' + ' '.repeat(105 * 1024 * 1024);
    zip.file("database.json", giantDb);
    
    const content = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } });
    
    const res = await fetch('http://127.0.0.1:3005/api/restore', { method: 'POST', body: content as unknown as BodyInit });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });
});
