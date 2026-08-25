const http = require("http");
http.get("http://localhost:3001/excalidraw-app/boards/host/materialize.ts?import", (res) => {
  let data = "";
  res.on("data", (chunk) => { data += chunk; });
  res.on("end", () => {
    if (data.includes("utf8ToBase64")) {
      console.log("VITE_BUNDLE: HAS_NEW_CODE");
    } else {
      console.log("VITE_BUNDLE: OLD_CODE");
    }
  });
});
