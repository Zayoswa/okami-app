import test from "node:test";
import assert from "node:assert/strict";
import { isFutureReservationStart, shiftDate, todayInSantiago, weekDays, weekLabel } from "../src/utils/calendar.js";

test("la semana va de lunes a domingo y contiene la fecha", () => {
  const days = weekDays("2026-11-06"); // viernes
  assert.equal(days.length, 7);
  assert.equal(days[0].fecha, "2026-11-02");
  assert.equal(days.at(-1).fecha, "2026-11-08");
  assert.equal(weekDays("2026-11-02")[0].fecha, "2026-11-02"); // lunes
  assert.equal(weekDays("2026-11-08")[0].fecha, "2026-11-02"); // domingo
});

test("la semana cruza meses y años correctamente", () => {
  assert.deepEqual(weekDays("2026-12-31").map(({ fecha }) => fecha), [
    "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03",
  ]);
  assert.equal(shiftDate("2028-02-28", 1), "2028-02-29");
  assert.equal(shiftDate("2026-11-02", -7), "2026-10-26");
});

test("el título de la semana se adapta al mes y al año", () => {
  assert.equal(weekLabel(weekDays("2026-11-06")), "2 – 8 de noviembre de 2026");
  assert.equal(weekLabel(weekDays("2026-11-30")), "30 de noviembre – 6 de diciembre de 2026");
  assert.equal(weekLabel(weekDays("2026-12-31")), "28 de diciembre de 2026 – 3 de enero de 2027");
});

test("Hoy usa la fecha de Santiago", () => {
  assert.equal(todayInSantiago(new Date("2026-10-05T01:00:00Z")), "2026-10-04");
});

test("el inicio debe ser posterior al minuto actual de Santiago", () => {
  const now = new Date("2026-11-04T01:30:00Z");
  assert.equal(isFutureReservationStart("2026-07-10", "23:59", now), false);
  assert.equal(isFutureReservationStart("2026-11-03", "22:29", now), false);
  assert.equal(isFutureReservationStart("2026-11-03", "22:30", now), false);
  assert.equal(isFutureReservationStart("2026-11-03", "22:31", now), true);
  assert.equal(isFutureReservationStart("2026-11-04", "00:00", now), true);
});
