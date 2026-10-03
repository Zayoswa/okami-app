import { useLocation, useNavigate } from "react-router-dom";
import okamiLogo from "../assets/okami.svg";

export default function Sidebar({ user }) {
    const navigate = useNavigate();
    const location = useLocation();
    const currentPath = location.pathname;

    return (
        <aside className="dashboard-sidebar">
        <div className="sidebar-user">
            <img src={okamiLogo} alt="Okami" className="sidebar-logo" />
            <p className="sidebar-welcome">BIENVENIDO</p>
            <h2>{user?.name || "Usuario"}</h2>
            <span>{user?.role || ""}</span>
        </div>

        <nav className="sidebar-menu">
            <button
            className={`sidebar-item ${currentPath === "/" ? "active" : ""}`}
            onClick={() => navigate("/")}
            >
            Dashboard
            </button>

            <button
            className={`sidebar-item ${currentPath === "/reservas" ? "active" : ""}`}
            onClick={() => navigate("/reservas")}
            >
            Reservas
            </button>

            <button className="sidebar-item">
            Historial de Reservas
            </button>
        </nav>
        </aside>
    );
    }
