import os

path = 'excalidraw-app/tests/boards/folderRename.ui.test.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# We need to simulate the focus stealing:
# First, create an excalidraw-container in the DOM so relatedTarget can point to it.
import re

setup_test = """
    const wrapper = container.querySelector(".excalidraw-app")!;
    
    // Inject a fake excalidraw container to simulate focusContainer()
    const excalidrawContainer = document.createElement("div");
    excalidrawContainer.className = "excalidraw-container";
    excalidrawContainer.tabIndex = -1;
    wrapper.appendChild(excalidrawContainer);
"""
content = content.replace('const wrapper = container.querySelector(".excalidraw-app")!;', setup_test)

# Instead of just replacing, we need to inject the blur event after input appears
old_test_part = """    // Input should appear
    const input = screen.getByDisplayValue("Carpeta Vieja") as HTMLInputElement;
    expect(input).toBeInTheDocument();

    // Change value
    fireEvent.change(input, { target: { value: "Nueva Carpeta" } });"""

new_test_part = """    // Input should appear
    const input = screen.getByDisplayValue("Carpeta Vieja") as HTMLInputElement;
    expect(input).toBeInTheDocument();

    // Simular el robo programático de foco por Excalidraw's focusContainer()
    fireEvent.blur(input, { relatedTarget: excalidrawContainer });

    // Rename NO debe destruirse
    expect(input).toBeInTheDocument();

    // Change value
    fireEvent.change(input, { target: { value: "Nueva Carpeta" } });"""

content = content.replace(old_test_part, new_test_part)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)

print("Updated test for regression")
