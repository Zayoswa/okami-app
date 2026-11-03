import { useEffect, useState } from "react";
import { reservationsRepository } from "../services/reservationsRepository.js";

export default function useReservations(user, repository = reservationsRepository) {
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const rows = await repository.list(user);
        if (active) setReservas(rows);
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
    const updated = await repository.save(user, reserva, editingId);
    setReservas(updated);
  }

  async function deleteReservation(id) {
    const updated = await repository.remove(user, id);
    setReservas(updated);
  }

  return { reservas, loading, error, reload, saveReservation, deleteReservation };
}
