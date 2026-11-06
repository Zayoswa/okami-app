// Devuelve el número de un puesto a partir de su nombre ("Puesto 3" → "3").
// Si el nombre no tiene número, devuelve "" y la tarjeta no muestra el número de fondo.
export function puestoNumber(nombre) {
  const match = String(nombre ?? "").match(/(\d+)\s*$/);
  return match ? match[1] : "";
}

// Una sesión sigue "en juego" si no se canceló ni se completó.
function isOpen(sesion) {
  return sesion.estado !== "Cancelado" && sesion.estado !== "Completado";
}

// Ocupación de un espacio en un momento dado (fecha "YYYY-MM-DD", hora "HH:MM").
// - actual: la sesión que lo está usando ahora, o null.
// - proxima: la siguiente sesión de ese mismo día, o null.
export function puestoOccupancy(sesiones, puestoId, fecha, hora) {
  const delDia = sesiones
    .filter((item) => item.puestoId === puestoId && item.fecha === fecha && isOpen(item))
    .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
  return {
    actual: delDia.find((item) => item.horaInicio <= hora && hora < item.horaFin) ?? null,
    proxima: delDia.find((item) => item.horaInicio > hora) ?? null,
  };
}
