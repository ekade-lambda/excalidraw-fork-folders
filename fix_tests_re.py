import os
import re

path = 'excalidraw-app/tests/boards/materialize.test.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

new_test = """  it("buildFolderImageDataUrl genera un dataURL SVG base64 compatible con Core", () => {
    const url = buildFolderImageDataUrl();
    expect(url.startsWith("data:image/svg+xml;base64,")).toBe(true);
    
    const base64 = url.slice(url.indexOf(",") + 1);
    const byteString = window.atob(base64);
    
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const decoded = new TextDecoder("utf-8").decode(ab);
    
    expect(decoded).toContain("<svg");
  });

  it("utf8ToBase64 y atob (Core) pueden hacer round-trip seguro con Unicode (acentos, emojis)", () => {
    const originalSvg = `<svg>ñáéíóú 📁 ✨</svg>`;
    const base64 = utf8ToBase64(originalSvg);
    
    const byteString = window.atob(base64);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const recoveredSvg = new TextDecoder("utf-8").decode(ab);
    
    expect(recoveredSvg).toBe(originalSvg);
  });"""

content = re.sub(r'  it\("buildFolderImageDataUrl genera un dataURL SVG usable".*?\}\);', new_test, content, flags=re.DOTALL)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print("Updated tests via regex")
