import { useState } from "react";
import { reservationStatuses } from "../data/reservationStatuses";
import useReservations from "../hooks/useReservations";
import ReservationModal from "../components/ReservationModal";
import DeleteReservationModal from "../components/DeleteReservationModal";
import ReservationDetailsModal from "../components/ReservationDetailsModal";
import CalendarAgenda from "../components/CalendarAgenda";
import CreateReservationButton from "../components/CreateReservationButton";
import LoadingScreen from "../components/LoadingScreen";
import { shiftDate, todayInSantiago, weekDays, weekLabel } from "../utils/calendar";
import { canManageReservation } from "../utils/access";
import { formatFullDate } from "../utils/format";
import "./Calendario.css";

import Notice from "../components/Notice";
const weekdays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export default function Calendario({ user }) {
  const today = todayInSantiago();
  const { sesiones, puestos, catalogos, loading, error, reload, saveReservation, deleteReservation, changeSessionStatus } = useReservations(user);
  const [selectedDate, setSelectedDate] = useState(today);
  const [spaceFilter, setSpaceFilter] = useState("todos");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [modal, setModal] = useState(null);
  // Id de la sesión abierta en el detalle: se muestra con los datos actuales (después de cambiar su estado).
  const [detailsId, setDetailsId] = useState(null);
  const details = detailsId ? sesiones.find((item) => item.id === detailsId) ?? null : null;
  const [deleting, setDeleting] = useState(null);
  const [message, setMessage] = useState("");
  const filtered = sesiones.filter((item) =>
    (spaceFilter === "todos" || item.puestoId === spaceFilter) &&
    (statusFilter === "todos" || item.estado === statusFilter)
  ).sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
  const dayReservations = filtered.filter((item) => item.fecha === selectedDate);
  const groups = puestos.filter((puesto) => spaceFilter === "todos" || puesto.id === spaceFilter);
  // La vista muestra la semana (lunes a domingo) del día seleccionado.
  const week = weekDays(selectedDate);

  // Al hacer clic en una sesión se abre primero su detalle (para todos los usuarios).
  function openDetails(sesion) {
    setMessage("");
    setDetailsId(sesion.id);
  }

  // Desde el detalle se pasa a editar la reserva completa con todas sus sesiones.
  function editFromDetails(sesion) {
    setDetailsId(null);
    openModal(sesion);
  }

  function openModal(sesion = null) {
    if (sesion && !canManageReservation(user, sesion)) {
      setSelectedDate(sesion.fecha);
      return;
    }
    setMessage("");
    setModal({ reserva: sesion?.reserva ?? null, fecha: sesion?.fecha });
  }

  async function handleSave(reserva) {
    await saveReservation(reserva, modal.reserva?.id);
    const fecha = modal.fecha && reserva.sesiones.some((item) => item.fecha === modal.fecha) ? modal.fecha : reserva.sesiones[0].fecha;
    setSelectedDate(fecha);
    setMessage(modal.reserva ? "Reserva actualizada correctamente." : "Reserva creada correctamente.");
  }

  async function handleDelete(reserva) {
    await deleteReservation(reserva.id);
    setMessage("Reserva borrada. Quedó en el Historial de Reservas, desde donde se puede restaurar.");
  }

  // Semana anterior o siguiente, manteniendo el mismo día de la semana seleccionado.
  function navigateWeek(offset) {
    setSelectedDate(shiftDate(selectedDate, offset * 7));
  }

  return (
    <div className="calendar-page">
      <h1>Calendario del estudio</h1>
      <p className="dashboard-description">Organiza las sesiones de la semana por día, horario y puesto. {user?.role === "tatuador" ? "Puedes editar tus propias reservas." : "Selecciona una reserva para editarla."}</p>
      <div className="calendar-toolbar">
        <div className="reservas-filters" role="group" aria-label="Filtros del calendario">
          <label>Puesto
            <select value={spaceFilter} onChange={(event) => setSpaceFilter(event.target.value)}>
              <option value="todos">Todos los puestos</option>
              {puestos.map((puesto) => <option key={puesto.id} value={puesto.id}>{puesto.nombre}</option>)}
            </select>
          </label>
          <label>Estado
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="todos">Todos los estados</option>
              {reservationStatuses.map(({ estado }) => <option key={estado}>{estado}</option>)}
            </select>
          </label>
        </div>
        <CreateReservationButton disabled={loading || Boolean(error)} onClick={() => openModal()} />
      </div>
      {message && <Notice tone="ok">{message}</Notice>}
      {loading && <LoadingScreen message="Cargando reservas y puestos…" />}
      {error && <Notice tone="danger" action={<button type="button" className="reservation-button reservation-button-secondary" onClick={reload}>Reintentar</button>}>{error}</Notice>}
      {!loading && !error && <>
      <section className="calendar-month calendar-week" aria-labelledby="calendar-month-title">
        <div className="calendar-month-header">
          <h2 id="calendar-month-title" aria-live="polite">{weekLabel(week)}</h2>
          <div className="calendar-navigation">
            <button type="button" className="reservation-button reservation-button-secondary" onClick={() => navigateWeek(-1)} aria-label="Semana anterior">‹</button>
            <button type="button" className="reservation-button reservation-button-secondary" onClick={() => setSelectedDate(today)}>Hoy</button>
            <button type="button" className="reservation-button reservation-button-secondary" onClick={() => navigateWeek(1)} aria-label="Semana siguiente">›</button>
          </div>
        </div>
        <div className="calendar-scroll">
          <div className="calendar-grid">
            {weekdays.map((day) => <div className="calendar-weekday" key={day}>{day}</div>)}
            {week.map(({ fecha, day }) => {
              const events = filtered.filter((item) => item.fecha === fecha);
              return (
                <div className={`calendar-day${fecha === selectedDate ? " calendar-day-selected" : ""}`} key={fecha}>
                  <button type="button" className={`calendar-day-number${fecha === today ? " calendar-today" : ""}`} aria-pressed={fecha === selectedDate} aria-label={`${formatFullDate(fecha)}, ${events.length} sesiones`} onClick={() => setSelectedDate(fecha)}>{day}</button>
                  {/* En la vista semanal hay espacio para mostrar todas las sesiones del día */}
                  {events.map((sesion) => (
                    <button type="button" className={`calendar-event ${sesion.estado.toLowerCase()}`} key={sesion.id} onClick={() => openDetails(sesion)} title={`${sesion.tatuador} · ${sesion.puesto} · ${sesion.horaInicio}–${sesion.horaFin} · ${sesion.estado}${sesion.total > 1 ? ` · sesión ${sesion.numero} de ${sesion.total}` : ""}`}>
                      <span>{sesion.horaInicio}–{sesion.horaFin} · {sesion.puesto}</span>
                      <strong>{sesion.tatuador}</strong>
                    </button>
                  ))}
                  {events.length === 0 && <p className="calendar-day-empty">Sin sesiones</p>}
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
        sessions={dayReservations}
        puestos={groups}
        onView={openDetails}
        onDelete={(item) => { setMessage(""); setDeleting(item.reserva); }}
      />
      </>}
      {modal && <ReservationModal catalogos={catalogos} puestos={puestos} user={user} reserva={modal.reserva} sesiones={sesiones} initialDate={selectedDate} initialPuesto={spaceFilter === "todos" ? "" : spaceFilter} onSave={handleSave} onClose={() => setModal(null)} />}
      {details && <ReservationDetailsModal sesion={details} canManage={canManageReservation(user, details)} onEdit={editFromDetails} onChangeStatus={(reserva, sesionId, estado) => changeSessionStatus(reserva.id, sesionId, estado)} onClose={() => setDetailsId(null)} />}
      {deleting && <DeleteReservationModal reserva={deleting} onConfirm={handleDelete} onClose={() => setDeleting(null)} />}
    </div>
  );
}
