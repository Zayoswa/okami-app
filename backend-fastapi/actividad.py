"""Registro de actividad (migración 014): resúmenes legibles de cada cambio y su guardado.

Las funciones describe_* son puras (sin base de datos) para poder probarlas. registrar() nunca lanza
errores: si no se puede guardar el registro, el cambio del usuario ya está hecho y no se deshace.
"""
import logging

log = logging.getLogger('okami.actividad')

MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
         'septiembre', 'octubre', 'noviembre', 'diciembre']


def price(value):
    """120000 → '$120.000'."""
    return '$' + f'{int(value or 0):,}'.replace(',', '.')


def month_name(periodo):
    """'2026-11' → 'noviembre de 2026'."""
    year, month = periodo[:7].split('-')
    return f'{MESES[int(month) - 1]} de {year}'


def short_date(fecha):
    """'2026-11-10' → '10-11-2026'."""
    year, month, day = fecha[:10].split('-')
    return f'{day}-{month}-{year}'


def session_text(sesion):
    """'10-11-2026 10:00–12:00 en Puesto 4'."""
    return f"{short_date(sesion['fecha'])} {sesion['horaInicio']}–{sesion['horaFin']} en {sesion.get('puesto') or 'un puesto'}"


def plural(n, one, many):
    return f'{n} {one if n == 1 else many}'


def registrar(db, user, categoria, accion, resumen, entidad_id=None, detalle=None):
    """Guarda un registro. No lanza errores (solo deja constancia en el log del servidor)."""
    try:
        db.table('registro_actividad').insert({
            'actor': user.get('id'),
            'actor_nombre': user.get('name') or 'Usuario',
            'actor_rol': user.get('role') or '',
            'categoria': categoria,
            'accion': accion,
            'entidad_id': str(entidad_id) if entidad_id is not None else None,
            'resumen': resumen[:500],
            'detalle': detalle or {},
        }).execute()
    except Exception:  # noqa: BLE001 - el registro nunca debe romper la operación
        log.exception('No se pudo guardar el registro de actividad (%s/%s).', categoria, accion)


# ---------- Reservas ----------

def reservation_label(reserva):
    cliente = reserva.get('cliente') or 'un cliente'
    return f"la reserva de {cliente} con {reserva.get('tatuador') or 'un tatuador'}"


def describe_created(reserva):
    sesiones = reserva.get('sesiones') or []
    resumen = (f"Creó {reservation_label(reserva)}: {plural(len(sesiones), 'sesión', 'sesiones')}, "
               f"{price(reserva.get('precio'))}.")
    return resumen, {'sesiones': [session_text(s) for s in sesiones], 'precio': reserva.get('precio')}


def reservation_changes(antes, despues):
    """Lista de cambios legibles entre dos versiones de una reserva (formato de okami_listar_reservas)."""
    cambios = []
    if antes.get('cliente') != despues.get('cliente'):
        cambios.append(f"Cliente: {antes.get('cliente')} → {despues.get('cliente')}")
    if (antes.get('clienteRut') or '') != (despues.get('clienteRut') or ''):
        cambios.append('RUT del cliente corregido')
    if antes.get('tatuadorId') != despues.get('tatuadorId'):
        cambios.append(f"Tatuador: {antes.get('tatuador')} → {despues.get('tatuador')}")
    if antes.get('precio') != despues.get('precio'):
        cambios.append(f"Precio: {price(antes.get('precio'))} → {price(despues.get('precio'))}")
    if (antes.get('zonaCuerpo') or '') != (despues.get('zonaCuerpo') or ''):
        cambios.append(f"Zona del cuerpo: {antes.get('zonaCuerpo') or 'sin indicar'} → {despues.get('zonaCuerpo') or 'sin indicar'}")
    if (antes.get('descripcionDiseno') or '') != (despues.get('descripcionDiseno') or ''):
        cambios.append('Descripción del diseño actualizada')
    previas = {s['id']: s for s in antes.get('sesiones') or []}
    nuevas = {s['id']: s for s in despues.get('sesiones') or []}
    for sid, sesion in nuevas.items():
        previa = previas.get(sid)
        if previa is None:
            cambios.append(f'Agregó la sesión del {session_text(sesion)}')
            continue
        if (previa['fecha'], previa['horaInicio'], previa['horaFin'], previa.get('puestoId')) != \
                (sesion['fecha'], sesion['horaInicio'], sesion['horaFin'], sesion.get('puestoId')):
            cambios.append(f'Movió una sesión: {session_text(previa)} → {session_text(sesion)}')
        if previa.get('estado') != sesion.get('estado'):
            cambios.append(f"Sesión del {short_date(sesion['fecha'])}: {previa.get('estado')} → {sesion.get('estado')}")
    for sid, previa in previas.items():
        if sid not in nuevas:
            cambios.append(f'Quitó la sesión del {session_text(previa)}')
    return cambios


def describe_edited(antes, despues):
    cambios = reservation_changes(antes, despues)
    if not cambios:
        return f'Guardó {reservation_label(despues)} sin cambios.', {'cambios': []}
    primero = cambios[0][0].lower() + cambios[0][1:]
    extra = f' y {plural(len(cambios) - 1, "cambio más", "cambios más")}' if len(cambios) > 1 else ''
    return f'Editó {reservation_label(despues)}: {primero}{extra}.', {'cambios': cambios}


def describe_deleted(reserva):
    sesiones = reserva.get('sesiones') or []
    completadas = sum(1 for s in sesiones if s.get('estado') == 'Completada')
    resumen = f"Borró {reservation_label(reserva)} ({plural(len(sesiones), 'sesión', 'sesiones')}). Quedó en el historial."
    return resumen, {'sesiones': [f"{session_text(s)} · {s.get('estado')}" for s in sesiones],
                     'completadas': completadas, 'precio': reserva.get('precio')}


def describe_restored(reserva):
    return f'Restauró {reservation_label(reserva)} desde el historial.', {}


def describe_status(reserva, sesion, antes, despues):
    resumen = (f"Marcó como {despues} la sesión del {session_text(sesion)} de {reservation_label(reserva)}"
               f" (antes {antes}).")
    return resumen, {'antes': antes, 'despues': despues}
