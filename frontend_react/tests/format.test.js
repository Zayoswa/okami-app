import test from "node:test";
import assert from "node:assert/strict";
import {
  formatDate, formatDayMonth, formatFullDate, formatPrice, formatPriceCompact, formatShortWeekdayDate, formatWeekdayDate,
} from "../src/utils/format.js";

test("las fechas no cambian de día por la zona horaria", () => {
  assert.equal(formatDate("2026-11-10"), "10-11-2026");
  assert.equal(formatWeekdayDate("2026-11-10"), "martes, 10 de noviembre");
  assert.equal(formatFullDate("2026-11-10"), "martes, 10 de noviembre de 2026");
  assert.equal(formatShortWeekdayDate("2026-11-18"), "mié 18-11");
});

test("el precio se muestra en pesos chilenos sin decimales", () => {
  assert.equal(formatPrice(120000).replace(/\s/g, ""), "$120.000");
});

test("los precios cortos y fechas de los gráficos", () => {
  assert.equal(formatPriceCompact(450000), "$450 mil");
  assert.equal(formatPriceCompact(1250000), "$1,3 M");
  assert.equal(formatPriceCompact(2000000), "$2 M");
  assert.equal(formatPriceCompact(0).replace(/\s/g, ""), "$0");
  assert.equal(formatDayMonth("2026-11-02"), "2 nov");
});
