import { useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Reservas from "./pages/Reservas";
import Calendario from "./pages/Calendario";
import { homeForUser } from "./utils/access";
import ModuleAccess from "./components/ModuleAccess";

function App() {
  const [user, setUser] = useState(null);
  return (
    <Routes>
      <Route path="/login" element={<Login setUser={setUser} />} />

      <Route
        path="/"
        element={user ? <Dashboard user={user} onLogout={() => setUser(null)} /> : <Navigate to="/login" replace />}
      >
        <Route index element={<Navigate to={homeForUser(user)} replace />} />
        <Route path="reservas" element={<ModuleAccess user={user} moduleId="reservas"><Reservas user={user} /></ModuleAccess>} />
        <Route path="mis-reservas" element={<ModuleAccess user={user} moduleId="mis-reservas"><Reservas user={user} personal /></ModuleAccess>} />
        <Route path="calendario" element={<ModuleAccess user={user} moduleId="calendario"><Calendario user={user} /></ModuleAccess>} />
      </Route>

      <Route path="*" element={<Navigate to={user ? homeForUser(user) : "/login"} replace />} />
    </Routes>
  );
}

export default App;
