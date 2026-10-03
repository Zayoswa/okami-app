import { Outlet, useLocation, useNavigate } from "react-router-dom";
import okamiLogo from "../assets/okami.svg";
import "./Dashboard.css";

export default function Dashboard({ user }) {
  const navigate = useNavigate();

  //Sirve para obtener la ruta actual y poder resaltar el botón activo en la barra lateral
  const location = useLocation();
  const currentPath = location.pathname;

  return (
    //CONTENEDOR PRINCIPAL DEL DASHBOARD
    <div className="dashboard">
      <aside className="dashboard-sidebar">
        <div className="sidebar-user">
          <img src={okamiLogo} alt="Okami" className="sidebar-logo" />
          <p className="sidebar-welcome">BIENVENIDO</p>
          <h2>{user?.name || "Usuario"}</h2>
          <span>{user?.role || ""}</span>
        </div>
        <nav className="sidebar-menu">
          <button
            // Agrega la clase "active" al botón si la ruta actual es "/". Hace que se resalte negro jejeje
            className={`sidebar-item ${currentPath === "/" ? "active" : ""}`}
            onClick={() => navigate("/")}
          >
            Dashboard
          </button>

          <button
          // Agrega la clase "active" al botón si la ruta actual es "/". Hace que se resalte negro jejeje
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





    
      <main className="dashboard-content">
        <Outlet />
      </main>
    </div>
  );
}
