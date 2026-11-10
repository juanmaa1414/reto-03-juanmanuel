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
  if (status === "finalizada") return "Finalizada";
  if (status === "en_curso") return "En curso";
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

    const representedRequests = new Set<string>();
    const sessionEntries: SidebarEntry[] = [];

    for (const session of sessions) {
      const casoRaw = session.metadata?.caso;
      if (typeof casoRaw !== "string" || casoRaw.length === 0) continue;

      const requestId =
        typeof session.metadata?.solicitud_id === "string"
          ? session.metadata.solicitud_id
          : null;
      if (requestId) representedRequests.add(requestId);

      const caseRow = requestId
        ? cases.find((entry) => entry.solicitud_id === requestId)
        : undefined;
      const metadataOrder = session.metadata?.numero_oc;
      const resultado =
        caseRow?.resultado ??
        (session.status === "completed"
          ? "finalizada"
          : session.status === "paused"
            ? "pendiente"
            : "en_curso");

      sessionEntries.push({
        solicitud_id: requestId ?? casoRaw,
        resultado,
        numero_oc:
          caseRow?.numero_oc ??
          (typeof metadataOrder === "string" ? metadataOrder : null),
        retroactiva: caseRow?.retroactiva ?? false,
        bloqueos: caseRow?.bloqueos ?? [],
        confirmaciones: caseRow?.confirmaciones ?? [],
        ts: caseRow?.ts ?? session.updatedAt,
        caso: casoRaw,
        sessionId: session.id,
      });
    }

    const legacyEntries: SidebarEntry[] = cases
      .filter((entry) => !representedRequests.has(entry.solicitud_id))
      .map((entry) => {
        const session = byRequest.get(entry.solicitud_id) ?? null;
        const caso = session?.metadata?.caso;
        return {
          ...entry,
          caso: typeof caso === "string" ? caso : null,
          sessionId: session?.id ?? null,
        };
      });

    return [...sessionEntries, ...legacyEntries].sort((a, b) => b.ts.localeCompare(a.ts));
  }, [cases, sessions]);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div>
          <h2>Casos y sesiones</h2>
          <p>{entries.length} caso(s) con actividad</p>
        </div>
        <button type="button" className="sidebar-close" onClick={onClose} aria-label="Cerrar menú">
          ×
        </button>
      </div>

      {loading && <p className="sidebar-empty">Cargando casos…</p>}
      {!loading && entries.length === 0 && (
        <p className="sidebar-empty">
          Aún no hay casos con sesión. Usa <strong>+ Nuevo caso</strong> para empezar.
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
