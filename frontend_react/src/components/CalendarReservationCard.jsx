// Sesión en la agenda del día. "Ver detalle" está disponible para todos;
// "Borrar reserva" solo para quien puede gestionarla.
export default function CalendarReservationCard({ sesion, canManage, onView, onDelete }) {
  return (
    <article className={`calendar-session ${sesion.estado.toLowerCase()}`}>
      <p className="calendar-session-time">{sesion.horaInicio} – {sesion.horaFin}</p>
      <h4>{sesion.tatuador}</h4>
      {sesion.total > 1 && <p className="calendar-session-number">Sesión {sesion.numero} de {sesion.total}</p>}
      <span className="calendar-session-status">{sesion.estado}</span>
      <div className="calendar-session-actions">
        <button type="button" onClick={() => onView(sesion)} aria-label={`Ver detalle de la reserva de ${sesion.tatuador} a las ${sesion.horaInicio}`}>Ver detalle</button>
        {canManage && (
          <button type="button" className="calendar-session-delete" onClick={() => onDelete(sesion)} aria-label={`Borrar la reserva de ${sesion.tatuador} a las ${sesion.horaInicio}`}>Borrar reserva</button>
        )}
      </div>
    </article>
  );
}
