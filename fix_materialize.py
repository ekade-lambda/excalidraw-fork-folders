import os

path = 'excalidraw-app/boards/host/materialize.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

helper = """
/**
 * Convierte un string (que puede contener UTF-8) a Base64
 * compatible con la decodificación estricta del Core de Excalidraw.
 */
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bstring = "";
  for (const byte of bytes) {
    bstring += String.fromCharCode(byte);
  }
  return btoa(bstring);
}
"""

old_func = """export function buildFolderImageDataUrl(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90" viewBox="0 0 120 90" fill="none">
  <rect x="4" y="20" width="112" height="66" rx="6" fill="#f1c15d" stroke="#b8860b" stroke-width="3"/>
  <path d="M4 38 L116 38" stroke="#b8860b" stroke-width="3"/>
  <rect x="10" y="26" width="30" height="12" rx="3" fill="#f7d794"/>
  <rect x="48" y="26" width="30" height="12" rx="3" fill="#f7d794"/>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}"""

new_func = """export function buildFolderImageDataUrl(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90" viewBox="0 0 120 90" fill="none">
  <rect x="4" y="20" width="112" height="66" rx="6" fill="#f1c15d" stroke="#b8860b" stroke-width="3"/>
  <path d="M4 38 L116 38" stroke="#b8860b" stroke-width="3"/>
  <rect x="10" y="26" width="30" height="12" rx="3" fill="#f7d794"/>
  <rect x="48" y="26" width="30" height="12" rx="3" fill="#f7d794"/>
</svg>`;
  return `data:image/svg+xml;base64,${utf8ToBase64(svg)}`;
}"""

content = content.replace(old_func, helper + '\n' + new_func)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print("Updated materialize.ts")
