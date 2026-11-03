# Activar reservas reales

La app consulta, crea, edita y elimina reservas mediante FastAPI y Supabase. Usa los clientes existentes, tatuadores activos y espacios de la base de datos. Las reservas de demostración y los cambios guardados en el navegador ya no se leen ni se importan.

1. Confirma que la configuración de [acceso cerrado](acceso-cerrado.md) funciona y que están cargados los espacios.
2. Revisa y ejecuta [003_reservas_reales.sql](../backend-fastapi/migrations/003_reservas_reales.sql) en **Supabase → SQL Editor**. Agrega funciones de reservas, da acceso al backend, retira la escritura directa a los roles públicos y agrega `Completado` si falta. No borra ni crea reservas ni modifica los clientes existentes.
3. Reinicia FastAPI y recarga la app. En **Reservas Generales → Crear reserva**, elige cliente, tatuador, espacio, fecha, horario, precio y estado. Para el tatuador, la asignación es su propia cuenta.
4. Comprueba que una reserva nueva aparece también en otra sesión. Verifica que el calendario compartido de un tatuador no exponga el cliente ni el precio de reservas ajenas.

La base de datos valida los cupos simultáneos y el límite de pendientes. Las escrituras quedan serializadas mientras se comprueba el cupo; si otra solicitud ocupa el último espacio, la segunda recibe un conflicto. La fecha y las horas se interpretan en `America/Santiago`. El formulario selecciona clientes existentes; el alta de clientes es un paso aparte.
