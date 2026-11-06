import useModalDialog from "../hooks/useModalDialog";
import { completedSessions, reservationStatus } from "../utils/sessions";

const priceFormatter = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const longDateFormatter = new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const shortDateFormatter = new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

const toDate = (fecha) => new Date(`${fecha}T12:00:00Z`);

// Detalle de solo lectura de la sesión elegida en el calendario y de su reserva.
// Muestra el botón "Editar reserva" solo a quien puede editarla (canManage).
// Cliente y precio pueden venir vacíos: el backend los oculta en reservas de otros tatuadores.
export default function ReservationDetailsModal({ sesion, canManage, onEdit, onClose }) {
  const dialogRef = useModalDialog();
  const reserva = sesion.reserva;
  const sesiones = reserva?.sesiones ?? [];
  const estado = reservationStatus(reserva);
  const hasCliente = Boolean(reserva?.cliente);
  const hasPrecio = reserva?.precio !== undefined && reserva?.precio !== null;

  return (
    <dialog ref={dialogRef} className="reservation-modal reservation-details" aria-labelledby="reservation-details-title" onCancel={onClose}>
      <div className="reservation-modal-header">
        <h2 id="reservation-details-title">Detalle de la reserva</h2>
        <button type="button" className="reservation-modal-close" onClick={onClose} aria-label="Cerrar detalle">×</button>
      </div>

      {/* Sesión en la que se hizo clic */}
      <section className={`details-session ${sesion.estado.toLowerCase()}`} aria-label="Sesión seleccionada">
        <p className="details-session-date">{longDateFormatter.format(toDate(sesion.fecha))}</p>
        <p className="details-session-time">{sesion.horaInicio} – {sesion.horaFin}</p>
        <p className="details-session-meta">
          {sesion.puesto}
          {sesion.total > 1 && <> · Sesión {sesion.numero} de {sesion.total}</>}
          <span className={`reserva-estado ${sesion.estado.toLowerCase()}`}>{sesion.estado}</span>
        </p>
      </section>

      {/* Datos de la reserva completa */}
      <dl className="details-grid">
        {hasCliente && <div><dt>Cliente</dt><dd>{reserva.cliente}</dd></div>}
        <div><dt>Tatuador</dt><dd>{sesion.tatuador}</dd></div>
        {hasPrecio && <div><dt>Precio total</dt><dd>{priceFormatter.format(reserva.precio)}</dd></div>}
        <div><dt>Avance</dt><dd>{completedSessions(reserva)} de {sesiones.length} {sesiones.length === 1 ? "sesión" : "sesiones"}</dd></div>
        <div><dt>Estado de la reserva</dt><dd><span className={`reserva-estado ${estado.toLowerCase()}`}>{estado}</span></dd></div>
      </dl>

      {sesiones.length > 1 && (
        <>
          <h3 className="details-subtitle">Todas las sesiones</h3>
          <ol className="details-sessions">
            {sesiones.map((item, index) => (
              <li key={item.id} className={item.id === sesion.id ? "details-sessions-current" : ""} aria-current={item.id === sesion.id ? "true" : undefined}>
                <span className="details-sessions-number">Sesión {index + 1}</span>
                <time dateTime={`${item.fecha}T${item.horaInicio}`}>{shortDateFormatter.format(toDate(item.fecha))} · {item.horaInicio} – {item.horaFin}</time>
                <span>{item.puesto}</span>
                <span className={`reserva-estado ${item.estado.toLowerCase()}`}>{item.estado}</span>
              </li>
            ))}
          </ol>
        </>
      )}

      {!canManage && <p className="reservation-modal-description">Solo el tatuador de esta reserva o un administrador pueden editarla.</p>}

      <div className="reservation-modal-actions">
        <button type="button" className="reservation-button reservation-button-secondary" onClick={onClose} autoFocus={!canManage}>Cerrar</button>
        {canManage && <button type="button" className="reservation-button" onClick={() => onEdit(sesion)} autoFocus>Editar reserva</button>}
      </div>
    </dialog>
  );
}
