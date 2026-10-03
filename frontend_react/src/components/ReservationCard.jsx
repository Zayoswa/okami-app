export default function ReservationCard({ reserva }) {
    return (
        <article className="reserva-card" key={reserva.id}>
        <div className="reserva-main">
            <div>
            <p className="reserva-cliente">{reserva.cliente}</p>
            <p className="reserva-servicio">{reserva.servicio}</p>
            </div>

            <span className={`reserva-estado ${reserva.estado}`}>
            {reserva.estado}
            </span>
        </div>

        <div className="reserva-info">
            <span>
            Fecha
            <strong>{reserva.fecha}</strong>
            </span>

            <span>
            Hora
            <strong>{reserva.hora}</strong>
            </span>
        </div>
        </article>
    );
    }
