const svg = `<svg xmlns="http://www.w3.org/2000/svg">áéíóú</svg>`;
const bytes = new TextEncoder().encode(svg);
let bstring = "";
for (const byte of bytes) {
  bstring += String.fromCharCode(byte);
}
const b64 = btoa(bstring);
console.log(b64);
