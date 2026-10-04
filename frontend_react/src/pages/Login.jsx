import { useState } from "react";
import { useNavigate } from "react-router-dom";
import okamiLogo from "../assets/okami.svg";
import { API_BASE_URL } from "../config/api";
import { homeForUser } from "../utils/access";
import "./Login.css";

export default function Login({ setUser }) {
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [message, setMessage] = useState("");

    async function handleSubmit(event) {
        event.preventDefault();
        setMessage("");

        try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: "POST",
            headers: {
            "Content-Type": "application/json",
            },
            body: JSON.stringify({
            email,
            password,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            setMessage(data.detail || "Correo o contraseña incorrectos");
            return;
        }

        setUser(data.user);
        navigate(homeForUser(data.user), { replace: true });

        } catch (error) {
        console.error("Error al iniciar sesión:", error);
        setMessage("No se pudo conectar con el servidor");
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

            <button type="submit">
                Entrar
            </button>

            {message && (
                <p className="login-message">
                {message}
                </p>
            )}

            </form>

        </section>
        </main>
    );
    }
