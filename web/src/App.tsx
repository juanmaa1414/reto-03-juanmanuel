import { useState } from "react";
import { fetchSession } from "./api";
import { CaseSidebar } from "./components/CaseSidebar";
import { Chat, SESSION_STORAGE_KEY } from "./components/Chat";
import type { SessionData } from "./types";

export function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeCase, setActiveCase] = useState<string | null>(null);
  const [loadedSession, setLoadedSession] = useState<SessionData | null>(null);
  const [chatKey, setChatKey] = useState(0);

  const openCase = async (sessionId: string | null): Promise<void> => {
    if (!sessionId) return;
    const session = await fetchSession(sessionId);
    if (!session) return;
    setLoadedSession(session);
    const caso = session.metadata?.caso;
    setActiveCase(typeof caso === "string" ? caso : null);
    setSidebarOpen(false);
  };

  const handleCaseProcessed = (caso: string): void => {
    setActiveCase(caso);
    setRefreshKey((key) => key + 1);
  };

  const startNewCase = (): void => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setLoadedSession(null);
    setActiveCase(null);
    setSidebarOpen(false);
    setChatKey((key) => key + 1);
    setRefreshKey((key) => key + 1);
  };

  return (
    <>
      <header className="app-header">
        <button
          type="button"
          className="menu-button"
          onClick={() => setSidebarOpen((open) => !open)}
          aria-label="Abrir menú de casos"
        >
          ☰
        </button>
        <div className="brand">
          <span className="brand-mark">OC</span>
          <div>
            <h1>Agente de Órdenes de Compra</h1>
            <p>SAP simulado · Periferia IT Group</p>
          </div>
        </div>
        <div className="header-actions">
          <span className="model-chip">OpenCode Go · deepseek-v4.1-flash</span>
        </div>
      </header>

      <main className="layout">
        <div className={`sidebar-container ${sidebarOpen ? "open" : ""}`}>
          <CaseSidebar
            refreshKey={refreshKey}
            activeCase={activeCase}
            onOpenCase={(sessionId) => void openCase(sessionId)}
            onNewCase={startNewCase}
            onClose={() => setSidebarOpen(false)}
          />
          {sidebarOpen && (
            <button
              type="button"
              className="sidebar-overlay"
              onClick={() => setSidebarOpen(false)}
              aria-label="Cerrar menú"
            />
          )}
        </div>

        <Chat
          key={`${loadedSession?.id ?? "live"}-${chatKey}`}
          initialSession={loadedSession}
          onCaseProcessed={handleCaseProcessed}
        />
      </main>
    </>
  );
}
