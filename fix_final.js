const fs = require("fs");
const path = require("path");

const testPath = path.join(process.cwd(), "excalidraw-app", "tests", "boards", "folderService.test.ts");
let content = fs.readFileSync(testPath, "utf-8");

// Fix mockApi to include EVERYTHING needed
const newMock = `function mockApi() {
  const calls: { sceneElements?: ExcalidrawElement[]; addFiles?: unknown[] }[] = [];
  const api = {
    updateScene: vi.fn((opts: { elements?: ExcalidrawElement[] }) => {
      calls.push({ sceneElements: opts.elements });
    }),
    addFiles: vi.fn((files: unknown[]) => {
      calls[calls.length - 1].addFiles = files;
    }),
    getAppState: vi.fn(() => ({})),
    getSceneElementsIncludingDeleted: vi.fn(() => []),
    getFiles: vi.fn(() => ({})),
    getName: vi.fn(() => "test"),
    _calls: calls,
  };
  return api as unknown as ExcalidrawImperativeAPI & { 
    _calls: typeof calls; 
    getSceneElementsIncludingDeleted: any; 
    getFiles: any; 
    getName: any; 
    updateScene: any;
  };
}`;

// We will replace the whole function using regex
content = content.replace(/function mockApi\(\) \{[\s\S]*?return api[\s\S]*?\}/m, newMock);

// Fix the "NEVER" assertion
content = content.replace(/expect\(updateCall\.captureUpdate\)\.toBe\(0\); \/\/ NEVER/g, `expect(updateCall.captureUpdate).toBe("NEVER"); // NEVER as string enum`);

// Fix the type assertions for mockReturnValue
content = content.replace(/excalidrawAPI\.getSceneElementsIncludingDeleted = vi.fn\(\)\.mockReturnValue/g, 'excalidrawAPI.getSceneElementsIncludingDeleted.mockReturnValue');

fs.writeFileSync(testPath, content, "utf-8");
console.log("Fixed folderService.test.ts");

