import test from "node:test";
import assert from "node:assert/strict";
import { monthDays, shiftMonth, todayInSantiago } from "../src/utils/calendar.js";

test("el calendario empieza el lunes y contiene todos los días del mes", () => {
  const days = monthDays("2026-10");
  assert.equal(days[0].fecha, "2026-09-28");
  assert.equal(days.length % 7, 0);
  assert.equal(days.filter((day) => day.inMonth).length, 31);
  assert.equal(days.at(-1).fecha, "2026-11-01");
});

test("el calendario respeta años bisiestos y cambios de año", () => {
  assert.equal(monthDays("2028-02").filter((day) => day.inMonth).length, 29);
  assert.equal(monthDays("2027-02").filter((day) => day.inMonth).length, 28);
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
});

test("Hoy usa la fecha de Santiago", () => {
  assert.equal(todayInSantiago(new Date("2026-10-05T01:00:00Z")), "2026-10-04");
});
