import { useState } from "react";
import { loadReservations, storeReservations } from "../utils/reservationStorage";
import { saveReservationInList, deleteReservationFromList } from "../utils/reservationActions";

export default function useReservations(user) {
  const [reservas, setReservas] = useState(loadReservations);

  function persist(updated) {
    storeReservations(updated);
    setReservas(updated);
  }

  function saveReservation(reserva, editingId) {
    persist(saveReservationInList(reservas, user, reserva, editingId));
  }

  function deleteReservation(id) {
    persist(deleteReservationFromList(reservas, user, id));
  }

  return { reservas, saveReservation, deleteReservation };
}
