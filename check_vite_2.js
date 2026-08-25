const http = require("http");
http.get("http://localhost:3001/excalidraw-app/boards/host/materialize.ts", (res) => {
  let data = "";
  res.on("data", (chunk) => { data += chunk; });
  res.on("end", () => {
    console.log(data.substring(0, 1000));
  });
});
