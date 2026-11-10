import { Markdown } from "./Markdown";

type ConfirmationProps = {
  message: string;
  pending: string[];
  onConfirm: () => void;
  onCancel: () => void;
  disabled?: boolean;
};

function splitRule(text: string): { code: string | null; detail: string } {
  const match = text.match(/^(RC\d+):\s*(.*)$/i);
  if (!match) return { code: null, detail: text };
  return { code: match[1] ?? null, detail: match[2] ?? text };
}

export function Confirmation({
  message,
  pending,
  onConfirm,
  onCancel,
  disabled = false,
}: ConfirmationProps) {
  const items = pending.map(splitRule);

  return (
    <section className="confirmation-card" role="alert" aria-live="assertive">
      <div className="confirmation-heading">
        <span className="confirmation-icon">⚠</span>
        <h3>Confirmación requerida</h3>
      </div>

      {pending.length > 0 ? (
        <>
          <p className="confirmation-intro">
            Revisa estas excepciones antes de crear la orden de compra:
          </p>
          <ul className="confirmation-list">
            {items.map((item, index) => (
              <li key={`${item.code ?? "excepcion"}-${index}`}>
                {item.code && <span className="confirmation-code">{item.code}</span>}
                <div className="confirmation-detail">
                  <Markdown>{item.detail}</Markdown>
                </div>
              </li>
            ))}
          </ul>
          <p className="confirmation-question">
            ¿Confirmas que continúe con la creación de la orden de compra?
          </p>
        </>
      ) : (
        <Markdown>{message}</Markdown>
      )}

      <div className="confirmation-actions">
        <button type="button" className="confirm" onClick={onConfirm} disabled={disabled}>
          Confirmar
        </button>
        <button type="button" className="cancel" onClick={onCancel} disabled={disabled}>
          Cancelar
        </button>
      </div>
    </section>
  );
}
