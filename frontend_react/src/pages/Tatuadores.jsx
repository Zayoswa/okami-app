import { useEffect, useMemo, useState } from "react";
import { authRequest } from "../services/authService";
import LoadingScreen from "../components/LoadingScreen";
import Notice from "../components/Notice";
import AddArtistModal from "../components/AddArtistModal";
import EditUserModal from "../components/EditUserModal";
import useConfirm from "../hooks/useConfirm";
import "./Tatuadores.css";

// Iniciales para el avatar: "Ana María Pérez" -> "AP".
function initials(nombre) {
  const words = String(nombre ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return (words[0][0] + (words.length > 1 ? words.at(-1)[0] : "")).toUpperCase();
}

const TABS = [
  { id: "activos", label: "Activos", empty: "No hay usuarios con acceso." },
  { id: "inactivos", label: "Inactivos", empty: "No hay usuarios desactivados." },
];

// Etiqueta de rol y orden en el listado: recepción y luego tatuadores.
const ROLE_TAGS = {
  recepcion: { label: "Recepción", order: 0 },
  tatuador: { label: "Tatuador", order: 1 },
};

// Qué usuarios ve cada rol en el listado: el admin ve tatuadores y recepción; recepción solo tatuadores.
const VISIBLE_ROLES = {
  admin: ["recepcion", "tatuador"],
  recepcion: ["tatuador"],
};

// Admin y recepción: ver a los usuarios del estudio, registrar cuentas y activar o desactivar su acceso.
// Recepción cambia el acceso de tatuadores; el admin, también el de recepción (lo valida el backend).
// Solo el admin puede borrar definitivamente a un tatuador inactivo.
export default function Tatuadores({ user }) {
  const [users, setUsers] = useState([]);
  const [modalities, setModalities] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("activos");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirm, confirmModal] = useConfirm();
  const isAdmin = user?.role === "admin";
  const canDelete = isAdmin;

  async function load() {
    const [rows, modes, rolDisponible] = await Promise.all([authRequest("/api/usuarios/"), authRequest("/api/modalidad/"), authRequest("/api/rol/")]);
    setUsers(rows
      .filter(row => ROLE_TAGS[row.role])
      .sort((a, b) => ROLE_TAGS[a.role].order - ROLE_TAGS[b.role].order || a.nombre.localeCompare(b.nombre, "es")));
    setModalities(modes);
    setRoles(rolDisponible);
  }
  useEffect(() => {
    Promise.resolve().then(load).catch(cause => setError(cause.message)).finally(() => setLoading(false));
  }, []);

  const modalityName = useMemo(() => new Map(modalities.map(m => [String(m.id), m.nombre])), [modalities]);
  const visibleRoles = VISIBLE_ROLES[user?.role] ?? [];
  const listed = users.filter(row => visibleRoles.includes(row.role));
  const activos = listed.filter(row => row.activo);
  const inactivos = listed.filter(row => !row.activo);
  const visibles = tab === "activos" ? activos : inactivos;

  // Ejecuta un cambio y recarga el listado. reloadError: mensaje si el cambio se hizo pero no se pudo recargar.
  async function run(request, reloadError) {
    setBusy(true); setError(""); setMessage("");
    try {
      setMessage(await request());
      try { await load(); } catch { setError(reloadError); }
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  async function toggle(row) {
    if (busy) return;
    const ok = await confirm({
      title: `${row.activo ? "Desactivar" : "Activar"} acceso`,
      message: row.activo
        ? `${row.nombre} no podrá iniciar sesión y pasará a la pestaña Inactivos.`
        : `${row.nombre} podrá volver a iniciar sesión y pasará a la pestaña Activos.`,
      note: row.role === "tatuador" ? "Sus reservas se conservan." : undefined,
      confirmLabel: row.activo ? "Desactivar" : "Activar",
      tone: row.activo ? "danger" : "warning",
    });
    if (!ok) return;
    await run(async () => {
      await authRequest(`/api/usuarios/${row.id}/actividad`, { method: "PATCH", body: JSON.stringify({ activo: !row.activo }) });
      return `Acceso de ${row.nombre} ${row.activo ? "desactivado" : "activado"}.`;
    }, "El acceso cambió. Recarga para actualizar el listado.");
  }

  async function remove(row) {
    if (busy) return;
    const ok = await confirm({
      title: `Borrar a ${row.nombre}`,
      message: `Se eliminará a ${row.nombre} del sistema de forma definitiva. Esta acción no se puede deshacer.`,
      items: [
        "Su cuenta: ya no podrá iniciar sesión",
        "Todas sus reservas y sesiones",
        "Sus puestos como titular y su historial de modalidad",
      ],
      note: "Se conservan, solo con su nombre: los consentimientos informados (respaldo legal), los pagos de arriendo y el registro de Actividad.",
      question: `¿Borrar definitivamente a ${row.nombre}?`,
      confirmLabel: "Borrar definitivamente",
      tone: "danger",
    });
    if (!ok) return;
    await run(async () => {
      const data = await authRequest(`/api/usuarios/${row.id}`, { method: "DELETE" });
      return data.message;
    }, "Se borró al tatuador, pero no se pudo actualizar el listado. Recarga la página.");
  }

  async function saved(text) {
    setEditing(null); setError(""); setMessage(text);
    try { await load(); } catch { setError("El cambio se guardó, pero no se pudo actualizar el listado. Recarga la página."); }
  }

  async function created(text) {
    setAdding(false); setError(""); setMessage(text); setTab("activos");
    try { await load(); } catch { setError("El usuario se registró, pero no se pudo actualizar el listado. Recarga la página."); }
  }

  const counts = { activos: activos.length, inactivos: inactivos.length };
  const emptyText = TABS.find(item => item.id === tab).empty;

  return (
    <section className="artists-page">
      <h1>{isAdmin ? "Usuarios" : "Tatuadores"}</h1>
      <p className="dashboard-description">
        {isAdmin ? "Registra a los tatuadores y a recepción, y administra su acceso."
          : "Registra a los tatuadores del estudio y administra su acceso."}
      </p>
      {error && <Notice tone="danger">{error}</Notice>}
      {message && <Notice tone="ok">{message}</Notice>}

      <div className="artists-toolbar">
        <button type="button" className="reservation-button artists-add" onClick={() => { setMessage(""); setAdding(true); }}
          disabled={loading || roles.length === 0}>
          + {isAdmin ? "Agregar usuario" : "Agregar tatuador"}
        </button>
        <div className="artists-tabs" role="tablist" aria-label="Usuarios por acceso">
          {TABS.map(item => (
            <button key={item.id} type="button" role="tab" id={`artists-tab-${item.id}`} aria-controls="artists-panel"
              aria-selected={tab === item.id} className={`artists-tab artists-tab-${item.id}${tab === item.id ? " artists-tab-active" : ""}`}
              onClick={() => setTab(item.id)}>
              {item.label}
              {!loading && <span className="artists-tab-count">{counts[item.id]}</span>}
            </button>
          ))}
        </div>
      </div>

      <div id="artists-panel" role="tabpanel" aria-labelledby={`artists-tab-${tab}`}>
        {loading ? <LoadingScreen message="Cargando usuarios…" />
          : visibles.length === 0 ? <p className="artists-empty">{emptyText}</p>
          : (
            <ul className="artists-grid">
              {visibles.map(row => (
                <li key={row.id} className={`artist-card${row.activo ? "" : " artist-card-off"}`}>
                  <div className="artist-card-header">
                    <span className="artist-avatar" aria-hidden="true">{initials(row.nombre)}</span>
                    <div>
                      <h3>{row.nombre}</h3>
                      <div className="artist-tags">
                        <span className={`artist-role artist-role-${row.role}`}>{ROLE_TAGS[row.role].label}</span>
                        {row.role === "tatuador" && (
                          <span className="artist-modality" title="Modalidad de arriendo">{modalityName.get(String(row.modalidad)) ?? "Sin modalidad"}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className={`artist-status${row.activo ? " artist-status-ok" : " artist-status-off"}`}>
                    {row.activo ? "Acceso habilitado" : "Acceso desactivado"}
                  </p>
                  {(row.role === "tatuador" || isAdmin) && <div className="artist-card-actions">
                    <button type="button" disabled={busy} onClick={() => { setMessage(""); setEditing(row); }}
                      className="reservation-button reservation-button-secondary artist-edit">
                      Editar
                    </button>
                    {(row.role === "tatuador" || isAdmin) && <button type="button" disabled={busy} onClick={() => toggle(row)}
                      className={`reservation-button ${row.activo ? "reservation-button-danger" : "reservation-button-secondary"}`}>
                      {row.activo ? "Desactivar acceso" : "Activar acceso"}
                    </button>}
                    {row.role === "tatuador" && !row.activo && canDelete && (
                      <button type="button" disabled={busy} onClick={() => remove(row)} className="reservation-button artist-delete">
                        Borrar
                      </button>
                    )}
                  </div>}
                </li>
              ))}
            </ul>
          )}
      </div>

      {adding && <AddArtistModal title={isAdmin ? "Agregar usuario" : "Agregar tatuador"}
        roles={roles.filter(r => visibleRoles.includes(r.nombre.trim().toLowerCase()))} modalities={modalities} onCreated={created} onClose={() => setAdding(false)} />}
      {editing && <EditUserModal person={editing} modalities={modalities}
        roles={isAdmin ? roles.filter(r => visibleRoles.includes(r.nombre.trim().toLowerCase())) : []}
        onSaved={saved} onClose={() => setEditing(null)} />}
      {confirmModal}
    </section>
  );
}
