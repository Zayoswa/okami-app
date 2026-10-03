import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/login";
import Dashboard from "./pages/Dashboard";
import Reservas from "./pages/Reservas";

function App() {
  const [status, setStatus] = useState("Cargando...");
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch("http://127.0.0.1:8000/health")
      .then((response) => response.json())
      .then((data) => {
        setStatus(data.status);
      })
      .catch((error) => {
        console.error("Error conectando con backend:", error);
        setStatus("Error");
      });
  }, []);


// REACT DOM ROUTER SIRVE PARA GESTIONAR LAS RUTAS DE LA APLICACIÓN.
  return (
    <Routes>
      <Route path="/login" element={<Login setUser={setUser} />} />

      <Route
        path="/"
        element={user ? <Dashboard user={user} /> : <Navigate to="/login" replace />}
      >
        <Route index element={<DashboardHome />} />
        <Route path="reservas" element={<Reservas />} />
      </Route>

      <Route path="*" element={<Navigate to={user ? "/" : "/login"} replace />} />
    </Routes>
  );
}


// MOCKUP DE LA PAGINA PRINCIPAL DEL DASHBOARD, 
// SE PUEDE ELIMINAR CUANDO SE TENGA INFORMACION REAL PARA MOSTRAR
function DashboardHome() {
  return (
    <>
      <p className="dashboard-label">Dashboard</p>
      <h1>Resumen de Informacion Proximamente</h1>
      <p className="dashboard-description">
        Aquí se mostrarán las próximas reservas del estudio, graficos, accesos rapidos, etc.
      </p>
      <section className="content-card">
        <div className="empty-state">Sin información cargada</div>
      </section>
    </>
  );
}



export default App;