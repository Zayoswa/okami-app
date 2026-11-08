import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import okamiLogo from "../assets/okami.svg";
import { modulesForUser } from "../config/navigation";

// Escritorio: menú lateral. Celular (menos de 768 px): barra superior con el módulo actual,
// un botón a Inicio (donde están todos los módulos) y Salir. El CSS muestra solo uno de los dos.

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

  const modules = modulesForUser(user);
  const current = modules.find((module) => module.path === pathname);
  const onHome = pathname === "/inicio";

  return (
    <>
    <header className="mobile-bar">
      <img src={okamiLogo} alt="Okami" className="mobile-bar-logo" />
      <p className="mobile-bar-title">{current?.name ?? "Okami"}</p>
      {!onHome && (
        <button type="button" className="mobile-bar-button" onClick={() => navigate("/inicio")} aria-label="Ir a Inicio">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
          </svg>
          Inicio
        </button>
      )}
      <button type="button" className="mobile-bar-button mobile-bar-logout" disabled={busy} onClick={handleLogout}>Salir</button>
    </header>
    {error && <p className="mobile-bar-error" role="alert">{error}</p>}
    <aside className="dashboard-sidebar">
      <div className="sidebar-user">
        <img src={okamiLogo} alt="Okami" className="sidebar-logo" />
        <p className="sidebar-welcome">BIENVENIDO</p>
        <h2>{user?.name || "Usuario"}</h2>
        <span>{user?.role || ""}</span>
      </div>
      <nav className="sidebar-menu">
        {modules.map((module) => (
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
    </>
  );
}
