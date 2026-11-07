import { completedSessions, reservationStatus } from "../utils/sessions";
import { formatDate, formatDateTime, formatPrice } from "../utils/format";
import StatusMenu from "./StatusMenu";

// Tarjeta de una reserva en el listado: datos clave, acciones y sus sesiones.
// El primer botón muestra el estado de la reserva y abre una ventana pequeña para cambiarlo.
export default function ReservationCard({ reserva, onChangeStatus, onView, onEdit, onDelete }) {
  const estado = reservationStatus(reserva);
  const sesiones = reserva.sesiones ?? [];
  return (
    <article className={`reserva-card ${estado.toLowerCase()}`}>
      {/* Fila principal compacta: quién, datos clave, estado y acciones en una línea */}
      <div className="reserva-main">
        <div className="reserva-identity">
          <p className="reserva-cliente">{reserva.cliente}</p>
          <p className="reserva-tatuador">Tatuador: {reserva.tatuador}</p>
        </div>

        <dl className="reserva-info">
          <div>
            <dt>Precio</dt>
            <dd className="reserva-precio">{formatPrice(reserva.precio)}</dd>
          </div>
          <div>
            <dt>Avance</dt>
            <dd>{completedSessions(reserva)} de {sesiones.length} {sesiones.length === 1 ? "sesión" : "sesiones"}</dd>
          </div>
          <div>
            <dt>Creada</dt>
            <dd><time dateTime={reserva.fechaCreacion}>{formatDateTime(reserva.fechaCreacion)}</time></dd>
          </div>
        </dl>

        <div className="reservation-card-actions">
          <StatusMenu reserva={reserva} onChange={onChangeStatus} />
          <button type="button" className="reservation-button reservation-button-secondary" onClick={() => onView(reserva)} aria-label={`Ver detalles de la reserva de ${reserva.cliente}`}>Detalles</button>
          <button type="button" className="reservation-button reservation-button-secondary" onClick={() => onEdit(reserva)} aria-label={`Editar reserva de ${reserva.cliente}`}>Editar</button>
          <button type="button" className="reservation-button reservation-button-danger" onClick={() => onDelete(reserva)} aria-label={`Borrar reserva de ${reserva.cliente}`}>Borrar</button>
        </div>
      </div>

      <ol className="reserva-sesiones" aria-label={`Sesiones de la reserva de ${reserva.cliente}`}>
        {sesiones.map((sesion, index) => (
          <li key={sesion.id}>
            <span className="reserva-sesion-numero">Sesión {index + 1}</span>
            <time dateTime={`${sesion.fecha}T${sesion.horaInicio}`}>{formatDate(sesion.fecha)} · {sesion.horaInicio} – {sesion.horaFin}</time>
            <span>{sesion.puesto}</span>
            <span className={`reserva-estado ${sesion.estado.toLowerCase()}`}>{sesion.estado}</span>
          </li>
        ))}
      </ol>
    </article>
  );
}
