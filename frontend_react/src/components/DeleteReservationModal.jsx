import { useState } from "react";
import useModalDialog from "../hooks/useModalDialog";
import { reservationRange } from "../utils/sessions";
import { formatDate } from "../utils/format";

import Notice from "./Notice";
export default function DeleteReservationModal({ reserva, onConfirm, onClose }) {
  const dialogRef = useModalDialog();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const total = reserva.sesiones?.length ?? 0;
  const { primera, ultima } = reservationRange(reserva);

  async function handleConfirm() {
    if (saving) return;
    setError("");
    setSaving(true);
    try {
      await onConfirm(reserva);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo borrar la reserva. Intenta nuevamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog ref={dialogRef} className="reservation-modal" aria-labelledby="delete-reservation-title" aria-describedby="delete-reservation-description" onCancel={(event) => { if (saving) event.preventDefault(); else onClose(); }} aria-busy={saving}>
      <div className="reservation-modal-header">
        <h2 id="delete-reservation-title">Borrar reserva</h2>
        <button type="button" className="reservation-modal-close" onClick={onClose} disabled={saving} aria-label="Cerrar confirmación">×</button>
      </div>
      <p id="delete-reservation-description" className="reservation-modal-description">
        ¿Quieres borrar la reserva de <strong>{reserva.cliente ?? "este cliente"}</strong> con {reserva.tatuador}
        {total > 0 && <> y {total === 1 ? <>su <strong>sesión</strong></> : <>sus <strong>{total} sesiones</strong></>} ({primera === ultima ? `el ${formatDate(primera)}` : `del ${formatDate(primera)} al ${formatDate(ultima)}`})</>}?
      </p>
      <p className="reservation-modal-description">
        La reserva deja de ocupar el puesto y la agenda. Si tenía sesiones completadas, siguen contando en las ganancias.
        Para quitar solo una sesión, edita la reserva.
      </p>
      {error && <Notice tone="danger" className="notice--compact">{error}</Notice>}
      <div className="reservation-modal-actions">
        <button type="button" className="reservation-button reservation-button-secondary" onClick={onClose} disabled={saving} autoFocus>Cancelar</button>
        <button type="button" className="reservation-button reservation-button-danger" onClick={handleConfirm} disabled={saving}>{saving ? "Borrando…" : "Borrar reserva"}</button>
      </div>
    </dialog>
  );
}
