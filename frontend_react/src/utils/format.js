// Formatos de precio y fecha que se repiten en Reservas, Calendario y los modales.
// Las fechas "YYYY-MM-DD" se interpretan a mediodía UTC para que nunca cambien de día por la zona horaria.

const price = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const shortDate = new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const weekdayDate = new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const fullDate = new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const dateTime = new Intl.DateTimeFormat("es-CL", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

const atNoon = (fecha) => new Date(`${fecha}T12:00:00Z`);

// 120000 → "$120.000"
export const formatPrice = (value) => price.format(value);

// "2026-11-10" → "10-11-2026"
export const formatDate = (fecha) => shortDate.format(atNoon(fecha));

// "2026-11-10" → "martes, 10 de noviembre"
export const formatWeekdayDate = (fecha) => weekdayDate.format(atNoon(fecha));

// "2026-11-10" → "martes, 10 de noviembre de 2026"
export const formatFullDate = (fecha) => fullDate.format(atNoon(fecha));

// Marca de tiempo ISO → "10-11-2026, 14:30" en la hora local del navegador.
export const formatDateTime = (iso) => dateTime.format(new Date(iso));

const shortWeekday = new Intl.DateTimeFormat("es-CL", { weekday: "short", timeZone: "UTC" });
const dayMonth = new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

// "2026-11-18" → "mié 18-11"
export const formatShortWeekdayDate = (fecha) =>
  `${shortWeekday.format(atNoon(fecha)).replace(".", "")} ${dayMonth.format(atNoon(fecha)).replace("/", "-")}`;

// Precio corto para ejes y etiquetas de gráficos: 450000 → "$450 mil", 1250000 → "$1,3 M".
export function formatPriceCompact(value) {
  if (Math.abs(value) >= 1_000_000) return "$" + (value / 1_000_000).toFixed(1).replace(".", ",").replace(/,0$/, "") + " M";
  if (Math.abs(value) >= 1_000) return "$" + Math.round(value / 1_000) + " mil";
  return formatPrice(value);
}

// "2026-11-02" → "2 nov"
const dayShortMonth = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", timeZone: "UTC" });
export const formatDayMonth = (fecha) => dayShortMonth.format(atNoon(fecha)).replace(".", "");
