import { useEffect, useMemo, useState } from "react";
import { fetchCases, fetchSessions } from "../api";
import type { CaseEntry, SessionData } from "../types";

type CaseSidebarProps = {
  refreshKey: number;
  activeCase: string | null;
  onOpenCase: (sessionId: string | null) => void;
  onClose: () => void;
};

type SidebarEntry = CaseEntry & {
  caso: string | null;
  sessionId: string | null;
};

function statusLabel(status: string): string {
  if (status === "exitoso") return "Creada";
  if (status === "bloqueado") return "Bloqueada";
  if (status === "pendiente") return "Pendiente";
  return status;
}

export function CaseSidebar({
  refreshKey,
  activeCase,
  onOpenCase,
  onClose,
}: CaseSidebarProps) {
  const [cases, setCases] = useState<CaseEntry[]>([]);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([fetchCases(), fetchSessions()])
      .then(([nextCases, nextSessions]) => {
        if (cancelled) return;
        setCases(nextCases);
        setSessions(nextSessions);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const entries = useMemo<SidebarEntry[]>(() => {
    const byRequest = new Map<string, SessionData>();
    for (const session of sessions) {
      const requestId = session.metadata?.solicitud_id;
      if (typeof requestId === "string") byRequest.set(requestId, session);
    }
    return cases.map((entry) => {
      const session = byRequest.get(entry.solicitud_id) ?? null;
      const caso = session?.metadata?.caso;
      return {
        ...entry,
        caso: typeof caso === "string" ? caso : null,
        sessionId: session?.id ?? null,
      };
    });
  }, [cases, sessions]);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div>
          <h2>Casos procesados</h2>
          <p>{entries.length} registro(s) en el log de control</p>
        </div>
        <button type="button" className="sidebar-close" onClick={onClose} aria-label="Cerrar menú">
          ×
        </button>
      </div>

      {loading && <p className="sidebar-empty">Cargando casos…</p>}
      {!loading && entries.length === 0 && (
        <p className="sidebar-empty">
          Todavía no hay casos procesados. Probá con <strong>sol-001</strong>.
        </p>
      )}

      <ul className="case-list">
        {entries.map((entry, index) => {
          const isActive = activeCase !== null && entry.caso === activeCase;
          return (
            <li key={`${entry.solicitud_id}-${entry.ts}-${index}`}>
              <button
                type="button"
                className={`case-item ${isActive ? "active" : ""}`}
                onClick={() => onOpenCase(entry.sessionId)}
                disabled={!entry.sessionId}
                title={
                  entry.sessionId
                    ? "Ver el historial de esta sesión"
                    : "No hay sesión asociada a este caso"
                }
              >
                <span className="case-main">
                  <span className="case-id">{entry.caso ?? entry.solicitud_id}</span>
                  <span className={`case-status status-${entry.resultado}`}>
                    {statusLabel(entry.resultado)}
                  </span>
                </span>
                <span className="case-meta">
                  {entry.numero_oc ? `OC ${entry.numero_oc}` : entry.solicitud_id}
                  {entry.retroactiva && <span className="retro-badge">retroactiva</span>}
                </span>
                {entry.bloqueos.length > 0 && (
                  <span className="case-detail">{entry.bloqueos[0]}</span>
                )}
                {entry.confirmaciones.length > 0 && (
                  <span className="case-detail">{entry.confirmaciones[0]}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
