import { loadReservations, storeReservations } from "../utils/reservationStorage.js";
import { saveReservationInList, deleteReservationFromList } from "../utils/reservationActions.js";

// Contrato asíncrono compartido con el futuro repositorio remoto.
// Las mutaciones leen el último snapshot y devuelven la lista solo si se guardó.
export function createLocalReservationsRepository(storage) {
  return {
    async list() {
      return loadReservations(storage);
    },
    async save(user, reservation, editingId) {
      const updated = saveReservationInList(loadReservations(storage), user, reservation, editingId);
      storeReservations(updated, storage);
      return updated;
    },
    async remove(user, id) {
      const updated = deleteReservationFromList(loadReservations(storage), user, id);
      storeReservations(updated, storage);
      return updated;
    },
  };
}
