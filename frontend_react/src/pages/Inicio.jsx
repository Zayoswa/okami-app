import { Link } from "react-router-dom";
import { modulesForUser } from "../config/navigation";
import { todayInSantiago } from "../utils/calendar";
import { formatFullDate } from "../utils/format";
import "./Inicio.css";

// Íconos de línea de 24 px, uno por módulo (usan currentColor).
const ICONS = {
  "mi-panel": <><path d="M4 20V14" /><path d="M10 20V9" /><path d="M16 20v-4" /><path d="M22 20H2" /><circle cx="18" cy="6" r="2.5" /></>,
  dashboard: <><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></>,
  arriendos: <><rect x="2.5" y="6" width="19" height="13" rx="2" /><path d="M2.5 10h19" /><path d="M7 15h3" /></>,
  reservas: <><rect x="5" y="3.5" width="14" height="17.5" rx="2" /><path d="M9 3.5h6v3H9z" /><path d="M8.5 11h7" /><path d="M8.5 15h5" /></>,
  "mis-reservas": <><rect x="5" y="3.5" width="14" height="17.5" rx="2" /><path d="M9 3.5h6v3H9z" /><path d="m9 13 2 2 4-4" /></>,
  calendario: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M8 3v4" /><path d="M16 3v4" /></>,
  tatuadores: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" /><path d="M18.5 14.8c1.6.8 2.7 2.5 3 5.2" /></>,
  puestos: <><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></>,
  actividad: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  alertas: <><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 21h4" /></>,
  perfil: <><circle cx="12" cy="8" r="4" /><path d="M4 21c.8-4.2 4-6.5 8-6.5s7.2 2.3 8 6.5" /></>,
  documentacion: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /><path d="M9 12h6" /><path d="M9 16h6" /></>,
};

function ModuleIcon({ id }) {
  return (
    <svg className="inicio-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[id] ?? <circle cx="12" cy="12" r="8" />}
    </svg>
  );
}

// Inicio: un botón grande por módulo, pensado sobre todo para el celular.
// Los módulos "Próximamente" se muestran sin enlace.
export default function Inicio({ user }) {
  const modules = modulesForUser(user).filter((module) => module.id !== "inicio");
  const disponibles = modules.filter((module) => !module.comingSoon);
  const proximos = modules.filter((module) => module.comingSoon);
  const nombre = (user?.name ?? "").trim().split(/\s+/)[0];

  return (
    <section className="inicio-page">
      <p className="dashboard-label">INICIO</p>
      <h1>Hola{nombre ? `, ${nombre}` : ""}</h1>
      <p className="dashboard-description inicio-date">{formatFullDate(todayInSantiago())}</p>

      <nav aria-label="Módulos">
        <ul className="inicio-grid">
          {disponibles.map((module) => (
            <li key={module.id}>
              <Link to={module.path} className="inicio-tile">
                <span className="inicio-tile-icon"><ModuleIcon id={module.id} /></span>
                <span className="inicio-tile-text">
                  <strong>{module.name}</strong>
                  {module.description && <span>{module.description}</span>}
                </span>
                <span className="inicio-tile-arrow" aria-hidden="true">›</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {proximos.length > 0 && (
        <>
          <h2 className="inicio-subtitle">Próximamente</h2>
          <ul className="inicio-grid inicio-grid--soon">
            {proximos.map((module) => (
              <li key={module.id} className="inicio-tile inicio-tile--soon" aria-disabled="true">
                <span className="inicio-tile-icon"><ModuleIcon id={module.id} /></span>
                <span className="inicio-tile-text"><strong>{module.name}</strong><span>Todavía no está disponible</span></span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
