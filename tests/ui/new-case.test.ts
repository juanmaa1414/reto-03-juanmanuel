// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../../web/src/App";

const session = {
  id: "session-test",
  messages: [
    { role: "user", content: "Procesa sol-001" },
    { role: "assistant", content: "La OC 4500000001 fue creada." },
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:01.000Z",
  status: "completed",
  metadata: {
    caso: "sol-001",
    solicitud_id: "SOL-2026-001",
    numero_oc: "4500000001",
    finalized: true,
  },
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Nuevo caso button", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("clears the current case and opens a fresh chat", async () => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    window.localStorage.setItem("agente-oc-sap-session-id", "session-test");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/sessions/session-test")) return json({ ok: true, data: session });
        if (url.endsWith("/api/sessions")) return json({ ok: true, data: [session] });
        if (url.endsWith("/api/cases")) return json({ ok: true, data: [] });
        if (url.includes("/api/files/sol-001")) {
          return json({ ok: true, data: { caso: "sol-001", files: [] } });
        }
        return json({ ok: false, error: "not found" }, 404);
      }),
    );

    render(createElement(App));

    await waitFor(() => {
      expect(screen.getByText("Procesa sol-001")).toBeTruthy();
    });
    expect(screen.getByText(/Caso finalizado/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /nuevo caso/i }));

    await waitFor(() => {
      expect(screen.getByText(/Cada sesión trabaja un único caso/i)).toBeTruthy();
    });
    expect(screen.queryByText("Procesa sol-001")).toBeNull();
    expect(window.localStorage.getItem("agente-oc-sap-session-id")).toBeNull();
  });
});
