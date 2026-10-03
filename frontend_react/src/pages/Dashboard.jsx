import okamiLogo from "../assets/okami.svg";
import "./Dashboard.css";

export default function Dashboard({ user }) {
  return (
    <div className="dashboard">

      <aside className="dashboard-sidebar">

        <div className="sidebar-user">
          <img
            src={okamiLogo}
            alt="Okami"
            className="sidebar-logo"
          />

          <p className="sidebar-welcome">
            BIENVENIDO
          </p>

          <h2>
            {user?.name || "Usuario"}
          </h2>

          <span>
            {user?.role || ""}
          </span>
        </div>

        <nav className="sidebar-menu">

          <button className="sidebar-item active">
            Próximas Reservas
          </button>

          <button className="sidebar-item">
            Reservas de Hoy
          </button>

          <button className="sidebar-item">
            Historial de Reservas
          </button>

        </nav>

      </aside>


      <main className="dashboard-content">

        <p className="dashboard-label">
          RESERVAS
        </p>

        <h1>
          Próximas Reservas
        </h1>

        <p className="dashboard-description">
          Aquí se mostrarán las próximas reservas del estudio.
        </p>

        <section className="content-card">

          <div className="empty-state">
            Sin información cargada
          </div>

        </section>

      </main>

    </div>
  );
}