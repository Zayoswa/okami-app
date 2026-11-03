import { useEffect, useState } from "react";
import { authRequest } from "../services/authService.js";
import { reservationsRepository } from "../services/reservationsRepository.js";

export default function useReservations(user, repository = reservationsRepository) {
  const [catalogos, setCatalogos] = useState({ clientes: [], tatuadores: [] });
  const [espacios, setEspacios] = useState([]);
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [rows, spaces, catalogs] = await Promise.all([repository.list(user), authRequest("/api/espacios"), repository.catalogs()]);
        if (!spaces.length) throw new Error("No hay espacios configurados en el estudio.");
        if (active) { setReservas(rows); setEspacios(spaces); setCatalogos(catalogs); }
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
    await repository.save(user, reserva, editingId, espacios);
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

  return { reservas, espacios, catalogos, loading, error, reload, saveReservation, deleteReservation };
}
