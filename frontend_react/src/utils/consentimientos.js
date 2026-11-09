import { formatRut, normalizeRut, rutValidationError } from "./rut.js";
import { clientNameError } from "./clientName.js";

// Límites: los mismos que valida el servidor (y los que caben en la plantilla PDF).
export const CONSENT_LIMITS = { descripcion: 160, zonaCuerpo: 80, condiciones: 160, direccion: 120, telefono: 20, nombre: 120 };
export const TATTOO_TYPES = ["Nuevo", "Cover", "Retoque"];
const PHONE = /^[0-9+() -]{6,20}$/;

// Edad en años cumplidos a una fecha (ambas "YYYY-MM-DD"). null si falta la fecha de nacimiento.
export function ageOn(birth, date) {
  if (!birth || !date) return null;
  const [by, bm, bd] = birth.split("-").map(Number);
  const [y, m, d] = date.split("-").map(Number);
  return y - by - ((m < bm || (m === bm && d < bd)) ? 1 : 0);
}

export function isMinor(form) {
  const age = ageOn(form.clienteNacimiento, form.fecha);
  return age !== null && age < 18;
}

export function emptyConsent(today, tatuadorId = "") {
  return {
    fecha: today, reservaId: "", tatuadorId,
    tatuadorRut: "", tatuadorNacimiento: "", tatuadorTelefono: "",
    clienteNombre: "", clienteRut: "", clienteNacimiento: "", clienteTelefono: "", clienteDireccion: "",
    representanteNombre: "", representanteRut: "", representanteNacimiento: "", representanteTelefono: "",
    descripcion: "", zonaCuerpo: "", condiciones: "", tipoTatuaje: "Nuevo",
  };
}

// Datos que se copian de una reserva: cliente, tatuador, zona y diseño (recortado al largo de la plantilla).
export function fromReservation(form, reserva) {
  if (!reserva) return { ...form, reservaId: "" };
  return {
    ...form,
    reservaId: reserva.id,
    tatuadorId: String(reserva.tatuadorId ?? form.tatuadorId),
    clienteNombre: reserva.cliente ?? form.clienteNombre,
    clienteRut: formatRut(reserva.clienteRut ?? form.clienteRut),
    zonaCuerpo: (reserva.zonaCuerpo ?? form.zonaCuerpo ?? "").slice(0, CONSENT_LIMITS.zonaCuerpo),
    descripcion: (reserva.descripcionDiseno ?? form.descripcion ?? "").replace(/\s+/g, " ").trim().slice(0, CONSENT_LIMITS.descripcion),
  };
}

function rutError(value, who) {
  const error = rutValidationError(value);
  return error ? `RUT ${who}: ${error.charAt(0).toLowerCase()}${error.slice(1).replace(" del cliente", "")}` : "";
}

// Primer problema del formulario, o "" si se puede guardar. today = "YYYY-MM-DD" (Santiago).
export function consentError(form, today) {
  if (!form.fecha || form.fecha > today) return "Indica la fecha del consentimiento (hoy o un día anterior).";
  if (!form.tatuadorId) return "Elige el tatuador.";
  const artistRut = rutError(form.tatuadorRut, "del tatuador");
  if (artistRut) return artistRut;
  const name = clientNameError(form.clienteNombre);
  if (name) return name;
  const clientRut = rutValidationError(form.clienteRut);
  if (clientRut) return clientRut;
  if (!form.clienteNacimiento) return "Ingresa la fecha de nacimiento del cliente.";
  for (const [label, birth] of [["del tatuador", form.tatuadorNacimiento], ["del cliente", form.clienteNacimiento], ["del representante", form.representanteNacimiento]]) {
    if (birth && (birth > form.fecha || birth < "1900-01-01")) return `La fecha de nacimiento ${label} no es válida.`;
  }
  for (const [label, phone] of [["del tatuador", form.tatuadorTelefono], ["del cliente", form.clienteTelefono], ["del representante", form.representanteTelefono]]) {
    if (phone.trim() && !PHONE.test(phone.trim())) return `El teléfono ${label} solo puede tener números, espacios, + y guiones.`;
  }
  if (isMinor(form)) {
    if (!form.representanteNombre.trim() || !form.representanteRut.trim()) return "El cliente es menor de edad: ingresa el nombre y RUT de su representante legal.";
    const repName = clientNameError(form.representanteNombre);
    if (repName) return repName.replace("del cliente", "del representante");
    const repRut = rutError(form.representanteRut, "del representante");
    if (repRut) return repRut;
  }
  if (!form.descripcion.trim()) return "Describe el tatuaje a realizar.";
  if (!form.zonaCuerpo.trim()) return "Indica la zona del cuerpo.";
  return "";
}

// Cuerpo de POST /api/consentimientos: RUT sin puntos ni guion, vacíos como null y sin representante si es adulto.
export function consentPayload(form) {
  const text = (value) => value.replace(/\s+/g, " ").trim() || null;
  const minor = isMinor(form);
  return {
    fecha: form.fecha,
    reservaId: form.reservaId || null,
    tatuadorId: form.tatuadorId,
    tatuadorRut: normalizeRut(form.tatuadorRut),
    tatuadorNacimiento: form.tatuadorNacimiento || null,
    tatuadorTelefono: text(form.tatuadorTelefono),
    clienteNombre: text(form.clienteNombre),
    clienteRut: normalizeRut(form.clienteRut),
    clienteNacimiento: form.clienteNacimiento,
    clienteTelefono: text(form.clienteTelefono),
    clienteDireccion: text(form.clienteDireccion),
    representanteNombre: minor ? text(form.representanteNombre) : null,
    representanteRut: minor ? normalizeRut(form.representanteRut) : null,
    representanteNacimiento: minor ? form.representanteNacimiento || null : null,
    representanteTelefono: minor ? text(form.representanteTelefono) : null,
    descripcion: text(form.descripcion),
    zonaCuerpo: text(form.zonaCuerpo),
    condiciones: text(form.condiciones),
    tipoTatuaje: form.tipoTatuaje,
  };
}

export function folioLabel(folio) {
  return String(folio ?? "").padStart(6, "0");
}
