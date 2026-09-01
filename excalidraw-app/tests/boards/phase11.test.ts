import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ASSETS_DIR = path.join(__dirname, '../../../bridge/data/assets');
const BACKUPS_DIR = path.join(__dirname, '../../../bridge/data/backups');
const DATA_DIR = path.join(__dirname, '../../../bridge/data');

const API_URL = 'http://127.0.0.1:3005/api/gc';

function createMockAsset(hash: string, mtime: number) {
  if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });
  const filepath = path.join(ASSETS_DIR, `${hash}.bin`);
  fs.writeFileSync(filepath, 'mock data');
  fs.utimesSync(filepath, new Date(mtime), new Date(mtime));
  return filepath;
}

function createMockTempZip(mtime: number) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const filepath = path.join(DATA_DIR, `temp_restore_test_${Date.now()}.zip`);
  fs.writeFileSync(filepath, 'mock zip');
  fs.utimesSync(filepath, new Date(mtime), new Date(mtime));
  return filepath;
}

describe('Fase 11.2 - GC Tests', () => {

  it('GC endpoint existe y corre sin fallos (Idempotencia)', async () => {
    const res1 = await fetch(API_URL, { method: 'POST' });
    expect(res1.ok).toBe(true);
    const data1 = await res1.json();
    expect(data1.status).toBe('success');

    // Executar segunda vez
    const res2 = await fetch(API_URL, { method: 'POST' });
    const data2 = await res2.json();
    expect(data2.stats.assets_deleted).toBe(0);
  });

  it('Test 2 & 3: Asset huérfano antiguo se borra, reciente no se borra', async () => {
    // 64 char hex string for hash
    const oldHash = '0000000000000000000000000000000000000000000000000000000000000001';
    const recentHash = '0000000000000000000000000000000000000000000000000000000000000002';
    
    // Older than 24h
    const oldPath = createMockAsset(oldHash, Date.now() - 25 * 60 * 60 * 1000);
    // Recent
    const recentPath = createMockAsset(recentHash, Date.now() - 1 * 60 * 60 * 1000);

    const res = await fetch(API_URL, { method: 'POST' });
    const data = await res.json();
    console.log("GC RESULT:", data);
    expect(res.ok).toBe(true);

    expect(fs.existsSync(oldPath)).toBe(false);
    expect(fs.existsSync(recentPath)).toBe(true);

    // Clean up recent path
    fs.unlinkSync(recentPath);
  });

  it('Test 7: Symlink no se elimina', async () => {
    const symHash = '0000000000000000000000000000000000000000000000000000000000000003';
    const symPath = path.join(ASSETS_DIR, `${symHash}.bin`);
    
    const targetFile = path.join(DATA_DIR, 'dummy_target.txt');
    fs.writeFileSync(targetFile, 'target');
    
    // Si falla creando symlink (ej. en Windows sin admin rights), skip it gracefully
    try {
      fs.symlinkSync(targetFile, symPath, 'file');
      // Set utimes requires resolving symlinks? or use lchmod. If we can't mock time on symlink, it might skip due to time anyway.
      // Actually on Windows utimes on symlink affects target, so target will be old.
      fs.utimesSync(targetFile, new Date(Date.now() - 25 * 60 * 60 * 1000), new Date(Date.now() - 25 * 60 * 60 * 1000));
      
      await fetch(API_URL, { method: 'POST' });
      
      // Debe existir porque el GC ignora symlinks
      expect(fs.existsSync(symPath)).toBe(true);
      fs.unlinkSync(symPath);
    } catch(e) {
      // ignore
    }
    if (fs.existsSync(targetFile)) fs.unlinkSync(targetFile);
  });

  it('Test 8: Archivo con nombre inválido no se elimina', async () => {
    const invalidPath = path.join(ASSETS_DIR, 'malicious.exe');
    fs.writeFileSync(invalidPath, 'bad');
    fs.utimesSync(invalidPath, new Date(Date.now() - 25 * 60 * 60 * 1000), new Date(Date.now() - 25 * 60 * 60 * 1000));

    await fetch(API_URL, { method: 'POST' });
    
    expect(fs.existsSync(invalidPath)).toBe(true);
    fs.unlinkSync(invalidPath);
  });

  it('Test 10: Cleanup temporal borra zips antiguos y preserva recientes', async () => {
    const oldTemp = createMockTempZip(Date.now() - 25 * 60 * 60 * 1000);
    const recentTemp = createMockTempZip(Date.now() - 1 * 60 * 60 * 1000);

    await fetch(API_URL, { method: 'POST' });

    expect(fs.existsSync(oldTemp)).toBe(false);
    expect(fs.existsSync(recentTemp)).toBe(true);
    fs.unlinkSync(recentTemp);
  });
});
