import CalendarReservationCard from "./CalendarReservationCard";
import { canManageReservation } from "../utils/access";

const dayFormatter = new Intl.DateTimeFormat("es-CL", {
  weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
});

export default function CalendarAgenda({ user, selectedDate, reservations, spaces, onEdit, onDelete }) {
  return (
    <section className="calendar-agenda" aria-labelledby="calendar-agenda-title">
      <h2 id="calendar-agenda-title">
        Agenda del {dayFormatter.format(new Date(`${selectedDate}T12:00:00Z`))}
      </h2>
      <p className="calendar-agenda-description" role="status">
        {reservations.length} reservas según los filtros. Edita una sesión para cambiar su fecha, horario o espacio.
      </p>
      <div className="calendar-space-columns" tabIndex={0} role="region" aria-label="Agenda por espacios, desplazamiento horizontal">
        {spaces.map((space) => {
          const sessions = reservations.filter((item) => (item.espacioId ?? "") === space.id);
          return (
            <section className="calendar-space" key={space.id} aria-label={space.nombre}>
              <div className="calendar-space-header">
                <h3>{space.nombre}</h3>
                {space.capacidadMaxima && (
                  <span>Capacidad: {space.capacidadMaxima} {space.capacidadMaxima === 1 ? "persona" : "personas"}</span>
                )}
              </div>
              {sessions.length === 0 ? <p className="calendar-space-empty">Sin reservas</p> : sessions.map((reserva) => (
                <CalendarReservationCard
                  key={reserva.id}
                  reserva={reserva}
                  canManage={canManageReservation(user, reserva)}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </section>
          );
        })}
      </div>
    </section>
  );
}
