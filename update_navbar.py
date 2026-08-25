import os

path = "excalidraw-app/boards/ui/NavBar.tsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

import_statement = 'import { exportWorkspace, importWorkspace } from "../host/workspace";\n'

# Find the last import statement
last_import_idx = content.rfind('import ')
end_of_last_import = content.find('\n', last_import_idx) + 1
content = content[:end_of_last_import] + import_statement + content[end_of_last_import:]

# Find the end of component hooks (after `const handleBreadcrumbClick`)
breadcrumb_click = 'const handleBreadcrumbClick = (folderId: FolderId) => {\n    void navigateToBreadcrumb({ repo, excalidrawAPI, folderId });\n  };'

export_import_handlers = """
  const handleExport = async () => {
    try {
      const json = await exportWorkspace(repo);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Workspace.excaliwork";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error(err);
      window.alert(`Export failed: ${err.message}`);
    }
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".excaliwork";
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) {
        return;
      }

      try {
        const text = await file.text();
        const confirmed = window.confirm(
          "WARNING: This will replace your entire workspace. Are you sure you want to proceed?",
        );
        if (!confirmed) {
          return;
        }

        await importWorkspace(text, repo);
        window.alert(
          "Workspace imported successfully! The application will now reload.",
        );
        window.location.reload();
      } catch (err: any) {
        console.error(err);
        window.alert(`Import failed: ${err.message}`);
      }
    };
    input.click();
  };
"""

content = content.replace(breadcrumb_click, breadcrumb_click + '\n' + export_import_handlers)

# Find the end of breadcrumb div
breadcrumb_div = '</div>'
return_stmt = 'return (\n    <div\n      className="board-navbar"'
# We want to insert our buttons right before the final </div> of the component.
# The component ends with:
#       </div>
#     </div>
#   );

new_buttons = """
      <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
        <button type="button" onClick={handleImport} title="Import Workspace">
          Import
        </button>
        <button type="button" onClick={handleExport} title="Export Workspace">
          Export
        </button>
      </div>
"""

content = content.replace('      </div>\n    </div>\n  );', '      </div>' + new_buttons + '    </div>\n  );')

with open(path, "w", encoding="utf-8", newline='\n') as f:
    f.write(content)

print("Updated NavBar")
