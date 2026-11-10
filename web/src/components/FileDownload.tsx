import { useEffect, useState } from "react";
import { fetchCaseFiles } from "../api";

const CASE_FILES: Record<string, string> = {
  "trazabilidad.json": "Trazabilidad (JSON)",
  "aprobacion.txt": "Aprobación (TXT)",
  "aprobacion.pdf": "Aprobación (PDF)",
};

export function FileDownload({
  caso,
  refreshKey,
}: {
  caso: string;
  refreshKey: number;
}) {
  const [files, setFiles] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchCaseFiles(caso)
      .then((available) => {
        if (!cancelled) setFiles(available);
      })
      .catch(() => {
        if (!cancelled) setFiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [caso, refreshKey]);

  const available = (files ?? []).filter((file) => file in CASE_FILES);

  return (
    <section className="file-download" aria-label="Archivos resultado">
      <span className="file-download-title">Archivos de {caso}:</span>

      {files === null && <span className="file-empty">Cargando archivos…</span>}

      {files !== null && available.length === 0 && (
        <span className="file-empty">
          Este caso no generó archivos de resultado (puede estar bloqueado).
        </span>
      )}

      {available.map((file) => (
        <a key={file} href={`/api/files/${caso}/${file}`} download={file}>
          {CASE_FILES[file]}
        </a>
      ))}

      <a href="/api/control.csv" download="control.csv">
        Log de control (CSV)
      </a>
    </section>
  );
}
