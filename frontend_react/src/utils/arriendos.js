// Textos del módulo Arriendos. El cálculo lo hace el servidor (backend-fastapi/arriendos.py).
import { formatPrice } from "./format.js";

const monthName = new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric", timeZone: "UTC" });

// "2026-11" del día "2026-11-18".
export const monthOf = (fecha) => fecha.slice(0, 7);

// "2026-11" → "noviembre de 2026"
export const formatMonth = (mes) => monthName.format(new Date(`${mes}-15T12:00:00Z`));

// "2026-11", 1 → "2026-12"; "2026-01", -1 → "2025-12"
export function shiftMonth(mes, offset) {
  const [year, month] = mes.split("-").map(Number);
  const total = year * 12 + (month - 1) + offset;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Cómo se llegó al monto: "7 turnos × $12.000", "Mínimo mensual (2 turnos)", "6 días × $12.000 (5+ días)".
export function rentDetail(fila) {
  if (!fila.cobro) return "Sin modalidad: asígnala en Tatuadores";
  if (fila.cobro === "mensual") return "Monto mensual fijo";
  if (fila.cobro === "turno") {
    const porTurnos = fila.turnos * fila.precioUnitario;
    return porTurnos < fila.minimo
      ? `Mínimo mensual ${formatPrice(fila.minimo)} (${plural(fila.turnos, "turno", "turnos")})`
      : `${plural(fila.turnos, "turno", "turnos")} × ${formatPrice(fila.precioUnitario)}`;
  }
  return `${plural(fila.dias, "día", "días")} × ${formatPrice(fila.precioUnitario)}`;
}

export const RENT_STATUS = {
  pagado: { label: "Pagado", tone: "ok" },
  parcial: { label: "Pago parcial", tone: "partial" },
  pendiente: { label: "Pendiente", tone: "due" },
  falta_minimo: { label: "Falta el mínimo", tone: "due" },
  sin_cargo: { label: "Sin cargo", tone: "none" },
  sin_modalidad: { label: "Sin modalidad", tone: "none" },
};

// Tarifa en una línea: "$12.000 por turno · mínimo $60.000 al mes".
export function tariffText(tarifa) {
  if (tarifa.cobro === "mensual") return `${formatPrice(tarifa.monto)} al mes`;
  if (tarifa.cobro === "turno") return `${formatPrice(tarifa.monto)} por turno · mínimo ${formatPrice(tarifa.minimo)} al mes`;
  const reducido = tarifa.diasReducido && tarifa.montoReducido !== null
    ? ` · desde ${tarifa.diasReducido} días en el mes, ${formatPrice(tarifa.montoReducido)} cada día` : "";
  return `${formatPrice(tarifa.monto)} por día${reducido}`;
}

const shortMonth = new Intl.DateTimeFormat("es-CL", { month: "short", timeZone: "UTC" });

// "2026-11" → "nov"
export const formatMonthShort = (mes) => shortMonth.format(new Date(`${mes}-15T12:00:00Z`)).replace(".", "");

// ---------- Filtro y páginas de la tabla ----------

export const RENT_PAGE_SIZE = 10;

// Grupos del filtro "Estado": lo que el admin busca al cobrar.
export const RENT_STATUS_FILTERS = [
  { id: "", label: "Todos" },
  { id: "por_cobrar", label: "Por cobrar", estados: ["pendiente", "falta_minimo", "parcial"] },
  { id: "pagado", label: "Pagados", estados: ["pagado"] },
  { id: "sin_cargo", label: "Sin cargo", estados: ["sin_cargo"] },
  { id: "sin_modalidad", label: "Sin modalidad", estados: ["sin_modalidad"] },
];

export const RENT_SORTS = [
  { id: "saldo", label: "Mayor saldo primero" },
  { id: "nombre", label: "Nombre (A–Z)" },
  { id: "arriendo", label: "Mayor arriendo primero" },
];

const fold = (value) => String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es-CL").trim();
const byName = (a, b) => String(a.tatuador).localeCompare(String(b.tatuador), "es-CL", { sensitivity: "base" });

// Filas que cumplen los filtros, ya ordenadas. "Sin modalidad" en el filtro de modalidad es "__none".
export function filterRentRows(filas, { q = "", estado = "", modalidad = "", orden = "saldo" } = {}) {
  const texto = fold(q);
  const grupo = RENT_STATUS_FILTERS.find((item) => item.id === estado);
  const result = filas.filter((fila) => {
    if (texto && !fold(fila.tatuador).includes(texto)) return false;
    if (grupo?.estados && !grupo.estados.includes(fila.estado)) return false;
    if (modalidad === "__none" ? fila.modalidad : modalidad && fila.modalidad !== modalidad) return false;
    return true;
  });
  const compare = orden === "nombre" ? byName
    : orden === "arriendo" ? (a, b) => b.cargo - a.cargo || byName(a, b)
      : (a, b) => b.saldo - a.saldo || byName(a, b);
  return result.sort(compare);
}

// Modalidades presentes en el mes, para el filtro (en orden alfabético).
export function rentModalities(filas) {
  return [...new Set(filas.map((fila) => fila.modalidad).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es-CL"));
}

// Una página de la lista. La página se ajusta si quedó fuera de rango (por ejemplo, tras filtrar).
export function paginate(items, page, size = RENT_PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * size;
  return { items: items.slice(start, start + size), page: current, pages, from: items.length ? start + 1 : 0, to: Math.min(start + size, items.length), total: items.length };
}
