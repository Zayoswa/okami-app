import { createLocalReservationsRepository } from "./localReservationsRepository.js";

// Punto de composición: sustituir aquí por un adaptador remoto cuando exista
// el contrato del backend. No mezclar una conexión fallida con datos locales.
export const reservationsRepository = createLocalReservationsRepository();
