import os
path = 'excalidraw-app/tests/boards/folderService.test.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Enhance mockApi
old_mock = """  function mockApi() {
    const calls: { sceneElements?: ExcalidrawElement[]; addFiles?: unknown[] }[] =
      [];
    const api = {
      updateScene: vi.fn((opts: { elements?: ExcalidrawElement[] }) => {
        calls.push({ sceneElements: opts.elements });
      }),
      addFiles: vi.fn((files: unknown[]) => {
        calls[calls.length - 1].addFiles = files;
      }),
      getAppState: vi.fn(() => ({})),
      _calls: calls,
    };
    return api as unknown as ExcalidrawImperativeAPI & { _calls: typeof calls };
  }"""

new_mock = """  function mockApi() {
    const calls: { sceneElements?: ExcalidrawElement[]; addFiles?: unknown[] }[] =
      [];
    const api = {
      updateScene: vi.fn((opts: { elements?: ExcalidrawElement[] }) => {
        calls.push({ sceneElements: opts.elements });
      }),
      addFiles: vi.fn((files: unknown[]) => {
        calls[calls.length - 1].addFiles = files;
      }),
      getAppState: vi.fn(() => ({})),
      getSceneElementsIncludingDeleted: vi.fn(() => []),
      getName: vi.fn(() => "test"),
      getFiles: vi.fn(() => ({})),
      _calls: calls,
    };
    return api as unknown as ExcalidrawImperativeAPI & { _calls: typeof calls; getSceneElementsIncludingDeleted: any };
  }"""

content = content.replace(old_mock, new_mock)

content = content.replace('const { graph, rootFolderId, rootBoardId } = await initSystem(repo);', 'const { graph, rootFolderId, rootBoardId } = await seedRoot(repo);')
content = content.replace('const { graph, rootFolderId } = await initSystem(repo);', 'const { graph, rootFolderId } = await seedRoot(repo);')
content = content.replace('createMockExcalidrawAPI()', 'mockApi()')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated tests")
