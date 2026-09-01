import fs from "fs";

async function run() {
  const BRIDGE_URL = "http://127.0.0.1:3005";
  const boardId = `TEST_BOARD_DATA_${Date.now()}`;
  const boardData = {
    schemaVersion: 1,
    boardId,
    elements: [{ id: "e1", type: "rectangle", x: 10, y: 20 }],
    files: {
      "file_test": { mimeType: "image/png", id: "file_test", dataURL: "data:image/png;base64,iVBORw0K", created: Date.now() }
    },
    viewport: { scrollX: 100, scrollY: 200, zoom: { value: 1.5 } },
    name: "My Complete Board",
    appState: { viewBackgroundColor: "#ff0000", theme: "dark" },
    updatedAt: Date.now()
  };

  await fetch(`${BRIDGE_URL}/api/boards/${boardId}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(boardData)
  });

  const getRes = await fetch(`${BRIDGE_URL}/api/boards/${boardId}`);
  const loaded = await getRes.json();
  
  console.log("Original elements:", JSON.stringify(boardData.elements));
  console.log("Loaded elements:", JSON.stringify(loaded.elements));
  console.log("Original name:", boardData.name);
  console.log("Loaded name:", loaded.name);
  console.log("Original appState:", JSON.stringify(boardData.appState));
  console.log("Loaded appState:", JSON.stringify(loaded.appState));
  console.log("Original viewport:", JSON.stringify(boardData.viewport));
  console.log("Loaded viewport:", JSON.stringify(loaded.viewport));
  console.log("Original updatedAt:", boardData.updatedAt);
  console.log("Loaded updatedAt:", loaded.updatedAt);
}
run();
