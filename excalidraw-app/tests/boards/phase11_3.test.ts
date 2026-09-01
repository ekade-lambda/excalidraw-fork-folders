import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';

const BACKUPS_DIR = path.join(__dirname, '../../../bridge/data/backups');
const API_URL = 'http://127.0.0.1:3005/api/backup-retention';

function formatDateForBackup(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}_${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}

async function createZipFile(filepath: string, isValid: boolean) {
    if (isValid) {
        const zip = new JSZip();
        zip.file("manifest.json", '{"version": "1.0"}');
        zip.file("database.json", '{"boards": []}');
        const content = await zip.generateAsync({ type: 'nodebuffer' });
        fs.writeFileSync(filepath, content);
    } else {
        fs.writeFileSync(filepath, 'corrupt zip data');
    }
}

async function mockBackup(daysAgo: number, secondsOffset: number = 0, isValid: boolean = true) {
    if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    
    const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000 + secondsOffset * 1000);
    const dateStr = formatDateForBackup(d);
    
    // Some timestamps could overlap if we generate them fast, so we add secondsOffset
    const filepath = path.join(BACKUPS_DIR, `backup_excalidraw_${dateStr}.zip`);
    await createZipFile(filepath, isValid);
    return filepath;
}

function mockTempBackup(daysAgo: number) {
    if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    const filepath = path.join(BACKUPS_DIR, `temp_backup_test_${Date.now()}_${daysAgo}.zip`);
    fs.writeFileSync(filepath, 'mock temp data');
    
    const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    fs.utimesSync(filepath, d, d); // use mtime for temp backups
    return filepath;
}

async function cleanBackupsDir() {
    if (fs.existsSync(BACKUPS_DIR)) {
        const files = fs.readdirSync(BACKUPS_DIR);
        for (const file of files) {
            fs.unlinkSync(path.join(BACKUPS_DIR, file));
        }
    }
}

describe('Fase 11.3 - Backup Retention Tests', () => {

    beforeAll(async () => {
        await cleanBackupsDir();
    });

    afterAll(async () => {
        await cleanBackupsDir();
    });

    it('Test 1: Respeta el umbral temporal (<7 dias) aunque existan más de 5', async () => {
        await cleanBackupsDir();
        // Create 6 valid backups, all 1 day ago (rapid fire equivalent)
        const paths = [];
        for(let i = 0; i < 6; i++) {
            paths.push(await mockBackup(1, i)); // 1 day ago
        }

        const res = await fetch(API_URL, { method: 'POST' });
        const data = await res.json();
        
        expect(res.ok).toBe(true);
        expect(data.stats.valid_backups_found).toBe(6);
        expect(data.stats.final_backups_deleted).toBe(0); // None deleted because < 7 days
    });

    it('Test 2: Elimina backup >7 dias solo si hay quorum de 5', async () => {
        await cleanBackupsDir();
        const oldBackup = await mockBackup(30); // 30 days ago

        // 1 valid older than 7 days, but 0 recent.
        const res1 = await fetch(API_URL, { method: 'POST' });
        const data1 = await res1.json();
        expect(data1.stats.valid_backups_found).toBe(1);
        expect(data1.stats.final_backups_deleted).toBe(0); // Quorum not reached!
        expect(fs.existsSync(oldBackup)).toBe(true);

        // Create 5 more valid backups
        const recentBackups = [];
        for(let i=0; i<5; i++) {
            recentBackups.push(await mockBackup(1, i));
        }

        const res2 = await fetch(API_URL, { method: 'POST' });
        const data2 = await res2.json();
        expect(data2.stats.valid_backups_found).toBe(6);
        expect(data2.stats.final_backups_deleted).toBe(1); // Old backup deleted!
        expect(fs.existsSync(oldBackup)).toBe(false);
    });

    it('Test 3: Archivos corruptos no cuentan para el quorum', async () => {
        await cleanBackupsDir();
        const oldBackup = await mockBackup(30, 0, true); // Valid old backup
        
        // Create 100 corrupt recent backups
        for(let i=0; i<100; i++) {
            await mockBackup(1, i, false); // Corrupt
        }

        const res = await fetch(API_URL, { method: 'POST' });
        const data = await res.json();
        
        expect(data.stats.valid_backups_found).toBe(1);
        expect(data.stats.final_backups_deleted).toBe(0); // Should not delete oldBackup
        expect(fs.existsSync(oldBackup)).toBe(true);
    });

    it('Test 4: temp_backup_ > 24h es eliminado', async () => {
        await cleanBackupsDir();
        const oldTemp = mockTempBackup(2); // 2 days ago
        const recentTemp = mockTempBackup(0.5); // 12 hours ago

        const res = await fetch(API_URL, { method: 'POST' });
        const data = await res.json();

        expect(data.stats.temp_backups_deleted).toBe(1);
        expect(fs.existsSync(oldTemp)).toBe(false);
        expect(fs.existsSync(recentTemp)).toBe(true);
    });

    it('Test 5: Archivos desconocidos o symlinks se ignoran', async () => {
        await cleanBackupsDir();
        const dummyPath = path.join(BACKUPS_DIR, 'database.json');
        fs.writeFileSync(dummyPath, '{}');

        const symPath = path.join(BACKUPS_DIR, 'backup_excalidraw_20000101_000000.zip');
        try {
            fs.symlinkSync(dummyPath, symPath, 'file');
        } catch(e) {} // ignore on windows without admin

        const res = await fetch(API_URL, { method: 'POST' });
        const data = await res.json();

        expect(data.stats.ignored_files).toBeGreaterThan(0);
        expect(fs.existsSync(dummyPath)).toBe(true);
        if (fs.existsSync(symPath)) fs.unlinkSync(symPath);
        fs.unlinkSync(dummyPath);
    });
});
