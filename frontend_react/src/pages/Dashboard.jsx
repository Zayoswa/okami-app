import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import "./Dashboard.css";

export default function Dashboard({ user, onLogout }) {
  return (
    <div className="dashboard">
      <Sidebar user={user} onLogout={onLogout} />

      <main className="dashboard-content">
        <Outlet />
      </main>
    </div>
  );
}
