import { completedSessions, isArchived, keySession, reservationStatus } from "../utils/sessions";
import { todayInSantiago } from "../utils/calendar";
import { formatDate, formatDateTime, formatPrice } from "../utils/format";
import StatusMenu from "./StatusMenu";

// Tarjeta compacta de una reserva: siempre de una sola fila, para ver rápido los últimos cambios.
// Muestra precio, fecha (próxima sesión o la última), avance y creación; el detalle de cada sesión
// (horario, puesto y estado) se ve en "Detalles". El primer botón cambia el estado de las sesiones.
// Una reserva del historial (borrada) muestra cuándo se borró y solo ofrece Detalles y Restaurar.
export default function ReservationCard({ reserva, onChangeStatus, onView, onEdit, onDelete, onRestore }) {
  const estado = reservationStatus(reserva);
  const archived = isArchived(reserva);
  const sesiones = reserva.sesiones ?? [];
  const clave = keySession(reserva, todayInSantiago());
  return (
    <article className={`reserva-card ${estado.toLowerCase()}${archived ? " reserva-card-archivada" : ""}`}>
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
            <dt>{archived ? "Sesión" : clave?.tipo === "proxima" ? "Próxima sesión" : "Última sesión"}</dt>
            <dd>
              {clave
                ? <time dateTime={`${clave.sesion.fecha}T${clave.sesion.horaInicio}`}>{formatDate(clave.sesion.fecha)} · {clave.sesion.horaInicio}</time>
                : "Sin sesiones"}
            </dd>
          </div>
          <div>
            <dt>Avance</dt>
            <dd>{completedSessions(reserva)} de {sesiones.length} {sesiones.length === 1 ? "sesión" : "sesiones"}</dd>
          </div>
          <div>
            <dt>{archived ? "Borrada" : "Creada"}</dt>
            <dd>
              <time dateTime={archived ? reserva.archivadaEn : reserva.fechaCreacion}>
                {formatDateTime(archived ? reserva.archivadaEn : reserva.fechaCreacion)}
              </time>
            </dd>
          </div>
        </dl>

        {archived ? (
          <div className="reservation-card-actions">
            <span className={`reserva-estado ${estado.toLowerCase()}`}>{estado}</span>
            <button type="button" className="reservation-button reservation-button-secondary" onClick={() => onView(reserva)} aria-label={`Ver detalles de la reserva de ${reserva.cliente}`}>Detalles</button>
            <button type="button" className="reservation-button" onClick={() => onRestore(reserva)} aria-label={`Restaurar la reserva de ${reserva.cliente}`}>Restaurar</button>
          </div>
        ) : (
          <div className="reservation-card-actions">
            <StatusMenu reserva={reserva} onChange={onChangeStatus} />
            <button type="button" className="reservation-button reservation-button-secondary" onClick={() => onView(reserva)} aria-label={`Ver detalles de la reserva de ${reserva.cliente}`}>Detalles</button>
            <button type="button" className="reservation-button reservation-button-secondary" onClick={() => onEdit(reserva)} aria-label={`Editar reserva de ${reserva.cliente}`}>Editar</button>
            <button type="button" className="reservation-button reservation-button-danger" onClick={() => onDelete(reserva)} aria-label={`Borrar reserva de ${reserva.cliente}`}>Borrar</button>
          </div>
        )}
      </div>
    </article>
  );
}
