import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import okamiLogo from "../assets/okami.svg";
import { modulesForUser } from "../config/navigation";

export default function Sidebar({ user, onLogout }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function handleLogout() {
    setBusy(true);
    setError("");
    try { await onLogout(); navigate("/login", { replace: true }); }
    catch { setError("No se confirmó el cierre remoto. La sesión local se eliminó. Recarga la página."); }
    finally { setBusy(false); }
  }

  return (
    <aside className="dashboard-sidebar">
      <div className="sidebar-user">
        <img src={okamiLogo} alt="Okami" className="sidebar-logo" />
        <p className="sidebar-welcome">BIENVENIDO</p>
        <h2>{user?.name || "Usuario"}</h2>
        <span>{user?.role || ""}</span>
      </div>
      <nav className="sidebar-menu">
        {modulesForUser(user).map((module) => (
          <button
            key={module.id}
            type="button"
            className={`sidebar-item ${module.path === pathname ? "active" : ""}`}
            aria-current={module.path === pathname ? "page" : undefined}
            onClick={module.path ? () => navigate(module.path) : undefined}
          >
            {module.label}
          </button>
        ))}
      </nav>
      {error && <p role="alert">{error}</p>}
      <button disabled={busy} type="button" className="sidebar-item sidebar-logout" onClick={handleLogout}>
        Cerrar sesión
      </button>
    </aside>
  );
}
