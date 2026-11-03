import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { acceptInvitation, authRequest, restoreSession } from "../services/authService";
import { homeForUser } from "../utils/access";
import "./Login.css";
export default function Invitacion({ setUser }) {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.resolve().then(() => { acceptInvitation(); setReady(true); })
      .catch(cause => setError(cause.message));
  }, []);
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (password !== confirmation) { setError("Las contraseñas no coinciden."); return; }
    setBusy(true); setError("");
    try {
      await authRequest("/auth/password", { method: "POST", body: JSON.stringify({ password }) });
      const user = await restoreSession();
      setUser(user); navigate(homeForUser(user), { replace: true });
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }
  return <main className="login-page"><section className="login-card">
    <h1>Bienvenido a Okami</h1><p>Establece tu contraseña para acceder al estudio.</p>
    {error && <p role="alert">{error}</p>}
    {ready && <form className="login-form" onSubmit={submit}>
      <label>Contraseña (mínimo 12 caracteres)<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} /></label>
      <label>Confirmar contraseña<input type="password" autoComplete="new-password" required value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
      <button disabled={busy}>{busy ? "Guardando…" : "Guardar y entrar"}</button>
    </form>}
  </section></main>;
}
