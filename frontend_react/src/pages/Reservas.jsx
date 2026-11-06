import { useState } from "react";
import useReservations from "../hooks/useReservations";
import ReservationCard from "../components/ReservationCard";
import CreateReservationButton from "../components/CreateReservationButton";
import LoadingScreen from "../components/LoadingScreen";
import "./Reservas.css";
import ReservationModal from "../components/ReservationModal";
import DeleteReservationModal from "../components/DeleteReservationModal";
import { filterReservations, filterReservationsByCustomer } from "../utils/filterReservations";
import { reservationStatus } from "../utils/sessions";
import { todayInSantiago } from "../utils/calendar";
import { reservationStatuses } from "../data/reservationStatuses";
import { ownsReservation } from "../utils/access";
import { puestoNumber } from "../utils/puestos";

const pageSize = 10;

export default function Reservas({ user, personal = false }) {
    const { reservas, sesiones, puestos, catalogos, loading, error, reload, saveReservation: persistReservation, deleteReservation: removeReservation } = useReservations(user);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingReservation, setEditingReservation] = useState(null);
    const [deletingReservation, setDeletingReservation] = useState(null);
    const [message, setMessage] = useState("");
    const [estadoFilter, setEstadoFilter] = useState("todos");
    const [fechaFilter, setFechaFilter] = useState("todas");
    const [clienteFilter, setClienteFilter] = useState("");
    const [page, setPage] = useState(1);
    const today = todayInSantiago();
    const scopedReservations = personal ? reservas.filter((reserva) => ownsReservation(user, reserva)) : reservas;
    const filteredReservations = filterReservationsByCustomer(
        filterReservations(scopedReservations, estadoFilter, fechaFilter), clienteFilter,
    );
    const totalPages = Math.max(1, Math.ceil(filteredReservations.length / pageSize));
    const currentPage = Math.min(page, totalPages);
    const pageStart = (currentPage - 1) * pageSize;
    const visibleReservations = filteredReservations.slice(pageStart, pageStart + pageSize);

    async function saveReservation(reserva) {
        await persistReservation(reserva, editingReservation?.id);
        if (!editingReservation) setPage(1);
        setMessage(editingReservation ? "Reserva actualizada correctamente." : "Reserva creada correctamente.");
    }

    function openReservationModal(reserva = null) {
        setMessage("");
        setEditingReservation(reserva);
        setModalOpen(true);
    }

    async function deleteReservation(reserva) {
        const updated = reservas.filter((item) => item.id !== reserva.id);
        await removeReservation(reserva.id);
        const remaining = filterReservations(personal ? updated.filter((item) => ownsReservation(user, item)) : updated, estadoFilter, fechaFilter).length;
        setPage(Math.min(currentPage, Math.max(1, Math.ceil(remaining / pageSize))));
        setMessage("Reserva borrada correctamente.");
    }

    function requestDelete(reserva) {
        setMessage("");
        setDeletingReservation(reserva);
    }

    return (
        <div className="reservas-page">
        <div className="reservas-header">
            <p className="reservas-label">RESERVAS</p>

            <h1>{personal ? "Mis reservas" : "Reservas del estudio"}</h1>

            <p className="reservas-description">
            {personal ? "Consulta y gestiona tus reservas en el estudio." : "Visualiza las reservas actualmente registradas."}
            </p>

            <div className="reservas-toolbar">
                {/* Los filtros solo aparecen en Mis reservas; Reservas Generales muestra todo. */}
                {personal && <div className="reservas-filters" role="group" aria-label="Filtros de reservas">
                    <label>Estado
                        <select value={estadoFilter} onChange={(event) => { setEstadoFilter(event.target.value); setPage(1); }}>
                            <option value="todos">Todos los estados</option>
                            {reservationStatuses.map(({ estado }) => <option key={estado} value={estado}>{estado}</option>)}
                        </select>
                    </label>
                    <label>Fecha de la reserva
                        <select value={fechaFilter} onChange={(event) => { setFechaFilter(event.target.value); setPage(1); }}>
                            <option value="todas">Todas las fechas</option>
                            <option value="hoy">Hoy</option>
                            <option value="semana">Últimos 7 días</option>
                            <option value="mes">Mes actual</option>
                        </select>
                    </label>
                    <label>Cliente
                        <input type="search" value={clienteFilter} onChange={(event) => { setClienteFilter(event.target.value); setPage(1); }} placeholder="Buscar por cliente" />
                    </label>
                </div>}
                <CreateReservationButton disabled={loading || Boolean(error)} onClick={() => openReservationModal()} />
            </div>
        </div>

        {loading && <LoadingScreen message="Cargando reservas y puestos…" />}
        {error && <div role="alert"><p>{error}</p><button type="button" className="reservation-button" onClick={reload}>Reintentar</button></div>}
        {!loading && !error && <>
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

        <section className="reservas-espacios" aria-labelledby="reservas-puestos-title">
            <h2 id="reservas-puestos-title">Puestos del estudio</h2>
            <p className="reservas-ocupacion-note">Sesiones activas agendadas para hoy en cada puesto. Cada puesto atiende una sesión a la vez.</p>
            <div className="reservas-espacios-grid" aria-live="polite">
                {puestos.map((puesto) => {
                    const hoy = sesiones.filter((item) => item.puestoId === puesto.id && item.fecha === today && item.estado !== "Cancelado").length;
                    return <article className={`reserva-espacio-card puesto-numero-fondo${puesto.disponible ? "" : " reserva-espacio-full"}`} data-numero={puestoNumber(puesto.nombre)} key={puesto.id}>
                        <h3>{puesto.nombre}</h3>
                        <p>Sesiones hoy</p>
                        <strong>{hoy}</strong>
                        <p className="reserva-espacio-availability">{puesto.estado}</p>
                    </article>;
                })}
            </div>
        </section>

        {message && <p className="reservation-success" role="status">{message}</p>}
        <p className="reservas-results" role="status">
            Mostrando {filteredReservations.length === 0 ? 0 : pageStart + 1}–{pageStart + visibleReservations.length} de {filteredReservations.length} reservas{filteredReservations.length !== scopedReservations.length ? ` (${scopedReservations.length} en total)` : ""}
        </p>
        <section className="reservas-container">
            {visibleReservations.map((reserva) => (
            <ReservationCard key={reserva.id} reserva={reserva} onEdit={openReservationModal} onDelete={requestDelete} />
            ))}
            {filteredReservations.length === 0 && <p className="empty-state">{scopedReservations.length === 0 ? "No hay reservas registradas." : "No hay reservas que coincidan con los filtros seleccionados."}</p>}
        </section>
        {totalPages > 1 && (
            <nav className="reservas-pagination" aria-label="Paginación de reservas">
                <button type="button" className="reservation-button reservation-button-secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Anterior</button>
                <span aria-live="polite">Página {currentPage} de {totalPages}</span>
                <button type="button" className="reservation-button reservation-button-secondary" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>Siguiente</button>
            </nav>
        )}
        </>}
        {modalOpen && <ReservationModal catalogos={catalogos} puestos={puestos} user={user} reserva={editingReservation} sesiones={sesiones} onSave={saveReservation} onClose={() => setModalOpen(false)} />}
        {deletingReservation && <DeleteReservationModal reserva={deletingReservation} onConfirm={deleteReservation} onClose={() => setDeletingReservation(null)} />}
        </div>
    );
    }
