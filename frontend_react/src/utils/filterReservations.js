import { reservationStatus } from "./sessions.js";
import { normalizeRut } from "./rut.js";

// Ignora mayúsculas y tildes: "jose" encuentra "José".
function plain(value) {
  return String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es-CL");
}

// Filtros del listado de Reservas:
// - busqueda: nombre del cliente o del tatuador, o RUT del cliente (con o sin puntos y guion);
// - fecha: "YYYY-MM-DD", la reserva coincide si tiene una sesión ese día;
// - estado: estado de la reserva (resumen de sus sesiones) o "todos".
export const emptyReservationFilters = { busqueda: "", fecha: "", estado: "todos" };

export function filterReservationList(reservas, { busqueda = "", fecha = "", estado = "todos" } = {}) {
  const query = plain(busqueda.trim());
  // Si la búsqueda tiene números, también se compara con el RUT: "12.345.678-5", "12345678" o "678-5".
  const rut = /\d/.test(busqueda) ? normalizeRut(busqueda) : "";
  return reservas.filter((reserva) => {
    if (estado !== "todos" && reservationStatus(reserva) !== estado) return false;
    if (fecha && !(reserva.sesiones ?? []).some((sesion) => sesion.fecha === fecha)) return false;
    if (query && ![reserva.cliente, reserva.tatuador].some((nombre) => plain(nombre).includes(query))
      && !(rut && normalizeRut(reserva.clienteRut).includes(rut))) return false;
    return true;
  });
}
