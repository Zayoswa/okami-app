import { useEffect, useMemo, useState } from "react";
import { reservationsRepository } from "../services/reservationsRepository.js";
import { flattenSessions } from "../utils/sessions.js";

export default function useReservations(user, repository = reservationsRepository) {
  const [catalogos, setCatalogos] = useState({ tatuadores: [] });
  const [puestos, setPuestos] = useState([]);
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [rows, stations, catalogs] = await Promise.all([repository.list(user), repository.puestos(), repository.catalogs()]);
        if (!stations.length) throw new Error("No hay puestos configurados en el estudio.");
        if (active) { setReservas(rows); setPuestos(stations); setCatalogos(catalogs); }
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

  async function refreshAfterMutation() {
    try { setReservas(await repository.list(user)); }
    catch { setError("El cambio se guardó, pero no se pudo actualizar la agenda. Pulsa Reintentar."); }
  }

  const sesiones = useMemo(() => flattenSessions(reservas), [reservas]);

  return { reservas, sesiones, puestos, catalogos, loading, error, reload, saveReservation, deleteReservation };
}
