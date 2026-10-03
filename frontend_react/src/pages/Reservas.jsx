import { useState } from "react";

// Estos son datos de ejemplos. Recordar Borrar
import { reservasMock } from "../data/reservasMock.js";


export default function Reservas() {
    // MOCKUP DE RESERVAS, SE PUEDE ELIMINAR CUANDO SE TENGA INFORMACION REAL PARA MOSTRAR
    const [reservas, setReservas] = useState(reservasMock);

    return (
        <div>
            <h1>Reservas</h1>
            <p>Lista de reservas</p>
            <button>Agregar Reserva</button>
            
        </div>
    );
}


