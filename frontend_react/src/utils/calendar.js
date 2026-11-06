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

export function monthDays(month) {
  const first = new Date(`${month}-01T12:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7;
  const year = first.getUTCFullYear();
  const monthIndex = first.getUTCMonth();
  const count = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const cells = Math.ceil((offset + count) / 7) * 7;
  return Array.from({ length: cells }, (_, index) => {
    const date = new Date(Date.UTC(year, monthIndex, 1 - offset + index, 12));
    return { fecha: date.toISOString().slice(0, 10), day: date.getUTCDate(), inMonth: date.getUTCMonth() === monthIndex };
  });
}

export function shiftMonth(month, offset) {
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}
