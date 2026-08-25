const b64 = "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPsOhw6nDrcOzw7o8L3N2Zz4=";
const byteString = atob(b64);
const ab = new ArrayBuffer(byteString.length);
const ia = new Uint8Array(ab);
for (let i = 0; i < byteString.length; i++) {
  ia[i] = byteString.charCodeAt(i);
}
const decoded = new TextDecoder("utf-8").decode(ab);
console.log(decoded);
