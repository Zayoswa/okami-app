"""Cálculo del arriendo mensual de cada tatuador según su modalidad (sin acceso a la base de datos).

Reglas (migración 013):
  * mensual (Full, Compartido): monto fijo al mes.
  * turno (Rotativo, Rotativo light): monto por turno; paga como mínimo minimo_mensual, al principio de mes,
    y ese mínimo cubre los primeros turnos. Ej.: 7 turnos × $12.000 = $84.000 ($60.000 al inicio + $24.000).
  * dia (Guest): monto por día con sesiones; desde dias_reducido días en el mes, monto_reducido cada día.
Un turno es una sesión no cancelada del mes. De una reserva borrada (historial) solo cuentan las sesiones
Completadas, porque son trabajo que sí se hizo. Un día es una fecha distinta con al menos un turno.
"""
from datetime import date

INICIO = '2000-01-01'


def month_start(periodo):
    """'2026-11' → '2026-11-01'. Lanza ValueError si no es un mes válido."""
    year, month = (int(part) for part in periodo.split('-'))
    return date(year, month, 1).isoformat()


def shift_month(periodo, offset):
    """'2026-11', -2 → '2026-09'."""
    year, month = (int(part) for part in periodo.split('-'))
    total = year * 12 + month - 1 + offset
    return f'{total // 12:04d}-{total % 12 + 1:02d}'


def vigente(rows, key, periodo_inicio):
    """La fila con la fecha `key` más reciente que no pase del inicio del mes, o None."""
    candidates = [row for row in rows if str(row[key])[:10] <= periodo_inicio]
    return max(candidates, key=lambda row: str(row[key])[:10]) if candidates else None


def cuenta_turno(sesion, reserva):
    if sesion.get('estado') == 'Cancelada':
        return False
    return sesion.get('estado') == 'Completada' or not reserva.get('archivadaEn')


def uso_del_mes(reservas, periodo):
    """{tatuadorId: {'turnos': n, 'dias': {fechas}}} con las sesiones del mes 'YYYY-MM'."""
    uso = {}
    for reserva in reservas:
        for sesion in reserva.get('sesiones') or []:
            if not str(sesion.get('fecha', '')).startswith(periodo + '-') or not cuenta_turno(sesion, reserva):
                continue
            item = uso.setdefault(str(reserva['tatuadorId']), {'turnos': 0, 'dias': set()})
            item['turnos'] += 1
            item['dias'].add(sesion['fecha'])
    return uso


def cargo(tarifa, turnos, dias):
    """(cargo del mes, precio por unidad, mínimo a principio de mes)."""
    if tarifa is None:
        return 0, 0, 0
    if tarifa['cobro'] == 'mensual':
        return tarifa['monto'], tarifa['monto'], 0
    if tarifa['cobro'] == 'turno':
        minimo = tarifa.get('minimo_mensual') or 0
        return max(minimo, turnos * tarifa['monto']), tarifa['monto'], minimo
    precio = tarifa['monto']
    if tarifa.get('dias_reducido') and tarifa.get('monto_reducido') is not None and dias >= tarifa['dias_reducido']:
        precio = tarifa['monto_reducido']
    return dias * precio, precio, 0


def estado(cargo_mes, pagado, minimo):
    if cargo_mes == 0 and pagado == 0:
        return 'sin_cargo'
    if pagado >= cargo_mes:
        return 'pagado'
    if minimo and pagado < minimo:
        return 'falta_minimo'
    return 'parcial' if pagado > 0 else 'pendiente'


def resumen_mes(periodo, tatuadores, modalidades, tarifas, historial, reservas, pagos):
    """Arriendo del mes 'YYYY-MM' para cada tatuador.

    tatuadores:  [{id, nombre, activo, creado_en}]
    modalidades: {id: nombre}
    tarifas:     [{modalidad, vigente_desde, cobro, monto, minimo_mensual, monto_reducido, dias_reducido}]
    historial:   [{tatuador, desde, modalidad}]
    reservas:    las de okami_listar_reservas (fechas ya en hora de Santiago)
    pagos:       [{id, tatuador, monto, pagado_en, nota}] del mismo mes
    """
    inicio = month_start(periodo)
    uso = uso_del_mes(reservas, periodo)
    filas = []
    for tatuador in tatuadores:
        tid = str(tatuador['id'])
        propios = [row for row in historial if str(row['tatuador']) == tid]
        registro = vigente(propios, 'desde', inicio)
        modalidad_id = registro['modalidad'] if registro else None
        tarifa = vigente([row for row in tarifas if row['modalidad'] == modalidad_id], 'vigente_desde', inicio) if modalidad_id else None
        turnos = uso.get(tid, {}).get('turnos', 0)
        dias = len(uso.get(tid, {}).get('dias', ()))
        sus_pagos = sorted((p for p in pagos if str(p['tatuador']) == tid), key=lambda p: (str(p['pagado_en']), str(p['id'])))
        pagado = sum(p['monto'] for p in sus_pagos)
        # Quien no estaba en el estudio ese mes, o está desactivado y no trabajó ni pagó, no aparece.
        alta = str(tatuador.get('creado_en') or INICIO)[:7] <= periodo
        if not (turnos or sus_pagos or (tatuador.get('activo') and alta)):
            continue
        total, precio, minimo = cargo(tarifa, turnos, dias)
        filas.append({
            'tatuadorId': tid,
            'tatuador': tatuador['nombre'],
            'activo': bool(tatuador.get('activo')),
            'modalidadId': modalidad_id,
            'modalidad': modalidades.get(modalidad_id) if modalidad_id else None,
            'cobro': tarifa['cobro'] if tarifa else None,
            'turnos': turnos,
            'dias': dias,
            'precioUnitario': precio,
            'minimo': minimo,
            'cargo': total,
            'pagado': pagado,
            'saldo': total - pagado,
            'estado': estado(total, pagado, minimo) if tarifa or pagado else 'sin_modalidad',
            'pagos': [{'id': str(p['id']), 'monto': p['monto'], 'pagadoEn': str(p['pagado_en'])[:10], 'nota': p.get('nota') or ''}
                      for p in sus_pagos],
        })
    filas.sort(key=lambda fila: fila['tatuador'].casefold())
    return {
        'periodo': periodo,
        'filas': filas,
        'totales': {
            'cargo': sum(f['cargo'] for f in filas),
            'pagado': sum(f['pagado'] for f in filas),
            'pendiente': sum(max(0, f['saldo']) for f in filas),
        },
    }


def historial_meses(hasta, meses, tatuadores, modalidades, tarifas, historial, reservas, pagos):
    """Totales de los `meses` meses que terminan en `hasta` ('YYYY-MM'), del más antiguo al más reciente.
    pagos: todos los del rango, cada uno con su 'periodo' ('YYYY-MM-01')."""
    result = []
    for offset in range(meses - 1, -1, -1):
        periodo = shift_month(hasta, -offset)
        inicio = month_start(periodo)
        del_mes = [p for p in pagos if str(p['periodo'])[:10] == inicio]
        resumen = resumen_mes(periodo, tatuadores, modalidades, tarifas, historial, reservas, del_mes)
        result.append({'periodo': periodo, **resumen['totales'], 'tatuadores': len(resumen['filas'])})
    return result
