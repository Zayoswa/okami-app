import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Reservas from "./pages/Reservas";
import MisReservas from "./pages/MisReservas";
import Calendario from "./pages/Calendario";
import { homeForUser } from "./utils/access";
import ModuleAccess from "./components/ModuleAccess";

import { restoreSession, signOut } from "./services/authService";
import Tatuadores from "./pages/Tatuadores";
import Invitacion from "./pages/Invitacion";

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
  if (loading) return <p role="status">Comprobando sesión…</p>;
  return (
    <> {error && <p role="alert">{error}</p>}<Routes>
      <Route path="/invitacion" element={<Invitacion setUser={setUser} />} />
      <Route path="/login" element={<Login setUser={setUser} />} />

      <Route
        path="/"
        element={user ? <Dashboard user={user} onLogout={logout} /> : <Navigate to="/login" replace />}
      >
        <Route index element={<Navigate to={homeForUser(user)} replace />} />
        <Route path="reservas" element={<ModuleAccess user={user} moduleId="reservas"><Reservas user={user} /></ModuleAccess>} />
        <Route path="mis-reservas" element={<ModuleAccess user={user} moduleId="mis-reservas"><MisReservas user={user} /></ModuleAccess>} />
        <Route path="tatuadores" element={<ModuleAccess user={user} moduleId="tatuadores"><Tatuadores /></ModuleAccess>} />
        <Route path="calendario" element={<ModuleAccess user={user} moduleId="calendario"><Calendario user={user} /></ModuleAccess>} />
      </Route>

      <Route path="*" element={<Navigate to={user ? homeForUser(user) : "/login"} replace />} />
    </Routes></>
  );
}

export default App;
