import { API_BASE_URL } from "../config/api.js";
import { apiRequest } from "./apiRequest.js";
const key = "okami.auth.session";
let refreshPromise;
function session() {
  try { return JSON.parse(sessionStorage.getItem(key)) || {}; } catch { return {}; }
}
function remember(data) {
  sessionStorage.setItem(key, JSON.stringify({ access_token: data.access_token, refresh_token: data.refresh_token }));
}
export function clearSession() { sessionStorage.removeItem(key); }
async function send(path, options = {}, jwt) {
  return apiRequest(`${API_BASE_URL}${path}`, {
    ...options, headers: { "Content-Type": "application/json", ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
  });
}
async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = send("/auth/refresh", { method: "POST", body: JSON.stringify({ refresh_token: session().refresh_token || "" }) })
      .then(data => { remember(data); return data; })
      .finally(() => { refreshPromise = undefined; });
  }
  return refreshPromise;
}
export async function authRequest(path, options) {
  try { return await send(path, options, session().access_token); }
  catch (error) {
    if (error.status !== 401 || !session().refresh_token) throw error;
    try { await refreshSession(); }
    catch (cause) { if (cause.status === 401 || cause.status === 403) clearSession(); throw cause; }
    return send(path, options, session().access_token);
  }
}
export async function signIn(email, password) {
  const data = await send("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  remember(data);
  return data.user;
}
export async function restoreSession() {
  if (!session().access_token) return null;
  return authRequest("/auth/me");
}
export async function signOut() {
  try { await authRequest("/auth/logout", { method: "POST" }); }
  finally { clearSession(); }
}
export function acceptInvitation() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const access = params.get("access_token");
  const refresh = params.get("refresh_token");
  const error = params.get("error_description");
  window.history.replaceState({}, "", window.location.pathname);
  if (error) throw new Error("La invitación no es válida o expiró. Contacta al administrador.");
  if (access && refresh && params.get("type") === "invite") {
    remember({ access_token: access, refresh_token: refresh });
    return;
  }
  if (!session().access_token) throw new Error("Abre el enlace de invitación enviado a tu correo.");
}
