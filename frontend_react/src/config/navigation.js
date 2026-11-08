// Módulos de la app. label: texto del menú lateral; name y description: botón de la página Inicio.
export const navigation = [
  { id: "inicio", path: "/inicio", label: "Inicio", name: "Inicio", roles: ["admin", "tatuador"] },
  { id: "dashboard", path: "/dashboard", label: "Dashboard", name: "Dashboard", description: "Arriendo del mes, ventas y sesiones por cerrar", roles: ["admin"] },
  { id: "arriendos", path: "/arriendos", label: "Arriendos", name: "Arriendos", description: "Lo que paga cada tatuador y sus pagos", roles: ["admin"] },
  { id: "reservas", path: "/reservas", label: "Reservas", name: "Reservas", description: "Crear, buscar y cerrar reservas", roles: ["admin"] },
  { id: "mi-panel", path: "/mi-panel", label: "Mi panel", name: "Mi panel", description: "Tus ganancias, sesiones y arriendo del mes", roles: ["tatuador"] },
  { id: "mis-reservas", path: "/mis-reservas", label: "Mis reservas", name: "Mis reservas", description: "Tus reservas y sus sesiones", roles: ["tatuador"] },
  { id: "calendario", path: "/calendario", label: "Calendario", name: "Calendario", description: "Sesiones de la semana por puesto", roles: ["admin", "tatuador"] },
  { id: "tatuadores", path: "/tatuadores", label: "Tatuadores", name: "Tatuadores", description: "Registro, acceso y modalidad", roles: ["admin"] },
  { id: "actividad", path: "/actividad", label: "Actividad", name: "Actividad", description: "Quién hizo qué y cuándo en el estudio", roles: ["admin"] },
  { id: "puestos", path: "/espacios", label: "Espacios", name: "Espacios", description: "Estado, tipo y titulares de los puestos", roles: ["admin"] },
  { id: "alertas", label: "Alertas (Proximamente)", name: "Alertas", comingSoon: true, roles: ["admin", "tatuador"] },
  { id: "perfil", label: "Perfil (Proximamente)", name: "Perfil", comingSoon: true, roles: ["admin", "tatuador"] },
  { id: "documentacion", label: "Documentacion (Proximamente)", name: "Documentación", comingSoon: true, roles: ["admin"] },
];

export function modulesForUser(user) {
  const order = user?.role === "admin"
    ? ["inicio", "alertas", "dashboard", "arriendos", "calendario", "reservas", "tatuadores", "puestos", "actividad", "perfil", "documentacion"]
    : ["inicio", "mi-panel", "mis-reservas", "calendario", "alertas", "perfil"];
  return order
    .map((id) => navigation.find((module) => module.id === id))
    .filter((module) => module?.roles.includes(user?.role))
    .sort((a, b) => Number(Boolean(a.comingSoon)) - Number(Boolean(b.comingSoon)));
}

export function canAccessModule(user, moduleId) {
  return navigation.some((module) => module.id === moduleId && module.roles.includes(user?.role));
}
