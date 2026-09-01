import { execSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const BRIDGE_URL = "http://127.0.0.1:3005";

function runQuery(sql: string) {
    const output = execSync(`docker exec infinite-notes-postgres psql "postgresql://infinite:infinite@127.0.0.1:5432/infinite_notes" -t -c "${sql}"`, { encoding: 'utf-8' });
    return output.trim();
}

async function run() {
  console.log("=== INICIANDO AUDITORIA FASE 6 ===");
  const assetsDir = path.resolve(__dirname, "../bridge/data/assets");

  // 1. CONCURRENCY TEST
  console.log("\n-> Test Concurrencia");
  const content = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const decoded = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const hash = crypto.createHash("sha256").update(decoded).digest("hex");
  console.log("Expected SHA-256:", hash);

  const reqs = [];
  for (let i = 0; i < 5; i++) {
    const boardData = {
      schemaVersion: 1,
      boardId: `TEST_CONC_${i}_${Date.now()}`,
      elements: [],
      files: {
        [`file_conc_${i}`]: { mimeType: "image/png", id: `file_conc_${i}`, dataURL: content, created: Date.now() },
      },
      name: "Conc Test",
      updatedAt: Date.now(),
    };
    reqs.push(fetch(`${BRIDGE_URL}/api/boards/${boardData.boardId}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(boardData)
    }));
  }
  await Promise.all(reqs);
  
  // Check files on disk
  const files = fs.readdirSync(assetsDir).filter(f => f === `${hash}.bin`);
  console.log(`Archivos creados para el hash: ${files.length} (esperado: 1)`);
  
  const pgAssets = runQuery(`SELECT count(*) FROM excalidraw.assets WHERE hash = '${hash}'`);
  console.log(`Registros en DB para el hash: ${pgAssets} (esperado: 5)`);

  // 2. LAZY MIGRATION TEST
  console.log("\n-> Test Lazy Migration");
  const lazyBoardId = `TEST_LAZY_${Date.now()}`;
  const lazyContent = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="; // needs valid base64!
  
  // Direct insert to mock Phase 5 (needs to escape JSON properly for docker exec)
  const filesJson = JSON.stringify({
    "file_lazy": { mimeType: "image/png", id: "file_lazy", dataURL: lazyContent, created: Date.now() }
  });
  const escapedJson = filesJson.replace(/"/g, '\\"');
  runQuery(`INSERT INTO excalidraw.boards (id, elements, files, schema_version, updated_at) VALUES ('${lazyBoardId}', '[]', '${escapedJson}', 1, NOW())`);
  console.log("Legacy board insertado directo en DB.");

  // GET
  const resLazyGet = await (await fetch(`${BRIDGE_URL}/api/boards/${lazyBoardId}`)).json();
  console.log("GET dataURL matches legacy:", resLazyGet.files["file_lazy"].dataURL === lazyContent);

  // POST (Save to trigger extraction)
  await fetch(`${BRIDGE_URL}/api/boards/${lazyBoardId}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(resLazyGet)
  });
  console.log("Board legacy re-guardado vía API.");

  // Check DB stripped
  const lazyDbCheck = runQuery(`SELECT files FROM excalidraw.boards WHERE id = '${lazyBoardId}'`);
  const isStripped = !lazyDbCheck.includes("dataURL");
  console.log("DB dataURL stripped:", isStripped);

  // GET again
  const resLazyGet2 = await (await fetch(`${BRIDGE_URL}/api/boards/${lazyBoardId}`)).json();
  console.log("GET final dataURL recovered:", resLazyGet2.files["file_lazy"].dataURL === lazyContent);

  console.log("\n-> Test Cleanup Indentification");
  const testBoards = runQuery(`SELECT id FROM excalidraw.boards WHERE id LIKE 'TEST_%'`);
  console.log("Test Boards in DB:\\n" + testBoards);

  process.exit(0);
}
run().catch(console.error);
