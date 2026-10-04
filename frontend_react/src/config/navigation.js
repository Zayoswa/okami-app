export const navigation = [
  { id: "dashboard", label: "Dashboard Gerencial (Proximamente)", comingSoon: true, roles: ["admin"] },
  { id: "reservas", path: "/reservas", label: "Reservas Generales", roles: ["admin"] },
  { id: "mis-reservas", path: "/mis-reservas", label: "Mis Reservas", roles: ["tatuador"] },
  { id: "calendario", path: "/calendario", label: "Calendario", roles: ["admin", "tatuador"] },
  { id: "tatuadores", label: "Tatuadores (Proximamente)", comingSoon: true, roles: ["admin"] },
  { id: "alertas", label: "Alertas (Proximamente)", comingSoon: true, roles: ["admin", "tatuador"] },
  { id: "perfil", label: "Perfil (Proximamente)", comingSoon: true, roles: ["admin", "tatuador"] },
  { id: "documentacion", label: "Documentacion (Proximamente)", comingSoon: true, roles: ["admin"] },
];

export function modulesForUser(user) {
  const order = user?.role === "admin"
    ? ["alertas", "dashboard", "calendario", "reservas", "tatuadores", "perfil", "documentacion"]
    : ["mis-reservas", "calendario", "alertas", "perfil"];
  return order
    .map((id) => navigation.find((module) => module.id === id))
    .filter((module) => module?.roles.includes(user?.role))
    .sort((a, b) => Number(Boolean(a.comingSoon)) - Number(Boolean(b.comingSoon)));
}

export function canAccessModule(user, moduleId) {
  return navigation.some((module) => module.id === moduleId && module.roles.includes(user?.role));
}
