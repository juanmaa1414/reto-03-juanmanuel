type ConfirmationProps = {
  message: string;
  pending: string[];
  onConfirm: () => void;
  onCancel: () => void;
  disabled?: boolean;
};

export function Confirmation({
  message,
  pending,
  onConfirm,
  onCancel,
  disabled = false,
}: ConfirmationProps) {
  return (
    <section className="confirmation-card" role="alert" aria-live="assertive">
      <div className="confirmation-heading">
        <span className="confirmation-icon">⚠</span>
        <h3>Confirmación requerida</h3>
      </div>
      <p>{message}</p>
      {pending.length > 0 && (
        <ul>
          {pending.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
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
