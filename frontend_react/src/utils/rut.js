// El RUT se guarda en forma canónica: solo dígitos y K mayúscula (ej. 12345678K).
// El formato con puntos y guion es solo de presentación.
export function normalizeRut(value) {
  return String(value ?? "").toUpperCase().replace(/[^0-9K]/g, "");
}

export function rutVerifier(body) {
  const digits = String(body ?? "");
  if (!/^\d{1,9}$/.test(digits) || /^0+$/.test(digits)) return "";
  let factor = 2;
  let sum = 0;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    sum += Number(digits[index]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const result = 11 - (sum % 11);
  return result === 11 ? "0" : result === 10 ? "K" : String(result);
}

export function rutValidationError(value) {
  const rut = normalizeRut(value);
  if (!rut) return "Ingresa el RUT del cliente con su dígito verificador.";
  if (!/^\d{1,9}[0-9K]$/.test(rut) || /^0+$/.test(rut.slice(0, -1))) return "Ingresa un RUT válido, por ejemplo 12.345.678-5.";
  if (rutVerifier(rut.slice(0, -1)) !== rut.slice(-1)) return "El dígito verificador no corresponde al RUT ingresado.";
  return "";
}

export function formatRut(value) {
  const rut = normalizeRut(value);
  if (rut.length < 2) return rut;
  const body = rut.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${body}-${rut.slice(-1)}`;
}
