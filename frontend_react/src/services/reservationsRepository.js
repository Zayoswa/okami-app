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
  remove: (_user, id) => authRequest(`${path}/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
