import { useState } from "react";
import { useNavigate } from "react-router-dom";
import okamiLogo from "../assets/okami.svg";
import { signIn } from "../services/authService";
import { homeForUser } from "../utils/access";
import "./Login.css";



export default function Login({ setUser }) {
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [message, setMessage] = useState("");
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit(event) {
        event.preventDefault();
        if (submitting) return;
        setMessage("");
        setSubmitting(true);

        try {
        const user = await signIn(email, password);
        setUser(user);
        navigate(homeForUser(user), { replace: true });

        } catch (error) {
        setMessage(error instanceof Error ? error.message : "No se pudo iniciar sesión.");
        } finally {
        setSubmitting(false);
        }
    }
    return (
        <main className="login-page">
        <section className="login-card">

            <img
            src={okamiLogo}
            alt="Okami"
            className="login-logo"
            />

            <h1>Okami APP</h1>

            <p className="login-subtitle">
            Gestión del estudio
            </p>

            <form className="login-form" onSubmit={handleSubmit}>

            <input
                type="email"
                placeholder="Correo electrónico"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
            />

            <input
                type="password"
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
            />

            <button type="submit" disabled={submitting}>
                {submitting ? "Entrando…" : "Entrar"}
            </button>

            {message && (
                <p className="login-message" role="alert">
                {message}
                </p>
            )}

            </form>

        </section>
        </main>
    );
    } 
