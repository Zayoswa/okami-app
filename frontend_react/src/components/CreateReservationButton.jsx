export default function CreateReservationButton({ onClick, disabled = false }) {

    return (
        <button type="button" className="reservation-button reservation-create" onClick={onClick} disabled={disabled}>Crear reserva</button>
    );
}
