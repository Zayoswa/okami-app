import { useEffect, useRef, useState } from "react";
import { authRequest } from "../services/authService";
import LoadingScreen from "../components/LoadingScreen";
import "./Tatuadores.css";
export default function Tatuadores() {
  const [users, setUsers] = useState([]);
  const [modalities, setModalities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [nombre, setNombre] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState("");
  const [roles, setRoles] = useState([]);
  const [email, setEmail] = useState("");
  const [modalidad, setModalidad] = useState("");
  const [selected, setSelected] = useState(null);
  const dialog = useRef(null);
  // La modalidad (y el arriendo) solo aplica a los tatuadores.
  const isArtistRole = roles.find(r => String(r.id) === String(rol))?.nombre?.trim().toLowerCase() === "tatuador";
  useEffect(() => {
    if (selected) dialog.current.showModal();
    else dialog.current.close();
  }, [selected]);
  async function load() {
    const [rows, modes, rolDisponible] = await Promise.all([authRequest("/api/usuarios/"), authRequest("/api/modalidad/"), authRequest("/api/rol/")]);
    setUsers(rows.filter(row => row.role === "tatuador")); 
    setModalities(modes);
    setRoles(rolDisponible);

  }
  useEffect(() => {
    Promise.resolve().then(load).catch(cause => setError(cause.message)).finally(() => setLoading(false));
  }, []);
  // Modalidad del tatuador: define su arriendo desde este mes. Un titular conserva la de su puesto.
  async function changeModality(row, value) {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await authRequest(`/api/usuarios/${row.id}/modalidad`, { method: "PATCH", body: JSON.stringify({ modalidad: value ? Number(value) : null }) });
      const nombre = modalities.find(m => String(m.id) === String(value))?.nombre;
      setMessage(nombre ? `${row.nombre} ahora es ${nombre}. Su arriendo se calcula así desde este mes.` : `${row.nombre} quedó sin modalidad.`);
      try { await load(); } catch { setError("La modalidad cambió. Recarga para actualizar el listado."); }
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
  // Registro manual: crea la cuenta con la contraseña indicada, lista para iniciar sesión.
  // (La invitación por correo vuelve cuando el estudio tenga un servidor SMTP.)
  async function register(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const data = await authRequest("/api/usuarios/", {
        method: "POST",
        body: JSON.stringify({
          nombre: nombre.trim(),
          email: email.trim(),
          password,
          rol: Number(rol),
          modalidad: isArtistRole && modalidad ? Number(modalidad) : null,
        }),
      });
      setMessage(data.message);
      setNombre(""); setEmail(""); setPassword(""); setRol(""); setModalidad("");
      try { await load(); } catch { setError("El usuario se registró, pero no se pudo actualizar el listado. Recarga la página."); }
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  return <section className="artists-page"><h1>Tatuadores</h1><p>Registra a las personas autorizadas por el estudio y administra su acceso y modalidad.</p>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <form onSubmit={register}><h2>Registrar usuario</h2>
      <label>Nombre<input required maxLength={120} value={nombre} onChange={e => setNombre(e.target.value)} /></label>
      <label>Contraseña<input required minLength={12} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" aria-describedby="password-ayuda" /><small id="password-ayuda">Mínimo 12 caracteres. Entrégasela a la persona para que inicie sesión.</small></label>
      <label>Correo<input required type="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>Rol<select required value={rol} onChange={e => setRol(e.target.value)}><option value="">Seleccionar</option>{roles.map(r => (<option key={r.id} value={r.id}>{r.nombre}</option>))}</select></label>
      {isArtistRole && <label>Modalidad<select required value={modalidad} onChange={e => setModalidad(e.target.value)}><option value="">Seleccionar</option>{modalities.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></label>}
      <button type="submit" disabled={busy || loading || roles.length === 0}>{busy ? "Registrando…" : "Registrar usuario"}</button>
    </form>
    <h2>Usuarios del estudio</h2>{loading ? <LoadingScreen message="Cargando usuarios…" /> : users.length === 0 ? <p>No hay tatuadores para mostrar.</p> : <ul>{users.map(row => <li key={row.id}><div><strong>{row.nombre}</strong><span>{row.activo ? "Acceso habilitado" : "Acceso desactivado"}</span></div><div className="artists-actions"><label className="artists-modality">Modalidad<select value={row.modalidad ?? ""} disabled={busy} onChange={e => changeModality(row, e.target.value)} aria-label={`Modalidad de ${row.nombre}`}><option value="">Sin modalidad</option>{modalities.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></label><button disabled={busy} onClick={() => setSelected(row)}>{row.activo ? "Desactivar" : "Activar"}</button></div></li>)}</ul>}
    <dialog ref={dialog} className="artists-dialog" aria-labelledby="activity-title" onCancel={event => { if (busy) event.preventDefault(); else setSelected(null); }}>{selected && <><h2 id="activity-title">{selected.activo ? "Desactivar" : "Activar"} acceso</h2><p>¿Confirmas el cambio de acceso de {selected.nombre}? Sus reservas se conservan.</p><button disabled={busy} onClick={() => setSelected(null)}>Cancelar</button><button disabled={busy} onClick={toggle}>Confirmar</button></>}</dialog>
  </section>;
}
