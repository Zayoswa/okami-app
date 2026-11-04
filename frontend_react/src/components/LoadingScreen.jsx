import "./LoadingScreen.css";

const DOTS = 6;

// Pantalla de carga: seis círculos que giran persiguiéndose.
// fullScreen ocupa toda la ventana (comprobación de sesión);
// sin él se ajusta al área de contenido del módulo.
export default function LoadingScreen({ message = "Cargando…", fullScreen = false }) {
  return (
    <div className={`loading-screen ${fullScreen ? "loading-screen--full" : ""}`} role="status" aria-live="polite">
      <div className="loading-chase" aria-hidden="true">
        {Array.from({ length: DOTS }, (_, index) => <span key={index} className="loading-chase-dot" />)}
      </div>
      <p className="loading-message">{message}</p>
    </div>
  );
}
