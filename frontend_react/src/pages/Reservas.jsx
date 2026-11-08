import { useState } from "react";
import useReservations from "../hooks/useReservations";
import ConfirmModal from "../components/ConfirmModal";
import CreateReservationButton from "../components/CreateReservationButton";
import DeleteReservationModal from "../components/DeleteReservationModal";
import LoadingScreen from "../components/LoadingScreen";
import PuestoTipoBadge from "../components/PuestoTipoBadge";
import ReservationCard from "../components/ReservationCard";
import ReservationDetailsModal from "../components/ReservationDetailsModal";
import ReservationModal from "../components/ReservationModal";
import { reservationStatuses } from "../data/reservationStatuses";
import { canManageReservation, ownsReservation } from "../utils/access";
import { todayInSantiago } from "../utils/calendar";
import { emptyReservationFilters, filterReservationList } from "../utils/filterReservations";
import { puestoNumber } from "../utils/puestos";
import { reservationStatus } from "../utils/sessions";
import "./Reservas.css";

const pageSize = 10;

// Reservas (admin, todas) y Mis reservas (tatuador, personal = true).
// Dos pestañas: las reservas en la agenda y el Historial (las borradas, que se pueden restaurar).
export default function Reservas({ user, personal = false }) {
  const {
    reservas, archivadas, sesiones, puestos, catalogos, loading, error, reload,
    saveReservation: persistReservation, deleteReservation: removeReservation,
    restoreReservation, changeSessionStatus: persistSessionStatus,
  } = useReservations(user);
  const [tab, setTab] = useState("agenda");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingReservation, setEditingReservation] = useState(null);
  const [deletingReservation, setDeletingReservation] = useState(null);
  // Solo el id: el detalle siempre muestra los datos actuales (después de un cambio o una recarga).
  const [viewingId, setViewingId] = useState(null);
  const [message, setMessage] = useState("");
  const [restoreError, setRestoreError] = useState("");
  const [filters, setFilters] = useState(emptyReservationFilters);
  const [page, setPage] = useState(1);

  const today = todayInSantiago();
  const historial = tab === "historial";
  const scoped = (rows) => personal ? rows.filter((reserva) => ownsReservation(user, reserva)) : rows;
  const scopedReservations = scoped(historial ? archivadas : reservas);
  const viewingReservation = viewingId ? [...reservas, ...archivadas].find((item) => item.id === viewingId) ?? null : null;
  const filteredReservations = filterReservationList(scopedReservations, filters);
  const hasFilters = filters.busqueda.trim() !== "" || filters.fecha !== "" || filters.estado !== "todos";
  const totalPages = Math.max(1, Math.ceil(filteredReservations.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const visibleReservations = filteredReservations.slice(pageStart, pageStart + pageSize);

  function changeTab(next) {
    setTab(next);
    setPage(1);
    setMessage("");
  }

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
    setPage(1);
  }

  function clearFilters() {
    setFilters(emptyReservationFilters);
    setPage(1);
  }

  function openReservationModal(reserva = null) {
    setMessage("");
    setEditingReservation(reserva);
    setModalOpen(true);
  }

  function editFromDetails(reserva) {
    setViewingId(null);
    openReservationModal(reserva);
  }

  function requestDelete(reserva) {
    setMessage("");
    setDeletingReservation(reserva);
  }

  // Menú de estado de la tarjeta y botones del detalle: guarda el estado de una sesión. Si falla, se muestra ahí.
  async function changeSessionStatus(reserva, sesionId, estado) {
    setMessage("");
    await persistSessionStatus(reserva.id, sesionId, estado);
  }

  // Restaurar: la reserva vuelve a la agenda (falla si una de sus sesiones choca con otra reserva).
  async function restore(reserva) {
    setMessage("");
    try {
      await restoreReservation(reserva.id);
      setViewingId(null);
      setMessage(`La reserva de ${reserva.cliente} volvió a la agenda.`);
    } catch (cause) {
      setRestoreError(cause instanceof Error ? cause.message : "No se pudo restaurar la reserva.");
    }
  }

  async function saveReservation(reserva) {
    await persistReservation(reserva, editingReservation?.id);
    if (!editingReservation) setPage(1);
    setMessage(editingReservation ? "Reserva actualizada correctamente." : "Reserva creada correctamente.");
  }

  async function deleteReservation(reserva) {
    const updated = reservas.filter((item) => item.id !== reserva.id);
    await removeReservation(reserva.id);
    const remaining = filterReservationList(scoped(updated), filters).length;
    setPage(Math.min(currentPage, Math.max(1, Math.ceil(remaining / pageSize))));
    setMessage("Reserva borrada. Quedó en el Historial, desde donde se puede restaurar.");
  }

  return (
    <div className="reservas-page">
      <div className="reservas-header">
        <p className="reservas-label">RESERVAS</p>
        <h1>{personal ? "Mis reservas" : "Reservas"}</h1>
        <p className="reservas-description">
          {personal ? "Consulta y gestiona tus reservas en el estudio." : "Visualiza las reservas actualmente registradas."}
        </p>
      </div>

      {loading && <LoadingScreen message="Cargando reservas y puestos…" />}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button type="button" className="reservation-button" onClick={reload}>Reintentar</button>
        </div>
      )}

      {!loading && !error && <>
        <div className="reservas-tabs" role="tablist" aria-label="Reservas en la agenda o en el historial">
          <button type="button" role="tab" id="tab-agenda" aria-selected={!historial} aria-controls="reservas-panel" className={`reservas-tab${historial ? "" : " reservas-tab-active"}`} onClick={() => changeTab("agenda")}>
            {personal ? "Mis reservas" : "Reservas"} <span className="reservas-tab-count">{scoped(reservas).length}</span>
          </button>
          <button type="button" role="tab" id="tab-historial" aria-selected={historial} aria-controls="reservas-panel" className={`reservas-tab${historial ? " reservas-tab-active" : ""}`} onClick={() => changeTab("historial")}>
            Historial <span className="reservas-tab-count">{scoped(archivadas).length}</span>
          </button>
        </div>

        <div id="reservas-panel" role="tabpanel" aria-labelledby={historial ? "tab-historial" : "tab-agenda"} className="reservas-panel">
        {historial && <p className="reservas-historial-note">Reservas borradas. No ocupan puestos ni aparecen en la agenda; puedes buscarlas por cliente, RUT o tatuador y restaurarlas.</p>}

        {/* Resumen según los filtros aplicados */}
        <section className="reservas-kpis" aria-label="Resumen de reservas filtradas" aria-live="polite">
          <article className="reserva-kpi total">
            <p className="reserva-kpi-label">Total de reservas</p>
            <p className="reserva-kpi-value">{filteredReservations.length}</p>
          </article>
          {reservationStatuses.map(({ estado, etiqueta }) => (
            <article className={`reserva-kpi ${estado.toLowerCase()}`} key={estado}>
              <p className="reserva-kpi-label">{etiqueta}</p>
              <p className="reserva-kpi-value">
                {filteredReservations.filter((reserva) => reservationStatus(reserva) === estado).length}
              </p>
            </article>
          ))}
        </section>

        {/* Ocupación de hoy por puesto */}
        {!historial && <section className="reservas-espacios" aria-labelledby="reservas-puestos-title">
          <h2 id="reservas-puestos-title">Puestos del estudio</h2>
          <p className="reservas-ocupacion-note">Sesiones activas agendadas para hoy en cada puesto. Cada puesto atiende una sesión a la vez.</p>
          <div className="reservas-espacios-grid" aria-live="polite">
            {puestos.map((puesto) => {
              const hoy = sesiones.filter((item) => item.puestoId === puesto.id && item.fecha === today && item.estado !== "Cancelada").length;
              return (
                <article className={`reserva-espacio-card puesto-numero-fondo${puesto.disponible ? "" : " reserva-espacio-full"}`} data-numero={puestoNumber(puesto.nombre)} key={puesto.id}>
                  <h3>{puesto.nombre}</h3>
                  <PuestoTipoBadge tipo={puesto.tipo} />
                  <p>Sesiones hoy</p>
                  <strong>{hoy}</strong>
                  <p className="reserva-espacio-availability">{puesto.estado}</p>
                </article>
              );
            })}
          </div>
        </section>}

        {message && <p className="reservation-success" role="status">{message}</p>}

        {/* Encima del listado: "Crear reserva" a la izquierda y los filtros a su lado; debajo, el conteo */}
        <div className="reservas-list-header">
          {!historial && <CreateReservationButton onClick={() => openReservationModal()} />}
          <div className="reservas-filters" role="search" aria-label="Filtros de reservas">
            <label className="reservas-filter-search">Buscar
              <input type="search" value={filters.busqueda} onChange={(event) => updateFilter("busqueda", event.target.value)} placeholder="Cliente, RUT o tatuador" />
            </label>
            <label>Fecha
              <input type="date" value={filters.fecha} onChange={(event) => updateFilter("fecha", event.target.value)} />
            </label>
            <label>Estado
              <select value={filters.estado} onChange={(event) => updateFilter("estado", event.target.value)}>
                <option value="todos">Todos</option>
                {reservationStatuses.map(({ estado }) => <option key={estado} value={estado}>{estado}</option>)}
              </select>
            </label>
            <button type="button" className="reservation-button reservation-button-secondary reservas-filters-clear" onClick={clearFilters} disabled={!hasFilters}>Limpiar filtros</button>
          </div>
        </div>
        <div className="reservas-list-meta">
          <p className="reservas-results" role="status">
            Mostrando {filteredReservations.length === 0 ? 0 : pageStart + 1}–{pageStart + visibleReservations.length} de {filteredReservations.length} reservas
            {filteredReservations.length !== scopedReservations.length ? ` (${scopedReservations.length} en total)` : ""}
          </p>
        </div>

        <section className="reservas-container">
          {visibleReservations.map((reserva) => (
            <ReservationCard key={reserva.id} reserva={reserva} onChangeStatus={changeSessionStatus} onView={(item) => setViewingId(item.id)} onEdit={openReservationModal} onDelete={requestDelete} onRestore={restore} />
          ))}
          {filteredReservations.length === 0 && (
            <p className="empty-state">
              {scopedReservations.length === 0
                ? historial ? "No hay reservas borradas." : "No hay reservas registradas."
                : "No hay reservas que coincidan con los filtros seleccionados."}
            </p>
          )}
        </section>

        {totalPages > 1 && (
          <nav className="reservas-pagination" aria-label="Paginación de reservas">
            <button type="button" className="reservation-button reservation-button-secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Anterior</button>
            <span aria-live="polite">Página {currentPage} de {totalPages}</span>
            <button type="button" className="reservation-button reservation-button-secondary" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>Siguiente</button>
          </nav>
        )}
        </div>
      </>}

      {modalOpen && <ReservationModal catalogos={catalogos} puestos={puestos} user={user} reserva={editingReservation} sesiones={sesiones} onSave={saveReservation} onClose={() => setModalOpen(false)} />}
      {viewingReservation && <ReservationDetailsModal reserva={viewingReservation} canManage={canManageReservation(user, viewingReservation)} onEdit={editFromDetails} onChangeStatus={changeSessionStatus} onRestore={restore} onClose={() => setViewingId(null)} />}
      {restoreError && <ConfirmModal title="No se pudo restaurar" message={restoreError} confirmLabel="Entendido" hideCancel onResult={() => setRestoreError("")} />}
      {deletingReservation && <DeleteReservationModal reserva={deletingReservation} onConfirm={deleteReservation} onClose={() => setDeletingReservation(null)} />}
    </div>
  );
}
