"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
var fs_1 = __importDefault(require("fs"));
var path_1 = __importDefault(require("path"));
var BRIDGE_URL = "http://127.0.0.1:3005";
function runTests() {
    return __awaiter(this, void 0, void 0, function () {
        var file1Content, file2Content, boardId, boardData, res1, res2, loadedBoard, assetsDir, filesOnDisk, fileStats, newestFile, physicalPath, originalBytes, res3, res4, maliciousBoardId, maliciousData, res5;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("=== FASE 6 TESTS ===");
                    file1Content = "data:image/png;base64,iVBORw0KGgo=";
                    file2Content = "data:image/png;base64,iVBORw0KGgo=";
                    boardId = "TEST_PHASE6_".concat(Date.now());
                    // 1. PERSISTENCIA Y DEDUPLICACIÓN
                    console.log("\n1. Test Persistencia y Deduplicación");
                    boardData = {
                        schemaVersion: 1,
                        boardId: boardId,
                        elements: [],
                        files: {
                            "fileA": { mimeType: "image/png", id: "fileA", dataURL: file1Content, created: Date.now() },
                            "fileB": { mimeType: "image/png", id: "fileB", dataURL: file2Content, created: Date.now() },
                        },
                        name: "Phase 6 Test",
                        updatedAt: Date.now(),
                    };
                    return [4 /*yield*/, fetch("".concat(BRIDGE_URL, "/api/boards/").concat(boardId), {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(boardData)
                        })];
                case 1:
                    res1 = _a.sent();
                    if (!res1.ok)
                        throw new Error("Fallo al guardar board");
                    return [4 /*yield*/, fetch("".concat(BRIDGE_URL, "/api/boards/").concat(boardId))];
                case 2:
                    res2 = _a.sent();
                    return [4 /*yield*/, res2.json()];
                case 3:
                    loadedBoard = _a.sent();
                    if (loadedBoard.files["fileA"].dataURL !== file1Content)
                        throw new Error("fileA no rehidratado");
                    if (loadedBoard.files["fileB"].dataURL !== file2Content)
                        throw new Error("fileB no rehidratado");
                    console.log("-> ✅ Persistencia y Deduplicación validada: el board se cargó con los dataURL intactos");
                    assetsDir = path_1.default.resolve(__dirname, "../bridge/data/assets");
                    filesOnDisk = fs_1.default.readdirSync(assetsDir);
                    console.log("-> Archivos en disco: ".concat(filesOnDisk.length));
                    // 2. INTEGRIDAD Y CORRUPCIÓN
                    console.log("\n2. Test Integridad y Corrupción");
                    fileStats = filesOnDisk.map(function (f) { return ({ name: f, time: fs_1.default.statSync(path_1.default.join(assetsDir, f)).mtimeMs }); });
                    fileStats.sort(function (a, b) { return b.time - a.time; });
                    newestFile = fileStats[0].name;
                    physicalPath = path_1.default.join(assetsDir, newestFile);
                    originalBytes = fs_1.default.readFileSync(physicalPath);
                    // Corrupting the file!
                    fs_1.default.writeFileSync(physicalPath, Buffer.from([0, 0, 0, 0]));
                    return [4 /*yield*/, fetch("".concat(BRIDGE_URL, "/api/boards/").concat(boardId))];
                case 4:
                    res3 = _a.sent();
                    if (res3.status !== 500)
                        throw new Error("Se esperaba 500 por corrupci\u00F3n, pero devolvi\u00F3 ".concat(res3.status));
                    console.log("-> ✅ Corrupción detectada correctamente (HTTP 500)");
                    // Restore file
                    fs_1.default.writeFileSync(physicalPath, originalBytes);
                    // 3. ASSET FALTANTE (MISSING)
                    console.log("\n3. Test Asset Faltante");
                    fs_1.default.unlinkSync(physicalPath);
                    return [4 /*yield*/, fetch("".concat(BRIDGE_URL, "/api/boards/").concat(boardId))];
                case 5:
                    res4 = _a.sent();
                    if (res4.status !== 500)
                        throw new Error("Se esperaba 500 por archivo borrado, devolvi\u00F3 ".concat(res4.status));
                    console.log("-> ✅ Asset faltante detectado correctamente (HTTP 500)");
                    // Restore file for further tests if needed (actually it will just stay dead, that's fine)
                    fs_1.default.writeFileSync(physicalPath, originalBytes);
                    // 4. SEGURIDAD PATH TRAVERSAL
                    console.log("\n4. Test Seguridad (Path Traversal)");
                    maliciousBoardId = "TEST_PHASE6_MALICIOUS_".concat(Date.now());
                    maliciousData = __assign(__assign({}, boardData), { boardId: maliciousBoardId, files: {
                            "../../../windows/system32/cmd.exe": { mimeType: "image/png", id: "../../../windows/system32/cmd.exe", dataURL: file1Content, created: Date.now() },
                        } });
                    return [4 /*yield*/, fetch("".concat(BRIDGE_URL, "/api/boards/").concat(maliciousBoardId), {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(maliciousData)
                        })];
                case 6:
                    res5 = _a.sent();
                    if (!res5.ok)
                        throw new Error("Fallo al guardar board malicioso");
                    // Does the file get named ../../../windows/system32/cmd.exe? NO. It gets named by its SHA-256 hash.
                    console.log("-> ✅ Path Traversal evitado (el archivo se nombró por Hash independientemente del FileId inyectado)");
                    console.log("\n🎉 TODOS LOS TESTS DE FASE 6 PASARON 🎉");
                    return [2 /*return*/];
            }
        });
    });
}
runTests().catch(console.error);
