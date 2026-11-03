import { authRequest } from "./authService.js";
const path = "/api/reservas";
export const reservationsRepository = {
  list: () => authRequest(path),
  catalogs: () => authRequest(`${path}/catalogos`),
  save(_user, candidate, editingId, spaces) {
    const space = spaces.find(({ id }) => id === candidate.espacioId);
    if (!space) throw new Error("Selecciona un espacio válido.");
    const editing = editingId !== undefined;
    return authRequest(editing ? `${path}/${encodeURIComponent(editingId)}` : path, {
      method: editing ? "PATCH" : "POST",
      body: JSON.stringify({ ...candidate, espacioId: space.idBaseDatos }),
    });
  },
  remove: (_user, id) => authRequest(`${path}/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
