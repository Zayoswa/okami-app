import { useEffect, useRef } from "react";

// Vuelve a pedir los datos en segundo plano, para ver los cambios que hacen otras personas:
//   1. cada `interval` milisegundos (60 s por defecto) mientras la pestaña está a la vista;
//   2. al volver a la pestaña o a la ventana de la app.
// No muestra pantalla de carga ni errores: si una recarga falla, se reintenta en la siguiente.
// `enabled` en false la pausa (por ejemplo, mientras carga por primera vez o se guarda un cambio).
export default function useAutoRefresh(refresh, { interval = 60000, enabled = true } = {}) {
  // Siempre la versión más reciente de `refresh`, sin reiniciar el temporizador en cada render.
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; });

  useEffect(() => {
    if (!enabled) return undefined;
    let running = false;
    let last = Date.now();

    async function run() {
      // Sin la pestaña a la vista no se pide nada; tampoco dos recargas a la vez.
      if (running || document.visibilityState === "hidden") return;
      running = true;
      try {
        await refreshRef.current();
        last = Date.now();
      } catch {
        // Silencioso: los datos en pantalla se mantienen y se reintenta en la próxima vuelta.
      } finally {
        running = false;
      }
    }

    // Al volver a la app solo recarga si pasaron más de 5 s desde la última vez.
    function onReturn() {
      if (document.visibilityState === "visible" && Date.now() - last > 5000) run();
    }

    const timer = setInterval(run, interval);
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [interval, enabled]);
}
