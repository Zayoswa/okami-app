import { useState } from "react";

// Campo de contraseña con el botón "ojo" para ver lo que se escribió.
// Recibe los mismos atributos que un <input> (value, onChange, autoComplete, required, minLength…).
// Los estilos viven en pages/Login.css (.login-password y .login-password-toggle), usados por Login e Invitación.
export default function PasswordInput(props) {
  const [visible, setVisible] = useState(false);
  const label = visible ? "Ocultar contraseña" : "Mostrar contraseña";
  return (
    <div className="login-password">
      <input {...props} type={visible ? "text" : "password"} />
      {/* type="button": solo cambia la vista, no envía el formulario. */}
      <button type="button" className="login-password-toggle" onClick={() => setVisible((current) => !current)}
        aria-label={label} aria-pressed={visible} title={label}>
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.4 0 10 7 10 7a17.6 17.6 0 0 1-2.2 3.2" />
      <path d="M6.6 6.6A17.4 17.4 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="M2 2l20 20" />
    </svg>
  );
}
