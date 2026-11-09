import { useNavigate } from "react-router-dom";
import useModalDialog from "../hooks/useModalDialog";
import SessionStatusButtons from "./SessionStatusButtons";
import { completedSessions, isArchived, reservationStatus } from "../utils/sessions";
import { formatDate, formatDateTime, formatPrice, formatWeekdayDate } from "../utils/format";
import { formatRut } from "../utils/rut";
import "./ReservationDetailsModal.css";

// Detalle de solo lectura de una reserva.
// - Desde el calendario llega "sesion" (la sesión en la que se hizo clic) y se destaca arriba.
// - Desde Reservas llega solo "reserva" y se listan todas sus sesiones.
// Quien puede gestionarla (canManage) ve "Editar reserva" y, si llega onChangeStatus(reserva, sesionId, estado),
// botones para cambiar el estado de cada sesión. onEdit recibe lo mismo que llegó.
// Una reserva del historial no se edita: muestra cuándo se borró y, con onRestore, el botón "Restaurar".
// Cliente y precio pueden venir vacíos: el backend los oculta en reservas de otros tatuadores.
export default function ReservationDetailsModal({ sesion = null, reserva: reservaProp = null, canManage, onEdit, onChangeStatus, onRestore, onClose }) {
  const dialogRef = useModalDialog();
  const navigate = useNavigate();
  const reserva = sesion?.reserva ?? reservaProp;
  const sesiones = reserva?.sesiones ?? [];
  const estado = reservationStatus(reserva);
  const hasCliente = Boolean(reserva?.cliente);
  const hasPrecio = reserva?.precio !== undefined && reserva?.precio !== null;
  const archived = isArchived(reserva);
  const canChangeStatus = canManage && !archived && Boolean(onChangeStatus);
  const statusButtons = (item, label) => canChangeStatus && (
    <SessionStatusButtons sesion={item} label={label} onChange={(estado) => onChangeStatus(reserva, item.id, estado)} />
  );

  return (
    <dialog ref={dialogRef} className="reservation-modal reservation-details" aria-labelledby="reservation-details-title" onCancel={onClose}>
      <div className="reservation-modal-header">
        <h2 id="reservation-details-title">Detalle de la reserva</h2>
        <button type="button" className="reservation-modal-close" onClick={onClose} aria-label="Cerrar detalle">×</button>
      </div>

      {/* Sesión en la que se hizo clic */}
      {sesion && <section className={`details-session ${sesion.estado.toLowerCase()}`} aria-label="Sesión seleccionada">
        <p className="details-session-date">{formatWeekdayDate(sesion.fecha)}</p>
        <p className="details-session-time">{sesion.horaInicio} – {sesion.horaFin}</p>
        <p className="details-session-meta">
          {sesion.puesto}
          {sesion.total > 1 && <> · Sesión {sesion.numero} de {sesion.total}</>}
          {!canChangeStatus && <span className={`reserva-estado ${sesion.estado.toLowerCase()}`}>{sesion.estado}</span>}
        </p>
        {statusButtons(sesion, "Estado de esta sesión")}
      </section>}

      {/* Datos de la reserva completa */}
      <dl className="details-grid">
        {hasCliente && <div><dt>Cliente</dt><dd>{reserva.cliente}</dd></div>}
        {reserva?.clienteRut && <div><dt>RUT</dt><dd>{formatRut(reserva.clienteRut)}</dd></div>}
        <div><dt>Tatuador</dt><dd>{sesion?.tatuador ?? reserva?.tatuador}</dd></div>
        {hasPrecio && <div><dt>Precio total</dt><dd>{formatPrice(reserva.precio)}</dd></div>}
        <div><dt>Avance</dt><dd>{completedSessions(reserva)} de {sesiones.length} {sesiones.length === 1 ? "sesión" : "sesiones"}</dd></div>
        <div><dt>Estado de la reserva</dt><dd><span className={`reserva-estado ${estado.toLowerCase()}`}>{estado}</span></dd></div>
        {reserva?.zonaCuerpo && <div><dt>Zona del cuerpo</dt><dd>{reserva.zonaCuerpo}</dd></div>}
        {reserva?.descripcionDiseno && <div className="details-grid-wide"><dt>Descripción del diseño</dt><dd className="details-design">{reserva.descripcionDiseno}</dd></div>}
        {archived && <div><dt>Borrada</dt><dd><time dateTime={reserva.archivadaEn}>{formatDateTime(reserva.archivadaEn)}</time></dd></div>}
      </dl>

      {(sesiones.length > 1 || !sesion) && (
        <>
          <h3 className="details-subtitle">{sesion ? "Todas las sesiones" : sesiones.length === 1 ? "Sesión" : "Sesiones"}</h3>
          <ol className="details-sessions">
            {sesiones.map((item, index) => (
              <li key={item.id} className={item.id === sesion?.id ? "details-sessions-current" : ""} aria-current={item.id === sesion?.id ? "true" : undefined}>
                <span className="details-sessions-number">Sesión {index + 1}</span>
                <time dateTime={`${item.fecha}T${item.horaInicio}`}>{formatDate(item.fecha)} · {item.horaInicio} – {item.horaFin}</time>
                <span>{item.puesto}</span>
                {item.id === sesion?.id || !canChangeStatus
                  ? <span className={`reserva-estado ${item.estado.toLowerCase()}`}>{item.estado}</span>
                  : statusButtons(item, `Estado de la sesión ${index + 1}`)}
              </li>
            ))}
          </ol>
        </>
      )}

      {!canManage && <p className="reservation-modal-description">Solo el tatuador de esta reserva o un administrador pueden editarla.</p>}
      {archived && <p className="reservation-modal-description">Esta reserva está en el historial: no ocupa puestos ni aparece en la agenda. Restáurala para editarla.</p>}

      <div className="reservation-modal-actions">
        <button type="button" className="reservation-button reservation-button-secondary" onClick={onClose} autoFocus={!canManage || archived}>Cerrar</button>
        {/* Consentimiento informado con los datos de esta reserva (cliente, tatuador, zona y diseño). */}
        {canManage && !archived && hasCliente && <button type="button" className="reservation-button reservation-button-secondary" onClick={() => navigate(`/consentimientos?reserva=${encodeURIComponent(reserva.id)}`)}>Consentimiento</button>}
        {canManage && !archived && <button type="button" className="reservation-button" onClick={() => onEdit(sesion ?? reserva)} autoFocus>Editar reserva</button>}
        {canManage && archived && onRestore && <button type="button" className="reservation-button" onClick={() => onRestore(reserva)}>Restaurar</button>}
      </div>
    </dialog>
  );
}
