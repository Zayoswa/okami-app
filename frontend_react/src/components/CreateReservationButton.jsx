export default function CreateReservationButton({ onClick }) {

    return (
        <button type="button" className="reservation-button reservation-create" onClick={onClick}>Crear reserva</button>
    );
}
