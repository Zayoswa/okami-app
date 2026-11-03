import test from "node:test";
import assert from "node:assert/strict";
import { apiRequest } from "../src/services/apiRequest.js";

test("una petición sin respuesta termina y permite reintentar", async (t) => {
  t.mock.method(globalThis, "fetch", (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  }));
  await assert.rejects(apiRequest("http://local/auth/login", {}, 10), /tardó demasiado/);
  globalThis.fetch.mock.mockImplementation(async () => new Response(JSON.stringify({ ok: true })));
  assert.deepEqual(await apiRequest("http://local/auth/login"), { ok: true });
});

test("las credenciales rechazadas muestran el error 401", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ detail: "Correo o contraseña incorrectos." }), { status: 401 }));
  await assert.rejects(apiRequest("http://local/auth/login"), error => error.status === 401 && /contraseña/.test(error.message));
});

test("una respuesta no JSON tiene un mensaje comprensible", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("Internal Server Error", { status: 500 }));
  await assert.rejects(apiRequest("http://local/auth/login"), /respuesta inválida/);
});

test("el límite también cubre un cuerpo de respuesta que no termina", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url, { signal }) => ({
    json: () => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))),
  }));
  await assert.rejects(apiRequest("http://local/auth/me", {}, 10), /tardó demasiado/);
});
