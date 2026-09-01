"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var child_process_1 = require("child_process");
var crypto_1 = __importDefault(require("crypto"));
var fs_1 = __importDefault(require("fs"));
var path_1 = __importDefault(require("path"));
var BRIDGE_URL = "http://127.0.0.1:3005";
function runQuery(sql) {
    var output = (0, child_process_1.execSync)("docker exec infinite-notes-postgres psql \"postgresql://infinite:infinite@127.0.0.1:5432/infinite_notes\" -t -c \"".concat(sql, "\""), { encoding: 'utf-8' });
    return output.trim();
}
function run() {
    return __awaiter(this, void 0, void 0, function () {
        var assetsDir, content, decoded, hash, reqs, i, boardData, files, pgAssets, lazyBoardId, lazyContent, filesJson, escapedJson, resLazyGet, lazyDbCheck, isStripped, resLazyGet2, testBoards;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    console.log("=== INICIANDO AUDITORIA FASE 6 ===");
                    assetsDir = path_1.default.resolve(__dirname, "../bridge/data/assets");
                    // 1. CONCURRENCY TEST
                    console.log("\n-> Test Concurrencia");
                    content = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
                    decoded = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
                    hash = crypto_1.default.createHash("sha256").update(decoded).digest("hex");
                    console.log("Expected SHA-256:", hash);
                    reqs = [];
                    for (i = 0; i < 5; i++) {
                        boardData = {
                            schemaVersion: 1,
                            boardId: "TEST_CONC_".concat(i, "_").concat(Date.now()),
                            elements: [],
                            files: (_a = {},
                                _a["file_conc_".concat(i)] = { mimeType: "image/png", id: "file_conc_".concat(i), dataURL: content, created: Date.now() },
                                _a),
                            name: "Conc Test",
                            updatedAt: Date.now(),
                        };
                        reqs.push(fetch("".concat(BRIDGE_URL, "/api/boards/").concat(boardData.boardId), {
                            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(boardData)
                        }));
                    }
                    return [4 /*yield*/, Promise.all(reqs)];
                case 1:
                    _b.sent();
                    files = fs_1.default.readdirSync(assetsDir).filter(function (f) { return f === "".concat(hash, ".bin"); });
                    console.log("Archivos creados para el hash: ".concat(files.length, " (esperado: 1)"));
                    pgAssets = runQuery("SELECT count(*) FROM excalidraw.assets WHERE hash = '".concat(hash, "'"));
                    console.log("Registros en DB para el hash: ".concat(pgAssets, " (esperado: 5)"));
                    // 2. LAZY MIGRATION TEST
                    console.log("\n-> Test Lazy Migration");
                    lazyBoardId = "TEST_LAZY_".concat(Date.now());
                    lazyContent = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
                    filesJson = JSON.stringify({
                        "file_lazy": { mimeType: "image/png", id: "file_lazy", dataURL: lazyContent, created: Date.now() }
                    });
                    escapedJson = filesJson.replace(/"/g, '\\"');
                    runQuery("INSERT INTO excalidraw.boards (id, elements, files, schema_version, updated_at) VALUES ('".concat(lazyBoardId, "', '[]', '").concat(escapedJson, "', 1, NOW())"));
                    console.log("Legacy board insertado directo en DB.");
                    return [4 /*yield*/, fetch("".concat(BRIDGE_URL, "/api/boards/").concat(lazyBoardId))];
                case 2: return [4 /*yield*/, (_b.sent()).json()];
                case 3:
                    resLazyGet = _b.sent();
                    console.log("GET dataURL matches legacy:", resLazyGet.files["file_lazy"].dataURL === lazyContent);
                    // POST (Save to trigger extraction)
                    return [4 /*yield*/, fetch("".concat(BRIDGE_URL, "/api/boards/").concat(lazyBoardId), {
                            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(resLazyGet)
                        })];
                case 4:
                    // POST (Save to trigger extraction)
                    _b.sent();
                    console.log("Board legacy re-guardado vía API.");
                    lazyDbCheck = runQuery("SELECT files FROM excalidraw.boards WHERE id = '".concat(lazyBoardId, "'"));
                    isStripped = !lazyDbCheck.includes("dataURL");
                    console.log("DB dataURL stripped:", isStripped);
                    return [4 /*yield*/, fetch("".concat(BRIDGE_URL, "/api/boards/").concat(lazyBoardId))];
                case 5: return [4 /*yield*/, (_b.sent()).json()];
                case 6:
                    resLazyGet2 = _b.sent();
                    console.log("GET final dataURL recovered:", resLazyGet2.files["file_lazy"].dataURL === lazyContent);
                    console.log("\n-> Test Cleanup Indentification");
                    testBoards = runQuery("SELECT id FROM excalidraw.boards WHERE id LIKE 'TEST_%'");
                    console.log("Test Boards in DB:\\n" + testBoards);
                    process.exit(0);
                    return [2 /*return*/];
            }
        });
    });
}
run().catch(console.error);
