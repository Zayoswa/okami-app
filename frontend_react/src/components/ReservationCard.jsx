import { completedSessions, reservationStatus } from "../utils/sessions";

const priceFormatter = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("es-CL", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC",
});

const creationFormatter = new Intl.DateTimeFormat("es-CL", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function formatDate(fecha) {
    return dateFormatter.format(new Date(`${fecha}T12:00:00Z`));
}

export default function ReservationCard({ reserva, onEdit, onDelete }) {
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
                    <dd>{priceFormatter.format(reserva.precio)}</dd>
                </div>
                <div>
                    <dt>Avance</dt>
                    <dd>{completedSessions(reserva)} de {sesiones.length} {sesiones.length === 1 ? "sesión" : "sesiones"}</dd>
                </div>
                <div>
                    <dt>Creada</dt>
                    <dd><time dateTime={reserva.fechaCreacion}>{creationFormatter.format(new Date(reserva.fechaCreacion))}</time></dd>
                </div>
            </dl>

            <span className={`reserva-estado ${estado.toLowerCase()}`}>{estado}</span>

            <div className="reservation-card-actions">
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
