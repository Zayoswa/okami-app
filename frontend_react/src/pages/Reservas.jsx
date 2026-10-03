import { reservasMock } from "../data/reservasMock";
import ReservationCard from "../components/ReservationCard";
import AddReservationButton from "../components/addReservationButton";
import "./Reservas.css";

export default function Reservas() {
    return (
        <main className="reservas-page">
        <div className="reservas-header">
            <p className="reservas-label">RESERVAS</p>

            <h1>Reservas del estudio</h1>

            <p className="reservas-description">
            Visualiza las reservas actualmente registradas.
            </p>

            <AddReservationButton />
        </div>

        <section className="reservas-container">
            {reservasMock.map((reserva) => (
            <ReservationCard key={reserva.id} reserva={reserva} />
            ))}
        </section>
        </main>
    );
    }