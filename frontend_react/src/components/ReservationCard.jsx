import espacios from "../data/espacios.json";

const priceFormatter = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("es-CL", {
    day: "2-digit", month: "2-digit", year: "numeric",
});

const creationFormatter = new Intl.DateTimeFormat("es-CL", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export default function ReservationCard({ reserva, onEdit, onDelete }) {
    const espacio = espacios.find((item) => item.id === reserva.espacioId);
    return (
        <article className="reserva-card">
        <div className="reserva-main">
            <div>
            <p className="reserva-field-label">Nombre del cliente</p>
            <p className="reserva-cliente">{reserva.cliente}</p>
            <p className="reserva-tatuador">Nombre del tatuador: {reserva.tatuador}</p>
            </div>

            <div className="reserva-controls">
            <div className="reservation-card-actions">
                <button type="button" className="reservation-button reservation-button-secondary" onClick={() => onEdit(reserva)} aria-label={`Editar reserva de ${reserva.cliente}`}>Editar</button>
                <button type="button" className="reservation-button reservation-button-danger" onClick={() => onDelete(reserva)} aria-label={`Borrar reserva de ${reserva.cliente}`}>Borrar</button>
            </div>
            <div className="reserva-status">
            <span className="reserva-field-label">Status</span>
            <span className={`reserva-estado ${reserva.estado.toLowerCase()}`}>
            {reserva.estado}
            </span>
            </div>
            </div>
        </div>

        <div className="reserva-info">
            <span>
            Espacio
            <strong>{espacio?.nombre ?? "Sin asignar"}</strong>
            </span>
            <span>
            Precio
            <strong>{priceFormatter.format(reserva.precio)}</strong>
            </span>

            <span>
            Fecha y horario
            <strong>
                <time dateTime={`${reserva.fecha}T${reserva.horaInicio}`}>
                    {dateFormatter.format(new Date(`${reserva.fecha}T${reserva.horaInicio}`))} · {reserva.horaInicio} – {reserva.horaFin}
                </time>
            </strong>
            </span>

            <span>
            Fecha de creación del ticket
            <strong>
                <time dateTime={reserva.fechaCreacion}>
                    {creationFormatter.format(new Date(reserva.fechaCreacion))}
                </time>
            </strong>
            </span>
        </div>
        </article>
    );
    }
