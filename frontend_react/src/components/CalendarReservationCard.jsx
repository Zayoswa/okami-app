export default function CalendarReservationCard({ reserva, canManage, onEdit, onDelete }) {
  return (
    <article className={`calendar-session ${reserva.estado.toLowerCase()}`}>
      <p className="calendar-session-time">{reserva.horaInicio} – {reserva.horaFin}</p>
      <h4>{reserva.tatuador}</h4>
      <span className="calendar-session-status">{reserva.estado}</span>
      {canManage && (
        <div className="calendar-session-actions">
          <button type="button" onClick={() => onEdit(reserva)} aria-label={`Ver y editar sesión de ${reserva.tatuador} a las ${reserva.horaInicio}`}>Ver / editar</button>
          <button type="button" className="calendar-session-delete" onClick={() => onDelete(reserva)} aria-label={`Borrar sesión de ${reserva.tatuador} a las ${reserva.horaInicio}`}>Borrar</button>
        </div>
      )}
    </article>
  );
}
