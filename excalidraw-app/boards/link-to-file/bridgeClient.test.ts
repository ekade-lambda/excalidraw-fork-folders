import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  checkBridgeHealth,
  pickFile,
  resolveFile,
  openFile,
} from "./bridgeClient";
import {
  BridgeUnavailableError,
  CancelledBridgeError,
  FileNotFoundBridgeError,
  InternalBridgeError,
} from "./types";

describe("bridgeClient", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("checkBridgeHealth", () => {
    it("returns true when bridge is up and responds ok", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "ok" }),
      } as Response);

      const result = await checkBridgeHealth();
      expect(result).toBe(true);
    });

    it("returns false when bridge responds with non-ok", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
      } as Response);

      const result = await checkBridgeHealth();
      expect(result).toBe(false);
    });

    it("returns false when fetch throws (bridge down)", async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error("Network Error"));
      const result = await checkBridgeHealth();
      expect(result).toBe(false);
    });
  });

  describe("pickFile", () => {
    it("throws BridgeUnavailableError when bridge is down", async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error("Network Error"));
      await expect(pickFile()).rejects.toThrow(BridgeUnavailableError);
    });

    it("throws CancelledBridgeError when user cancels", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "cancelled" }),
      } as Response);
      await expect(pickFile()).rejects.toThrow(CancelledBridgeError);
    });

    it("returns picked file data on success", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "success",
          file_identity: {
            volume_guid: "VOL1",
            file_id: [1, 2, 3],
          },
          last_known_path: "C:\\test.txt",
          metadata: { name: "test.txt", extension: "txt", size: 100 },
        }),
      } as Response);

      const res = await pickFile();
      expect(res.fileIdentity.volumeGuid).toBe("VOL1");
      expect(res.fileIdentity.fileId).toEqual([1, 2, 3]);
      expect(res.lastKnownPath).toBe("C:\\test.txt");
      expect(res.metadata.size).toBe(100);
    });

    it("throws InternalBridgeError on invalid response", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "invalid_state_blah" }),
      } as Response);
      await expect(pickFile()).rejects.toThrow(InternalBridgeError);
    });
  });

  describe("resolveFile", () => {
    const dummyId = { volumeGuid: "VOL1", fileId: [1] };

    it("returns resolved path on success", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "resolved", current_path: "C:\\new.txt" }),
      } as Response);

      const res = await resolveFile(dummyId);
      expect(res.status).toBe("resolved");
      expect(res.currentPath).toBe("C:\\new.txt");
    });

    it("throws FileNotFoundBridgeError when not_found", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "not_found" }),
      } as Response);
      await expect(resolveFile(dummyId)).rejects.toThrow(FileNotFoundBridgeError);
    });

    it("throws BridgeUnavailableError when bridge is down", async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error("Network"));
      await expect(resolveFile(dummyId)).rejects.toThrow(BridgeUnavailableError);
    });
  });

  describe("openFile", () => {
    const dummyId = { volumeGuid: "VOL1", fileId: [1] };

    it("resolves successfully when bridge opens file", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "resolved" }),
      } as Response);

      await expect(openFile(dummyId)).resolves.toBeUndefined();
    });

    it("throws FileNotFoundBridgeError when file is deleted", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "not_found" }),
      } as Response);

      await expect(openFile(dummyId)).rejects.toThrow(FileNotFoundBridgeError);
    });
  });
});
