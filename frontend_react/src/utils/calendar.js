export function todayInSantiago(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

const santiagoTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

// Hora actual en Santiago como "HH:MM", comparable con horaInicio / horaFin.
export function timeInSantiago(now = new Date()) {
  return santiagoTime.format(now);
}

export function isFutureReservationStart(date, time, now = new Date()) {
  const today = todayInSantiago(now);
  return date > today || (date === today && time > santiagoTime.format(now));
}

const atNoon = (fecha) => new Date(`${fecha}T12:00:00Z`);

// Suma (o resta) días a una fecha "YYYY-MM-DD".
export function shiftDate(fecha, days) {
  const date = atNoon(fecha);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Los 7 días (lunes a domingo) de la semana que contiene la fecha.
export function weekDays(fecha) {
  const offset = (atNoon(fecha).getUTCDay() + 6) % 7; // lunes = 0
  const monday = shiftDate(fecha, -offset);
  return Array.from({ length: 7 }, (_, index) => {
    const day = shiftDate(monday, index);
    return { fecha: day, day: atNoon(day).getUTCDate() };
  });
}

const dayMonth = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", timeZone: "UTC" });
const dayOnly = new Intl.DateTimeFormat("es-CL", { day: "numeric", timeZone: "UTC" });
const yearOnly = new Intl.DateTimeFormat("es-CL", { year: "numeric", timeZone: "UTC" });

// "2 – 8 de noviembre de 2026" o, si cruza de mes, "30 de noviembre – 6 de diciembre de 2026".
export function weekLabel(days) {
  const first = atNoon(days[0].fecha);
  const last = atNoon(days.at(-1).fecha);
  const sameMonth = first.getUTCMonth() === last.getUTCMonth();
  const sameYear = first.getUTCFullYear() === last.getUTCFullYear();
  const start = sameMonth ? dayOnly.format(first) : dayMonth.format(first) + (sameYear ? "" : ` de ${yearOnly.format(first)}`);
  return `${start} – ${dayMonth.format(last)} de ${yearOnly.format(last)}`;
}
