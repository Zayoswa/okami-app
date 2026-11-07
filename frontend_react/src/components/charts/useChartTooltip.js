import { useCallback, useRef, useState } from "react";

// Tooltip compartido por los gráficos: se posiciona dentro del contenedor del gráfico,
// sigue al puntero y también aparece al enfocar la marca con el teclado.
export default function useChartTooltip() {
  const containerRef = useRef(null);
  const [tip, setTip] = useState(null);

  const show = useCallback((event, content) => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;
    // Con teclado no hay puntero: se usa el centro de la marca enfocada.
    const target = event.currentTarget?.getBoundingClientRect?.();
    const x = event.clientX ?? (target ? target.left + target.width / 2 : box.left);
    const y = event.clientY ?? (target ? target.top : box.top);
    setTip({ x: x - box.left, y: y - box.top, content, flip: x - box.left > box.width * 0.6 });
  }, []);

  const hide = useCallback(() => setTip(null), []);

  return { containerRef, tip, show, hide };
}
