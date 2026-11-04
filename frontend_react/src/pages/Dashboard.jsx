import { Suspense } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import LoadingScreen from "../components/LoadingScreen";
import "./Dashboard.css";

export default function Dashboard({ user, onLogout }) {
  const { pathname } = useLocation();
  return (
    <div className="dashboard">
      <Sidebar user={user} onLogout={onLogout} />

      <main className="dashboard-content">
        <Suspense key={pathname} fallback={<LoadingScreen message="Cargando módulo…" />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
