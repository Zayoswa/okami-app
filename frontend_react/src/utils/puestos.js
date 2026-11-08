// Devuelve el número de un puesto a partir de su nombre ("Puesto 3" → "3").
// Si el nombre no tiene número, devuelve "" y la tarjeta no muestra el número de fondo.
export function puestoNumber(nombre) {
  const match = String(nombre ?? "").match(/(\d+)\s*$/);
  return match ? match[1] : "";
}

// Una sesión sigue "en juego" si no se canceló ni se completó.
function isOpen(sesion) {
  return sesion.estado !== "Cancelada" && sesion.estado !== "Completada";
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

// Tipos de puesto: Full y Compartido tienen titulares fijos; Rotativo es para tatuadores de paso o en arriendo.
export const PUESTO_TIPOS = [
  { id: "Full", max: 1, descripcion: "1 titular con modalidad Full" },
  { id: "Compartido", max: 2, descripcion: "2 titulares con modalidad Compartido" },
  { id: "Rotativo", max: 0, descripcion: "sin titulares, para Rotativo, Rotativo light y Guest" },
];

export function maxTitulares(tipo) {
  return PUESTO_TIPOS.find((item) => item.id === tipo)?.max ?? 0;
}

// Puesto del que el tatuador es titular (cada tatuador tiene como máximo uno), o null.
export function titularPuesto(puestos, tatuadorId) {
  if (!tatuadorId) return null;
  return puestos.find((puesto) => (puesto.titulares ?? []).some((titular) => String(titular.id) === String(tatuadorId))) ?? null;
}

export function isTitular(puesto, tatuadorId) {
  return Boolean(tatuadorId) && (puesto?.titulares ?? []).some((titular) => String(titular.id) === String(tatuadorId));
}

// Por qué un tatuador no puede agendar una sesión nueva en este puesto, o "" si puede.
// Full y Compartido son solo para sus titulares; Rotativo está abierto a todos.
export function puestoBlockReason(puesto, tatuadorId) {
  if (!puesto) return "Selecciona un puesto.";
  if (!puesto.disponible) return puesto.estado;
  if (maxTitulares(puesto.tipo) > 0 && !isTitular(puesto, tatuadorId)) return "Solo titulares";
  return "";
}

// Sesiones de un puesto que todavía no terminan (ni canceladas ni completadas), ordenadas por fecha y hora.
// fecha "YYYY-MM-DD" y hora "HH:MM" son el momento actual en Santiago.
export function upcomingSessions(sesiones, puestoId, fecha, hora) {
  return sesiones
    .filter((item) => item.puestoId === puestoId && isOpen(item) &&
      (item.fecha > fecha || (item.fecha === fecha && item.horaFin > hora)))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.horaInicio.localeCompare(b.horaInicio));
}

// Estado del puesto dentro de una frase: "Puesto 4 está deshabilitado" / "está en mantenimiento".
export function puestoStateText(estado) {
  const value = String(estado ?? "").trim().toLowerCase();
  if (value === "mantenimiento") return "en mantenimiento";
  return value || "sin estado";
}
