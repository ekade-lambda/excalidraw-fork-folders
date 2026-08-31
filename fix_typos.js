const fs = require('fs');
let content = fs.readFileSync('excalidraw-app/App.tsx', 'utf8');

content = content.replace(
  /renameElement\.style\.left = \$\{menuRect\.right\}px;/g,
  'renameElement.style.left = ${menuRect.right}px;'
);
content = content.replace(
  /renameElement\.style\.top = \$\{menuRect\.top\}px;/g,
  'renameElement.style.top = ${menuRect.top}px;'
);
content = content.replace(
  /renameElement\.style\.transform = \none;/g,
  'renameElement.style.transform = 
one;'
);

content = content.replace(
  /linkToFileElement\.style\.left = \$\{menuRect\.right\}px;/g,
  'linkToFileElement.style.left = ${menuRect.right}px;'
);
content = content.replace(
  /linkToFileElement\.style\.top = \$\{menuRect\.top\}px;/g,
  'linkToFileElement.style.top = ${menuRect.top}px;'
);
content = content.replace(
  /linkToFileElement\.style\.transform = \none;/g,
  'linkToFileElement.style.transform = 
one;'
);

fs.writeFileSync('excalidraw-app/App.tsx', content);
