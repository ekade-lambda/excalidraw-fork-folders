import os
path = "excalidraw-app/boards/repository/LocalStorageBoardRepository.ts"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

old_is = """function isQuotaExceededError(err: any): boolean {
  return (
    err instanceof DOMException &&
    (err.name === "QuotaExceededError" ||
      err.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}"""

new_is = """function isQuotaExceededError(err: any): boolean {
  return (
    err?.name === "QuotaExceededError" ||
    err?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    (err instanceof DOMException && (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED"))
  );
}"""

content = content.replace(old_is, new_is)
with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Patched isQuotaExceededError")
