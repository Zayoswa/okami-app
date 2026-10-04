import { useState } from "react";
import useReservations from "../hooks/useReservations";
import espacios from "../data/espacios.json";
import ReservationCard from "../components/ReservationCard";
import CreateReservationButton from "../components/CreateReservationButton";
import "./Reservas.css";
import ReservationModal from "../components/ReservationModal";
import DeleteReservationModal from "../components/DeleteReservationModal";
import { filterReservations } from "../utils/filterReservations";
import { pendingSpaceOccupancy } from "../utils/spaceOccupancy";
import { reservationStatuses } from "../data/reservationStatuses";
import { ownsReservation } from "../utils/access";

const pageSize = 7;

export default function Reservas({ user, personal = false }) {
    const { reservas, saveReservation: persistReservation, deleteReservation: removeReservation } = useReservations(user);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingReservation, setEditingReservation] = useState(null);
    const [deletingReservation, setDeletingReservation] = useState(null);
    const [message, setMessage] = useState("");
    const [estadoFilter, setEstadoFilter] = useState("todos");
    const [fechaFilter, setFechaFilter] = useState("todas");
    const [page, setPage] = useState(1);
    const scopedReservations = personal ? reservas.filter((reserva) => ownsReservation(user, reserva)) : reservas;
    const filteredReservations = filterReservations(scopedReservations, estadoFilter, fechaFilter);
    const totalPages = Math.max(1, Math.ceil(filteredReservations.length / pageSize));
    const currentPage = Math.min(page, totalPages);
    const pageStart = (currentPage - 1) * pageSize;
    const visibleReservations = filteredReservations.slice(pageStart, pageStart + pageSize);

    function saveReservation(reserva) {
        persistReservation(reserva, editingReservation?.id);
        if (!editingReservation) setPage(1);
        setMessage(editingReservation ? "Reserva actualizada correctamente." : "Reserva creada correctamente.");
    }

    function openReservationModal(reserva = null) {
        setMessage("");
        setEditingReservation(reserva);
        setModalOpen(true);
    }

    function deleteReservation(reserva) {
        const updated = reservas.filter((item) => item.id !== reserva.id);
        removeReservation(reserva.id);
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

            <h1>{personal ? "Mis Reservas" : "Reservas del estudio"}</h1>

            <p className="reservas-description">
            {personal ? "Consulta y gestiona tus reservas en el estudio." : "Visualiza las reservas actualmente registradas."}
            </p>

            <div className="reservas-toolbar">
                <div className="reservas-filters" role="group" aria-label="Filtros de reservas">
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
                </div>
                <CreateReservationButton onClick={() => openReservationModal()} />
            </div>
        </div>

        <section className="reservas-kpis" aria-label="Resumen de reservas filtradas" aria-live="polite">
            <article className="reserva-kpi total">
                <p className="reserva-kpi-label">Total de reservas</p>
                <p className="reserva-kpi-value">{filteredReservations.length}</p>
            </article>
            {reservationStatuses.map(({ estado, etiqueta }) => (
                <article className={`reserva-kpi ${estado.toLowerCase()}`} key={estado}>
                    <p className="reserva-kpi-label">{etiqueta}</p>
                    <p className="reserva-kpi-value">
                        {filteredReservations.filter((reserva) => reserva.estado === estado).length}
                    </p>
                </article>
            ))}
        </section>

        <section className="reservas-espacios" aria-labelledby="reservas-espacios-title">
            <h2 id="reservas-espacios-title">Espacios del estudio</h2>
            <p className="reservas-ocupacion-note">Reservas pendientes por espacio. Se actualizan automáticamente al crear, editar o borrar reservas.</p>
            <div className="reservas-espacios-grid" aria-live="polite">
                {espacios.map((espacio) => {
                    const ocupados = pendingSpaceOccupancy(reservas, espacio.id);
                    const lleno = ocupados >= espacio.capacidadMaxima;
                    return <article className={`reserva-espacio-card${lleno ? " reserva-espacio-full" : ""}`} key={espacio.id}>
                        <h3>{espacio.nombre}</h3>
                        <p>Reservas pendientes / capacidad</p>
                        <strong aria-label={`${ocupados} reservas pendientes, capacidad ${espacio.capacidadMaxima}`}>{ocupados}/{espacio.capacidadMaxima}</strong>
                        <p className="reserva-espacio-availability">{lleno ? "Lleno" : "Disponible"}</p>
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
        {modalOpen && <ReservationModal user={user} reserva={editingReservation} reservas={reservas} onSave={saveReservation} onClose={() => setModalOpen(false)} />}
        {deletingReservation && <DeleteReservationModal reserva={deletingReservation} onConfirm={deleteReservation} onClose={() => setDeletingReservation(null)} />}
        </div>
    );
    }
