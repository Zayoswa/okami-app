import { lazy, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import { homeForUser } from "./utils/access";
import ModuleAccess from "./components/ModuleAccess";
import LoadingScreen from "./components/LoadingScreen";

import { restoreSession, signOut } from "./services/authService";
import Invitacion from "./pages/Invitacion";
import Espacios from "./pages/Espacios";

// Los módulos se cargan bajo demanda; mientras llega su código,
// el <Suspense> de Dashboard muestra la pantalla de carga.
const Reservas = lazy(() => import("./pages/Reservas"));
const MisReservas = lazy(() => import("./pages/MisReservas"));
const Calendario = lazy(() => import("./pages/Calendario"));
const Tatuadores = lazy(() => import("./pages/Tatuadores"));
const Gerencial = lazy(() => import("./pages/Gerencial"));
const Arriendos = lazy(() => import("./pages/Arriendos"));
const Inicio = lazy(() => import("./pages/Inicio"));
const MiPanel = lazy(() => import("./pages/MiPanel"));
const Actividad = lazy(() => import("./pages/Actividad"));

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => window.location.pathname !== "/invitacion");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (window.location.pathname === "/invitacion") return;
    restoreSession().then(value => { if (active) setUser(value); })
      .catch(cause => { if (active) setError(cause.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => {
      restoreSession().catch(cause => {
        if (cause.status === 401 || cause.status === 403) { setUser(null); setError(cause.message); }
      });
    }, 60000);
    return () => clearInterval(timer);
  }, [user]);
  async function logout() {
    try { await signOut(); } finally { setUser(null); }
  }
  if (loading) return <LoadingScreen fullScreen message="Comprobando sesión…" />;
  return (
    <> {error && <p role="alert">{error}</p>}<Routes>
      <Route path="/invitacion" element={<Invitacion setUser={setUser} />} />
      <Route path="/login" element={<Login setUser={setUser} />} />

      <Route
        path="/"
        element={user ? <Dashboard user={user} onLogout={logout} /> : <Navigate to="/login" replace />}
      >
        <Route index element={<Navigate to={homeForUser(user)} replace />} />
        <Route path="inicio" element={<ModuleAccess user={user} moduleId="inicio"><Inicio user={user} /></ModuleAccess>} />
        <Route path="actividad" element={<ModuleAccess user={user} moduleId="actividad"><Actividad /></ModuleAccess>} />
        <Route path="mi-panel" element={<ModuleAccess user={user} moduleId="mi-panel"><MiPanel user={user} /></ModuleAccess>} />
        <Route path="dashboard" element={<ModuleAccess user={user} moduleId="dashboard"><Gerencial user={user} /></ModuleAccess>} />
        <Route path="arriendos" element={<ModuleAccess user={user} moduleId="arriendos"><Arriendos /></ModuleAccess>} />
        <Route path="reservas" element={<ModuleAccess user={user} moduleId="reservas"><Reservas user={user} /></ModuleAccess>} />
        <Route path="mis-reservas" element={<ModuleAccess user={user} moduleId="mis-reservas"><MisReservas user={user} /></ModuleAccess>} />
        <Route path="tatuadores" element={<ModuleAccess user={user} moduleId="tatuadores"><Tatuadores /></ModuleAccess>} />
        <Route path="espacios" element={<ModuleAccess user={user} moduleId="puestos"><Espacios user={user} /></ModuleAccess>} />
        <Route path="calendario" element={<ModuleAccess user={user} moduleId="calendario"><Calendario user={user} /></ModuleAccess>} />
      </Route>

      <Route path="*" element={<Navigate to={user ? homeForUser(user) : "/login"} replace />} />
    </Routes></>
  );
}

export default App;
