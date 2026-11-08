import { useEffect, useMemo, useState } from "react";
import { reservationsRepository } from "../services/reservationsRepository.js";
import { flattenSessions, isArchived } from "../utils/sessions.js";
import useAutoRefresh from "./useAutoRefresh.js";

// Datos compartidos por Reservas, Mis reservas, Calendario y Dashboard: reservas, puestos y tatuadores.
// - reservas: las que siguen en la agenda; sesiones: sus sesiones en una lista plana.
// - archivadas: las borradas, que quedan en el historial (solo las ve el admin o su tatuador).
// Carga al abrir el módulo, recarga después de cada cambio propio y, en segundo plano,
// cada minuto y al volver a la pestaña, para mostrar lo que cambian otras personas.
export default function useReservations(user, repository = reservationsRepository) {
  const [catalogos, setCatalogos] = useState({ tatuadores: [] });
  const [puestos, setPuestos] = useState([]);
  const [todas, setTodas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [rows, stations, catalogs] = await Promise.all([repository.list(user), repository.puestos(), repository.catalogs()]);
        if (!stations.length) throw new Error("No hay puestos configurados en el estudio.");
        if (active) { setTodas(rows); setPuestos(stations); setCatalogos(catalogs); }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "No se pudieron cargar las reservas.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [repository, user, attempt]);

  function reload() {
    setLoading(true);
    setError("");
    setAttempt((value) => value + 1);
  }

  async function saveReservation(reserva, editingId) {
    await repository.save(user, reserva, editingId);
    await refreshAfterMutation();
  }

  async function deleteReservation(id) {
    await repository.remove(user, id);
    await refreshAfterMutation();
  }

  async function restoreReservation(id) {
    await repository.restore(user, id);
    await refreshAfterMutation();
  }

  async function changeSessionStatus(reservaId, sesionId, estado) {
    await repository.setSessionStatus(user, reservaId, sesionId, estado);
    await refreshAfterMutation();
  }

  async function refreshAfterMutation() {
    try { setTodas(await repository.list(user)); }
    catch { setError("El cambio se guardó, pero no se pudo actualizar la agenda. Pulsa Reintentar."); }
  }

  // Recarga en segundo plano: reservas y puestos (estado, tipo, titulares). Sin pantalla de carga.
  useAutoRefresh(async () => {
    const [rows, stations] = await Promise.all([repository.list(user), repository.puestos()]);
    setTodas(rows);
    if (stations.length) setPuestos(stations);
  }, { enabled: !loading && !error });

  const reservas = useMemo(() => todas.filter((reserva) => !isArchived(reserva)), [todas]);
  const archivadas = useMemo(() => todas.filter(isArchived), [todas]);
  const sesiones = useMemo(() => flattenSessions(reservas), [reservas]);

  return {
    reservas, archivadas, sesiones, puestos, catalogos, loading, error, reload,
    saveReservation, deleteReservation, restoreReservation, changeSessionStatus,
  };
}
