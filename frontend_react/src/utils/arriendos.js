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
