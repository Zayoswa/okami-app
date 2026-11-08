import { authRequest } from "./authService.js";
const path = "/api/reservas";
export const reservationsRepository = {
  list: () => authRequest(path),
  catalogs: () => authRequest(`${path}/catalogos`),
  puestos: () => authRequest("/api/puestos"),
  save(_user, candidate, editingId) {
    const editing = editingId !== undefined;
    return authRequest(editing ? `${path}/${encodeURIComponent(editingId)}` : path, {
      method: editing ? "PATCH" : "POST",
      body: JSON.stringify({
        ...candidate,
        sesiones: candidate.sesiones.map(({ id, puestoId, fecha, horaInicio, horaFin, estado }) => ({
          id, puestoId: Number(puestoId), fecha, horaInicio, horaFin, estado,
        })),
      }),
    });
  },
  // Borrar archiva la reserva (pasa al historial); restaurar la devuelve a la agenda.
  remove: (_user, id) => authRequest(`${path}/${encodeURIComponent(id)}`, { method: "DELETE" }),
  restore: (_user, id) => authRequest(`${path}/${encodeURIComponent(id)}/restaurar`, { method: "POST" }),
  // Cambia el estado de una sola sesión.
  setSessionStatus: (_user, reservaId, sesionId, estado) => authRequest(
    `${path}/${encodeURIComponent(reservaId)}/sesiones/${encodeURIComponent(sesionId)}`,
    { method: "PATCH", body: JSON.stringify({ estado }) },
  ),
};
