import { useState } from "react";
import espacios from "../data/espacios.json";
import { reservationStatuses } from "../data/reservationStatuses";
import useReservations from "../hooks/useReservations";
import ReservationModal from "../components/ReservationModal";
import DeleteReservationModal from "../components/DeleteReservationModal";
import CalendarAgenda from "../components/CalendarAgenda";
import { monthDays, shiftMonth, todayInSantiago } from "../utils/calendar";
import { canManageReservation } from "../utils/access";
import "./Reservas.css";
import "./Calendario.css";

const monthFormatter = new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric", timeZone: "UTC" });
const dayFormatter = new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const weekdays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export default function Calendario({ user }) {
  const today = todayInSantiago();
  const { reservas, saveReservation, deleteReservation } = useReservations(user);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(today);
  const [spaceFilter, setSpaceFilter] = useState("todos");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [modal, setModal] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [message, setMessage] = useState("");
  const filtered = reservas.filter((item) =>
    (spaceFilter === "todos" || item.espacioId === spaceFilter) &&
    (statusFilter === "todos" || item.estado === statusFilter)
  ).sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
  const dayReservations = filtered.filter((item) => item.fecha === selectedDate);
  const groups = [...espacios, { id: "", nombre: "Sin espacio asignado" }]
    .filter((space) => (spaceFilter === "todos" || space.id === spaceFilter) &&
      (space.id !== "" || dayReservations.some((item) => !item.espacioId)));

  function openModal(reserva = null) {
    if (reserva && !canManageReservation(user, reserva)) {
      setSelectedDate(reserva.fecha);
      setMonth(reserva.fecha.slice(0, 7));
      return;
    }
    setMessage("");
    setModal({ reserva });
  }

  function handleSave(reserva) {
    saveReservation(reserva, modal.reserva?.id);
    setSelectedDate(reserva.fecha);
    setMonth(reserva.fecha.slice(0, 7));
    setMessage(modal.reserva ? "Reserva actualizada correctamente." : "Reserva creada correctamente.");
  }

  function handleDelete(reserva) {
    deleteReservation(reserva.id);
    setMessage("Reserva borrada correctamente.");
  }

  function navigateMonth(offset) {
    const next = shiftMonth(month, offset);
    setMonth(next);
    setSelectedDate(`${next}-01`);
  }

  return (
    <div className="calendar-page">
      <p className="dashboard-label">CALENDARIO</p>
      <h1>Calendario del estudio</h1>
      <p className="dashboard-description">Organiza las sesiones por día, horario y espacio. {user?.role === "tatuador" ? "Puedes editar tus propias reservas." : "Selecciona una reserva para editarla."}</p>
      <div className="calendar-toolbar">
        <div className="reservas-filters" role="group" aria-label="Filtros del calendario">
          <label>Espacio
            <select value={spaceFilter} onChange={(event) => setSpaceFilter(event.target.value)}>
              <option value="todos">Todos los espacios</option>
              {espacios.map((space) => <option key={space.id} value={space.id}>{space.nombre}</option>)}
            </select>
          </label>
          <label>Estado
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="todos">Todos los estados</option>
              {reservationStatuses.map(({ estado }) => <option key={estado}>{estado}</option>)}
            </select>
          </label>
        </div>
        <button type="button" className="reservation-button" onClick={() => openModal()}>Crear reserva</button>
      </div>
      {message && <p className="reservation-success" role="status">{message}</p>}
      <section className="calendar-month" aria-labelledby="calendar-month-title">
        <div className="calendar-month-header">
          <h2 id="calendar-month-title" aria-live="polite">{monthFormatter.format(new Date(`${month}-01T12:00:00Z`))}</h2>
          <div className="calendar-navigation">
            <button type="button" className="reservation-button reservation-button-secondary" onClick={() => navigateMonth(-1)} aria-label="Mes anterior">‹</button>
            <button type="button" className="reservation-button reservation-button-secondary" onClick={() => { setMonth(today.slice(0, 7)); setSelectedDate(today); }}>Hoy</button>
            <button type="button" className="reservation-button reservation-button-secondary" onClick={() => navigateMonth(1)} aria-label="Mes siguiente">›</button>
          </div>
        </div>
        <div className="calendar-scroll">
          <div className="calendar-grid">
            {weekdays.map((day) => <div className="calendar-weekday" key={day}>{day}</div>)}
            {monthDays(month).map(({ fecha, day, inMonth }) => {
              const events = filtered.filter((item) => item.fecha === fecha);
              return (
                <div className={`calendar-day${!inMonth ? " calendar-day-outside" : ""}${fecha === selectedDate ? " calendar-day-selected" : ""}`} key={fecha}>
                  <button type="button" className={`calendar-day-number${fecha === today ? " calendar-today" : ""}`} aria-pressed={fecha === selectedDate} aria-label={`${dayFormatter.format(new Date(`${fecha}T12:00:00Z`))}, ${events.length} reservas`} onClick={() => { setSelectedDate(fecha); setMonth(fecha.slice(0, 7)); }}>{day}</button>
                  {events.slice(0, 3).map((reserva) => (
                    <button type="button" className={`calendar-event ${reserva.estado.toLowerCase()}`} key={reserva.id} onClick={() => openModal(reserva)} title={`${reserva.tatuador} · ${reserva.horaInicio}–${reserva.horaFin} · ${reserva.estado}`}>
                      <span>{reserva.horaInicio}–{reserva.horaFin} · {reserva.espacioId ? `Esp. ${reserva.espacioId}` : "Sin espacio"}</span>
                      <strong>{reserva.tatuador}</strong>
                    </button>
                  ))}
                  {events.length > 3 && <button type="button" className="calendar-more" onClick={() => { setSelectedDate(fecha); setMonth(fecha.slice(0, 7)); }}>Ver {events.length - 3} más</button>}
                </div>
              );
            })}
          </div>
        </div>
        <div className="calendar-legend" aria-label="Estados de reservas">
          {reservationStatuses.map(({ estado }) => <span key={estado} className={`reserva-estado ${estado.toLowerCase()}`}>{estado}</span>)}
        </div>
      </section>
      <CalendarAgenda
        user={user}
        selectedDate={selectedDate}
        reservations={dayReservations}
        spaces={groups}
        onEdit={openModal}
        onDelete={(item) => { setMessage(""); setDeleting(item); }}
      />
      {modal && <ReservationModal user={user} reserva={modal.reserva} reservas={reservas} initialDate={selectedDate} initialSpace={spaceFilter === "todos" ? "" : spaceFilter} onSave={handleSave} onClose={() => setModal(null)} />}
      {deleting && <DeleteReservationModal reserva={deleting} onConfirm={handleDelete} onClose={() => setDeleting(null)} />}
    </div>
  );
}
