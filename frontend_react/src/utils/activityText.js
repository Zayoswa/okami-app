// Palabras clave de los resúmenes de Actividad: se pintan según su significado.
//   ok      → acciones que agregan o completan (Creó, Restauró, Registró…) y estados buenos (Completada, Habilitado)
//   danger  → acciones que quitan o cancelan (Borró, Quitó, Desactivó…) y Cancelada
//   info    → acciones que cambian algo (Editó, Cambió, Movió, Marcó…) y Programada
//   warn    → estados que bloquean un puesto (Mantenimiento, Deshabilitado)
//   money   → montos ($120.000)
//   arrow   → el "→" de un cambio (antes → después)

const TONES = {
  ok: ["Creó", "Restauró", "Registró", "Asignó", "Activó", "Invitó", "Agregó", "Completada", "Habilitado"],
  danger: ["Borró", "Quitó", "Desactivó", "Cancelada"],
  info: ["Editó", "Cambió", "Movió", "Marcó", "Guardó", "Programada", "Precio", "Cliente", "Tatuador"],
  warn: ["Mantenimiento", "Deshabilitado"],
};

const TONE_OF = new Map(Object.entries(TONES).flatMap(([tone, words]) => words.map((word) => [word, tone])));
const WORDS = [...TONE_OF.keys()].sort((a, b) => b.length - a.length).join("|");
// Palabras completas (sin letras pegadas, incluidas tildes), montos o la flecha.
const PATTERN = new RegExp(`(?<!\\p{L})(${WORDS})(?!\\p{L})|(\\$\\d{1,3}(?:\\.\\d{3})*)|(→)`, "gu");

// "Borró la reserva … $120.000" → [{ text: "Borró", tone: "danger" }, { text: " la reserva … " }, { text: "$120.000", tone: "money" }]
export function highlightParts(text) {
  const parts = [];
  let last = 0;
  for (const match of String(text ?? "").matchAll(PATTERN)) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index) });
    const [whole, word, money] = match;
    parts.push({ text: whole, tone: word ? TONE_OF.get(word) : money ? "money" : "arrow" });
    last = match.index + whole.length;
  }
  if (last < String(text ?? "").length) parts.push({ text: text.slice(last) });
  return parts;
}

// Tono de la tarjeta según la acción: lo que se borra o cancela se nota más.
export function actionTone(registro) {
  const accion = registro?.accion ?? "";
  if (["borrar", "cancelada", "desactivado", "titular_quitado", "pago_borrado"].includes(accion)) return "danger";
  if (["crear", "restaurar", "completada", "activado", "titular_agregado", "registro", "invitacion", "pago_registrado"].includes(accion)) return "ok";
  return "info";
}
