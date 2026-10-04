import { useLocation, useNavigate } from "react-router-dom";
import okamiLogo from "../assets/okami.svg";
import { modulesForUser } from "../config/navigation";

export default function Sidebar({ user, onLogout }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  function handleLogout() {
    onLogout();
    navigate("/login", { replace: true });
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
      <button type="button" className="sidebar-item sidebar-logout" onClick={handleLogout}>
        Cerrar sesión
      </button>
    </aside>
  );
}
