import { existsSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SessionStore } from "../../src/agent/sessions.js";
import { outPath, testContext } from "../helpers.js";

describe("file-based sessions (5.5)", () => {
  it("creates, reads and updates a session", () => {
    const store = new SessionStore(testContext.directory);
    const created = store.create("session-test");
    expect(created.messages).toEqual([]);
    expect(created.status).toBe("active");

    const updated = store.update("session-test", {
      status: "paused",
      messages: [{ role: "user", content: "hola" }],
    });
    expect(updated?.status).toBe("paused");
    expect(updated?.messages).toHaveLength(1);

    const loaded = store.get("session-test");
    expect(loaded?.status).toBe("paused");
    expect(loaded?.messages[0]?.content).toBe("hola");
  });

  it("persists across a simulated restart", () => {
    const first = new SessionStore(testContext.directory);
    first.create("restart-test");
    first.appendMessages("restart-test", [{ role: "user", content: "persistime" }]);

    const second = new SessionStore(testContext.directory);
    const loaded = second.get("restart-test");
    expect(loaded?.messages).toHaveLength(1);
    expect(loaded?.messages[0]?.content).toBe("persistime");
  });

  it("writes atomically and leaves no temporary files", () => {
    const store = new SessionStore(testContext.directory);
    store.create("atomic-test");
    store.update("atomic-test", { status: "completed" });

    const files = readdirSync(outPath("sessions"));
    expect(files).toContain("atomic-test.json");
    expect(files.some((file) => file.includes(".tmp-"))).toBe(false);
  });

  it("rejects unsafe session identifiers", () => {
    const store = new SessionStore(testContext.directory);
    expect(() => store.get("../escape")).toThrow();
    expect(() => store.get("bad/id")).toThrow();
  });

  it("lists sessions ordered by most recently updated", () => {
    let tick = 0;
    const store = new SessionStore(
      testContext.directory,
      () => new Date(2026, 0, 1, 0, 0, tick++),
    );
    store.create("older");
    store.create("newer");
    const ids = store.list().map((session) => session.id);
    expect(ids[0]).toBe("newer");
  });

  it("creates the sessions directory on demand after cleanup", () => {
    const store = new SessionStore(testContext.directory);
    store.create("survivor");
    expect(existsSync(outPath("sessions", "survivor.json"))).toBe(true);
  });
});
