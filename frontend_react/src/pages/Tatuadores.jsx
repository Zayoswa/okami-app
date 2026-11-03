import { useEffect, useRef, useState } from "react";
import { authRequest } from "../services/authService";
import "./Tatuadores.css";
export default function Tatuadores() {
  const [users, setUsers] = useState([]);
  const [modalities, setModalities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [modalidad, setModalidad] = useState("");
  const [selected, setSelected] = useState(null);
  const dialog = useRef(null);
  useEffect(() => {
    if (selected) dialog.current.showModal();
    else dialog.current.close();
  }, [selected]);
  async function load() {
    const [rows, modes] = await Promise.all([authRequest("/api/usuarios/"), authRequest("/api/modalidad/")]);
    setUsers(rows.filter(row => row.role === "tatuador")); setModalities(modes);
  }
  useEffect(() => {
    Promise.resolve().then(load).catch(cause => setError(cause.message)).finally(() => setLoading(false));
  }, []);
  async function invite(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await authRequest("/api/usuarios/invitaciones", { method: "POST", body: JSON.stringify({ nombre: nombre.trim(), email: email.trim(), modalidad: modalidad ? Number(modalidad) : null }) });
      setMessage("Invitación enviada. El tatuador recibirá un enlace para establecer su contraseña.");
      setNombre(""); setEmail(""); setModalidad("");
      try { await load(); } catch { setError("La invitación se envió, pero no se pudo actualizar el listado. Recarga la página."); }
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }
  async function toggle() {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await authRequest(`/api/usuarios/${selected.id}/actividad`, { method: "PATCH", body: JSON.stringify({ activo: !selected.activo }) });
      setSelected(null); setMessage("Acceso actualizado.");
      try { await load(); } catch { setError("El acceso cambió. Recarga para actualizar el listado."); }
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }
  return <section className="artists-page"><h1>Tatuadores</h1><p>Invita a las personas autorizadas por el estudio y administra su acceso.</p>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <form onSubmit={invite}><h2>Invitar tatuador</h2>
      <label>Nombre<input required maxLength={120} value={nombre} onChange={e => setNombre(e.target.value)} /></label>
      <label>Correo<input required type="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>Modalidad<select required={modalities.length > 0} value={modalidad} onChange={e => setModalidad(e.target.value)}><option value="">Seleccionar</option>{modalities.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></label>
      <button disabled={busy || loading}>{busy ? "Procesando…" : "Enviar invitación"}</button>
    </form>
    <h2>Usuarios del estudio</h2>{loading ? <p>Cargando…</p> : users.length === 0 ? <p>No hay tatuadores para mostrar.</p> : <ul>{users.map(row => <li key={row.id}><div><strong>{row.nombre}</strong><span>{row.activo ? "Acceso habilitado" : "Acceso desactivado"}</span></div><button disabled={busy} onClick={() => setSelected(row)}>{row.activo ? "Desactivar" : "Activar"}</button></li>)}</ul>}
    <dialog ref={dialog} className="artists-dialog" aria-labelledby="activity-title" onCancel={event => { if (busy) event.preventDefault(); else setSelected(null); }}>{selected && <><h2 id="activity-title">{selected.activo ? "Desactivar" : "Activar"} acceso</h2><p>¿Confirmas el cambio de acceso de {selected.nombre}? Sus reservas se conservan.</p><button disabled={busy} onClick={() => setSelected(null)}>Cancelar</button><button disabled={busy} onClick={toggle}>Confirmar</button></>}</dialog>
  </section>;
}
