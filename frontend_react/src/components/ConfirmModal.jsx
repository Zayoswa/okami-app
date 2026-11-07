import useModalDialog from "../hooks/useModalDialog";
import "./ConfirmModal.css";

// Ventana de confirmación de la app (reemplaza a window.confirm del navegador).
//   title        título de la ventana
//   message      texto principal
//   items        lista opcional (por ejemplo, sesiones afectadas)
//   note         aclaración opcional bajo la lista
//   question     pregunta final
//   confirmLabel texto del botón de confirmar
//   tone         "warning" (por defecto) o "danger" para acciones que quitan algo
// onResult(true | false): el usuario confirmó o canceló (también con Escape o la ×).
export default function ConfirmModal({ title, message, items = [], note, question, confirmLabel = "Confirmar", tone = "warning", onResult }) {
  const dialogRef = useModalDialog();
  return (
    <dialog ref={dialogRef} className={`reservation-modal confirm-modal confirm-modal--${tone}`}
      aria-labelledby="confirm-modal-title" aria-describedby="confirm-modal-message"
      onCancel={(event) => { event.preventDefault(); onResult(false); }}>
      <div className="reservation-modal-header">
        <h2 id="confirm-modal-title">{title}</h2>
        <button type="button" className="reservation-modal-close" onClick={() => onResult(false)} aria-label="Cerrar">×</button>
      </div>

      <div id="confirm-modal-message" className="confirm-modal-body">
        {message && <p>{message}</p>}
        {items.length > 0 && (
          <ul className="confirm-modal-items">
            {items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
          </ul>
        )}
        {note && <p className="confirm-modal-note">{note}</p>}
        {question && <p className="confirm-modal-question">{question}</p>}
      </div>

      <div className="reservation-modal-actions">
        <button type="button" className="reservation-button reservation-button-secondary" onClick={() => onResult(false)} autoFocus>Cancelar</button>
        <button type="button" className={`reservation-button${tone === "danger" ? " reservation-button-danger" : ""}`} onClick={() => onResult(true)}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
