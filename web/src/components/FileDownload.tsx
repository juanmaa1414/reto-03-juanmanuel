const CASE_FILES = [
  { name: "trazabilidad.json", label: "Trazabilidad (JSON)" },
  { name: "aprobacion.txt", label: "Aprobación (TXT)" },
  { name: "aprobacion.pdf", label: "Aprobación (PDF)" },
];

export function FileDownload({ caso }: { caso: string }) {
  return (
    <section className="file-download" aria-label="Archivos resultado">
      <span className="file-download-title">Archivos de {caso}:</span>
      {CASE_FILES.map((file) => (
        <a key={file.name} href={`/api/files/${caso}/${file.name}`} download={file.name}>
          {file.label}
        </a>
      ))}
      <a href="/api/control.csv" download="control.csv">
        Log de control (CSV)
      </a>
    </section>
  );
}
