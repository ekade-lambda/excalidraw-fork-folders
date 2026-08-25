import os

path = 'excalidraw-app/tests/boards/materialize.test.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add utf8ToBase64 import
content = content.replace(
    'findFolderVisual,\n} from "../../boards/host/materialize";',
    'findFolderVisual,\n  utf8ToBase64,\n} from "../../boards/host/materialize";'
)

old_test = """  it("buildFolderImageDataUrl genera un dataURL SVG usable", () => {
    const url = buildFolderImageDataUrl();
    expect(url.startsWith("data:image/svg+xml")).toBe(true);
    // El body estǭ URL-encoded; al decodificarlo contiene <svg.
    const decoded = decodeURIComponent(
      url.replace(/^data:image\\/svg\\+xml;charset=utf-8,?/i, ""),
    );
    expect(decoded).toContain("<svg");
  });"""

new_test = """  it("buildFolderImageDataUrl genera un dataURL SVG base64 compatible con Core", () => {
    const url = buildFolderImageDataUrl();
    expect(url.startsWith("data:image/svg+xml;base64,")).toBe(true);
    // Extraer base64
    const base64 = url.slice(url.indexOf(",") + 1);
    
    // Core (App.tsx -> addMissingFiles -> dataURLToString -> atob) usará atob.
    // Esto demuestra que btoa/atob no lanzan InvalidCharacterError
    const byteString = window.atob(base64);
    
    // Y luego el core (byteStringToString) lo convierte a bytes y lo decodifica como utf-8
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const decoded = new TextDecoder("utf-8").decode(ab);
    expect(decoded).toContain("<svg");
    expect(decoded).toContain("fill=");
  });

  it("utf8ToBase64 y atob (Core) pueden hacer round-trip seguro con Unicode (acentos, emojis)", () => {
    const originalSvg = `<svg>ñáéíóú 📁 ✨</svg>`;
    const base64 = utf8ToBase64(originalSvg);
    
    // Core behavior
    const byteString = window.atob(base64);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const recoveredSvg = new TextDecoder("utf-8").decode(ab);
    
    expect(recoveredSvg).toBe(originalSvg);
  });"""

content = content.replace(old_test, new_test)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print("Updated tests")
