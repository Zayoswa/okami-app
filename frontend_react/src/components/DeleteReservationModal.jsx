import { useState } from "react";
import useModalDialog from "../hooks/useModalDialog";

export default function DeleteReservationModal({ reserva, onConfirm, onClose }) {
  const dialogRef = useModalDialog();
  const [error, setError] = useState("");

  function handleConfirm() {
    try {
      onConfirm(reserva);
      onClose();
    } catch {
      setError("No se pudo borrar la reserva en este navegador. Intenta nuevamente.");
    }
  }

  return (
    <dialog ref={dialogRef} className="reservation-modal" aria-labelledby="delete-reservation-title" aria-describedby="delete-reservation-description" onCancel={onClose}>
      <div className="reservation-modal-header">
        <h2 id="delete-reservation-title">Borrar reserva</h2>
        <button type="button" className="reservation-modal-close" onClick={onClose} aria-label="Cerrar confirmación">×</button>
      </div>
      <p id="delete-reservation-description" className="reservation-modal-description">
        ¿Quieres borrar la reserva de <strong>{reserva.cliente}</strong> con {reserva.tatuador},
        programada para el {new Intl.DateTimeFormat("es-CL").format(new Date(`${reserva.fecha}T${reserva.horaInicio}`))} de {reserva.horaInicio} a {reserva.horaFin}?
        {" "}Esta acción no se puede deshacer.
      </p>
      {error && <p className="reservation-form-error" role="alert">{error}</p>}
      <div className="reservation-modal-actions">
        <button type="button" className="reservation-button reservation-button-secondary" onClick={onClose} autoFocus>Cancelar</button>
        <button type="button" className="reservation-button reservation-button-danger" onClick={handleConfirm}>Borrar reserva</button>
      </div>
    </dialog>
  );
}
