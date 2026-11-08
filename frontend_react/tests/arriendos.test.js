import test from "node:test";
import assert from "node:assert/strict";
import { filterRentRows, paginate, rentModalities } from "../src/utils/arriendos.js";

const filas = [
  { tatuador: "Ángela", modalidad: "Full", estado: "pagado", cargo: 220000, saldo: 0 },
  { tatuador: "bruno", modalidad: "Rotativo", estado: "falta_minimo", cargo: 60000, saldo: 60000 },
  { tatuador: "Carla", modalidad: "Guest", estado: "parcial", cargo: 45000, saldo: 15000 },
  { tatuador: "Diego", modalidad: null, estado: "sin_modalidad", cargo: 0, saldo: 0 },
  { tatuador: "Elisa", modalidad: "Full", estado: "pendiente", cargo: 220000, saldo: 220000 },
];
const names = (rows) => rows.map((fila) => fila.tatuador);

test("por defecto ordena por saldo, y a igual saldo por nombre", () => {
  assert.deepEqual(names(filterRentRows(filas)), ["Elisa", "bruno", "Carla", "Ángela", "Diego"]);
});

test("busca por nombre sin importar tildes ni mayúsculas", () => {
  assert.deepEqual(names(filterRentRows(filas, { q: "ANGE" })), ["Ángela"]);
});

test("Por cobrar junta pendiente, parcial y falta el mínimo", () => {
  assert.deepEqual(names(filterRentRows(filas, { estado: "por_cobrar", orden: "nombre" })), ["bruno", "Carla", "Elisa"]);
});

test("filtra por modalidad y por sin modalidad", () => {
  assert.deepEqual(names(filterRentRows(filas, { modalidad: "Full", orden: "nombre" })), ["Ángela", "Elisa"]);
  assert.deepEqual(names(filterRentRows(filas, { modalidad: "__none" })), ["Diego"]);
  assert.deepEqual(rentModalities(filas), ["Full", "Guest", "Rotativo"]);
});

test("pagina de a 10 y ajusta una página fuera de rango", () => {
  const items = Array.from({ length: 23 }, (_, i) => i);
  assert.deepEqual(paginate(items, 3), { items: [20, 21, 22], page: 3, pages: 3, from: 21, to: 23, total: 23 });
  assert.equal(paginate(items, 9).page, 3);
  assert.deepEqual(paginate([], 1), { items: [], page: 1, pages: 1, from: 0, to: 0, total: 0 });
});
