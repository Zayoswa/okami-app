import { useState } from "react";
import { authRequest } from "../services/authService";
import useModalDialog from "../hooks/useModalDialog";
import Notice from "./Notice";

// Ventana para registrar una cuenta (POST /api/usuarios/). Si el correo ya tiene cuenta, el backend responde 409
// "Ya existe una cuenta con ese correo." y el error se muestra aquí, sin cerrar la ventana ni perder lo escrito.
//   title              título de la ventana ("Agregar usuario" para el admin)
//   roles, modalities  catálogos para los selectores (solo los roles que quien registra puede crear)
//   onCreated(message) se registró: el padre recarga el listado y cierra la ventana
//   onClose()          cancelar (también con Escape o la ×)
export default function AddArtistModal({ title = "Agregar tatuador", roles, modalities, onCreated, onClose }) {
  const dialogRef = useModalDialog();
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const tatuadorRol = roles.find(r => r.nombre.trim().toLowerCase() === "tatuador");
  const [rol, setRol] = useState(tatuadorRol ? String(tatuadorRol.id) : "");
  const [modalidad, setModalidad] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // La modalidad (tipo de arriendo) solo aplica a tatuadores; para otros roles el backend la ignora.
  const rolElegido = roles.find(r => String(r.id) === String(rol));
  const pideModalidad = !rolElegido || rolElegido.nombre.trim().toLowerCase() === "tatuador";
  const passwordShort = password.length > 0 && password.length < 12;

  function close() {
    if (!busy) onClose();
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const data = await authRequest("/api/usuarios/", {
        method: "POST",
        body: JSON.stringify({
          nombre: nombre.trim(),
          email: email.trim(),
          password,
          rol: Number(rol),
          modalidad: pideModalidad && modalidad ? Number(modalidad) : null,
          activo: true,
        }),
      });
      onCreated(data.message);
    } catch (cause) {
      setError(cause.message);
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialogRef} className="reservation-modal artists-modal" aria-labelledby="add-artist-title"
      onCancel={(event) => { event.preventDefault(); close(); }}>
      <div className="reservation-modal-header">
        <h2 id="add-artist-title">{title}</h2>
        <button type="button" className="reservation-modal-close" onClick={close} aria-label="Cerrar">×</button>
      </div>
      <p className="reservation-modal-description">La persona entra a la app con este correo y contraseña.</p>

      <form className="artists-form" onSubmit={submit}>
        {error && <Notice tone="danger">{error}</Notice>}
        <label>Nombre
          <input required autoFocus maxLength={120} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre y apellido" />
        </label>
        <label>Correo
          <input required type="email" maxLength={254} value={email} onChange={e => { setEmail(e.target.value); setError(""); }} placeholder="nombre@correo.cl" />
        </label>
        <label>Contraseña
          <input required minLength={12} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password"
            className={passwordShort ? "input-invalid" : password ? "input-valid" : ""} aria-describedby="artists-password-hint" />
          <small id="artists-password-hint" className={passwordShort ? "hint-error" : password ? "hint-ok" : ""}>
            {passwordShort ? `Faltan ${12 - password.length} caracteres` : password ? "✓ Largo suficiente" : "Mínimo 12 caracteres"}
          </small>
        </label>
        <div className="artists-form-row">
          <label>Rol
            <select required value={rol} onChange={e => setRol(e.target.value)}>
              <option value="">Seleccionar</option>
              {roles.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
          </label>
          {pideModalidad && (
            <label>Modalidad
              <select required={modalities.length > 0} value={modalidad} onChange={e => setModalidad(e.target.value)}>
                <option value="">Seleccionar</option>
                {modalities.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className="reservation-modal-actions">
          <button type="button" className="reservation-button reservation-button-secondary" onClick={close} disabled={busy}>Cancelar</button>
          <button type="submit" className="reservation-button" disabled={busy}>{busy ? "Registrando…" : "Agregar"}</button>
        </div>
      </form>
    </dialog>
  );
}
