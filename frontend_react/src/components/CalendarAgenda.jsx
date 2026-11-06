import CalendarReservationCard from "./CalendarReservationCard";
import { canManageReservation } from "../utils/access";
import { puestoNumber } from "../utils/puestos";
import { formatFullDate } from "../utils/format";

export default function CalendarAgenda({ user, selectedDate, sessions, puestos, onView, onDelete }) {
  return (
    <section className="calendar-agenda" aria-labelledby="calendar-agenda-title">
      <h2 id="calendar-agenda-title">
        Agenda del {formatFullDate(selectedDate)}
      </h2>
      <p className="calendar-agenda-description" role="status">
        {sessions.length} sesiones según los filtros. Selecciona una sesión para ver su detalle.
      </p>
      <div className="calendar-space-columns" tabIndex={0} role="region" aria-label="Agenda por puestos, desplazamiento horizontal">
        {puestos.map((puesto) => {
          const items = sessions.filter((item) => item.puestoId === puesto.id);
          return (
            <section className={`calendar-space puesto-numero-fondo puesto-numero-fondo--arriba${puesto.disponible ? "" : " calendar-space-unavailable"}`} data-numero={puestoNumber(puesto.nombre)} key={puesto.id} aria-label={puesto.nombre}>
              <div className="calendar-space-header">
                <h3>{puesto.nombre}</h3>
                {!puesto.disponible && <span>{puesto.estado}</span>}
              </div>
              {items.length === 0 ? <p className="calendar-space-empty">Libre</p> : items.map((sesion) => (
                <CalendarReservationCard
                  key={sesion.id}
                  sesion={sesion}
                  canManage={canManageReservation(user, sesion)}
                  onView={onView}
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
