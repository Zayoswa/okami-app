import test from "node:test";
import assert from "node:assert/strict";
import { loadReservations, storeReservations } from "../src/utils/reservationStorage.js";
import artists from "../src/data/tatuadoresMock.json" with { type: "json" };
import reportMock from "../src/data/reservasDashboardMock.json" with { type: "json" };

test("los mockups cubren treinta tatuadores con sesiones válidas", () => {
  assert.equal(artists.length, 30);
  assert.equal(new Set(reportMock.map((row) => row.tatuadorId)).size, 30);
  assert.ok(reportMock.every((row) => row.horaFin > row.horaInicio && artists.some((artist) => artist.id === row.tatuadorId)));
});

test("los nuevos ejemplos se incorporan sin restaurar reservas borradas posteriormente", () => {
  let value = JSON.stringify([]);
  const storage = { getItem: () => value, setItem: (_key, data) => { value = data; } };
  const upgraded = loadReservations(storage);
  assert.equal(upgraded.length, reportMock.length);
  const remaining = upgraded.slice(1);
  storeReservations(remaining, storage);
  assert.deepEqual(loadReservations(storage), remaining);
  storeReservations([], storage);
  assert.deepEqual(loadReservations(storage), []);
});
