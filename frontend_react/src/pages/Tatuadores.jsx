import { use, useEffect, useRef, useState } from "react";
import { authRequest } from "../services/authService";
import LoadingScreen from "../components/LoadingScreen";
import "./Tatuadores.css";
import Notice from "../components/Notice";
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
  async function register(event){
    event.preventDefault();

<<<<<<< Updated upstream
    setBusy(true)
    setError("");
    setMessage("");
    try{
       const response = await authRequest(
        "/api/usuarios/", {
          method:"POST",
          headers: {
            "Content-Type" : "application/json", 
          }, 
          body : JSON.stringify({
            nombre: nombre,
            email: email,
            password: password,
            rol: Number(rol),
            modalidad: modalidad,
            activo: true
          })
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error (
          data.detail || "Error al registrar usuario"
        );
      }
      setMessage(data.message);
    } catch(err){
        setError(err.message);
    } finally {
        setBusy(false);
    }
  };

  return <section className="artists-page"><h1>Tatuadores</h1><p>Invita a las personas autorizadas por el estudio y administra su acceso.</p>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <form onSubmit={register}><h2>Registrar tatuador</h2>
=======
  return <section className="artists-page"><h1>Tatuadores</h1><p>Registra a las personas autorizadas por el estudio y administra su acceso y modalidad.</p>
    {error && <Notice tone="danger">{error}</Notice>}{message && <Notice tone="ok">{message}</Notice>}
    <form onSubmit={register}><h2>Registrar usuario</h2>
>>>>>>> Stashed changes
      <label>Nombre<input required maxLength={120} value={nombre} onChange={e => setNombre(e.target.value)} /></label>
      <label>Contraseña <input required minLength={8} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password"/> </label>
      <label>Correo<input required type="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>Modalidad<select required={modalities.length > 0} value={modalidad} onChange={e => setModalidad(e.target.value)}><option value="">Seleccionar</option>{modalities.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></label>
      <label>Rol<select required value={rol} onChange={e => setRol(e.target.value)}><option value="">Seleccionar</option>{roles.map(r => (<option key={r.id} value={r.id}>{r.nombre}</option>))}</select></label>
      <button type="submit" disabled={busy || loading || modalities.length === 0 || roles.length === 0}>{busy ? "Registrando…" : "Registrar tatuador"}</button>
    </form>
    <h2>Usuarios del estudio</h2>{loading ? <LoadingScreen message="Cargando usuarios…" /> : users.length === 0 ? <p>No hay tatuadores para mostrar.</p> : <ul>{users.map(row => <li key={row.id}><div><strong>{row.nombre}</strong><span>{row.activo ? "Acceso habilitado" : "Acceso desactivado"}</span></div><button disabled={busy} onClick={() => setSelected(row)}>{row.activo ? "Desactivar" : "Activar"}</button></li>)}</ul>}
    <dialog ref={dialog} className="artists-dialog" aria-labelledby="activity-title" onCancel={event => { if (busy) event.preventDefault(); else setSelected(null); }}>{selected && <><h2 id="activity-title">{selected.activo ? "Desactivar" : "Activar"} acceso</h2><p>¿Confirmas el cambio de acceso de {selected.nombre}? Sus reservas se conservan.</p><button disabled={busy} onClick={() => setSelected(null)}>Cancelar</button><button disabled={busy} onClick={toggle}>Confirmar</button></>}</dialog>
  </section>;
}