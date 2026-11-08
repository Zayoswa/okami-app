import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
import arriendos
import main

FULL, COMPARTIDO, ROTATIVO, LIGHT, GUEST = 1, 3, 2, 5, 4
MODALIDADES = {FULL: 'Full', ROTATIVO: 'Rotativo', COMPARTIDO: 'Compartido', GUEST: 'Guest', LIGHT: 'Rotativo light'}
TARIFAS = [
    dict(modalidad=FULL, vigente_desde='2000-01-01', cobro='mensual', monto=220000, minimo_mensual=0, monto_reducido=None, dias_reducido=None),
    dict(modalidad=COMPARTIDO, vigente_desde='2000-01-01', cobro='mensual', monto=120000, minimo_mensual=0, monto_reducido=None, dias_reducido=None),
    dict(modalidad=ROTATIVO, vigente_desde='2000-01-01', cobro='turno', monto=12000, minimo_mensual=60000, monto_reducido=None, dias_reducido=None),
    dict(modalidad=LIGHT, vigente_desde='2000-01-01', cobro='turno', monto=12000, minimo_mensual=36000, monto_reducido=None, dias_reducido=None),
    dict(modalidad=GUEST, vigente_desde='2000-01-01', cobro='dia', monto=15000, minimo_mensual=0, monto_reducido=12000, dias_reducido=5),
]


def artist(tid, nombre, activo=True, creado='2026-01-10T00:00:00Z'):
    return {'id': tid, 'nombre': nombre, 'activo': activo, 'creado_en': creado}


def reservation(tid, fechas, estado='Programada', archivada=None):
    return {'tatuadorId': tid, 'archivadaEn': archivada,
            'sesiones': [{'fecha': fecha, 'estado': estado} for fecha in fechas]}


def summary(tatuadores, historial, reservas=(), pagos=(), periodo='2026-11', tarifas=TARIFAS):
    result = arriendos.resumen_mes(periodo, tatuadores, MODALIDADES, list(tarifas), historial, list(reservas), list(pagos))
    return {fila['tatuador']: fila for fila in result['filas']}, result['totales']


def since(tid, modalidad, desde='2000-01-01'):
    return {'tatuador': tid, 'desde': desde, 'modalidad': modalidad}


class RentCalculationTests(unittest.TestCase):
    def test_monthly_modalities_pay_a_fixed_amount(self):
        filas, totales = summary([artist('a', 'Ana'), artist('b', 'Bea')], [since('a', FULL), since('b', COMPARTIDO)])
        self.assertEqual((filas['Ana']['cargo'], filas['Bea']['cargo']), (220000, 120000))
        self.assertEqual(totales, {'cargo': 340000, 'pagado': 0, 'pendiente': 340000})

    def test_rotativo_pays_per_turn_with_a_minimum_that_covers_the_first_turns(self):
        siete = [f'2026-11-{day:02d}' for day in range(1, 8)]
        filas, _ = summary([artist('r', 'Rita'), artist('l', 'Lia'), artist('z', 'Zoe')],
                           [since('r', ROTATIVO), since('l', LIGHT), since('z', ROTATIVO)],
                           [reservation('r', siete), reservation('l', ['2026-11-03', '2026-11-04'])])
        self.assertEqual((filas['Rita']['turnos'], filas['Rita']['cargo'], filas['Rita']['minimo']), (7, 84000, 60000))
        self.assertEqual(filas['Lia']['cargo'], 36000, '2 turnos no llegan al mínimo de $36.000')
        self.assertEqual(filas['Zoe']['cargo'], 60000, 'sin turnos igual paga el mínimo')

    def test_guest_pays_per_day_and_from_five_days_the_lower_price(self):
        cuatro = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-04']
        filas, _ = summary([artist('g', 'Gus'), artist('h', 'Hugo')], [since('g', GUEST), since('h', GUEST)],
                           [reservation('g', cuatro), reservation('h', [f'2026-11-{d:02d}' for d in range(10, 15)])])
        self.assertEqual((filas['Gus']['turnos'], filas['Gus']['dias'], filas['Gus']['cargo']), (4, 3, 45000))
        self.assertEqual((filas['Hugo']['dias'], filas['Hugo']['precioUnitario'], filas['Hugo']['cargo']), (5, 12000, 60000))

    def test_cancelled_and_deleted_sessions_are_not_turns(self):
        filas, _ = summary([artist('r', 'Rita')], [since('r', ROTATIVO)], [
            reservation('r', ['2026-11-01'] * 6),
            reservation('r', ['2026-11-02'] * 3, estado='Cancelada'),
            reservation('r', ['2026-11-03'], archivada='2026-11-05T00:00:00Z'),
            reservation('r', ['2026-11-04'], estado='Completada', archivada='2026-11-05T00:00:00Z'),
            reservation('r', ['2026-10-30', '2026-12-01']),
        ])
        self.assertEqual((filas['Rita']['turnos'], filas['Rita']['cargo']), (7, 84000))

    def test_payments_give_the_balance_and_status(self):
        historial = [since('r', ROTATIVO), since('a', FULL), since('b', FULL), since('c', FULL)]
        pagos = [{'id': 1, 'tatuador': 'r', 'monto': 40000, 'pagado_en': '2026-11-02', 'nota': None},
                 {'id': 2, 'tatuador': 'a', 'monto': 220000, 'pagado_en': '2026-11-01', 'nota': 'Transferencia'},
                 {'id': 3, 'tatuador': 'b', 'monto': 100000, 'pagado_en': '2026-11-01', 'nota': None}]
        filas, totales = summary([artist('r', 'Rita'), artist('a', 'Ana'), artist('b', 'Bea'), artist('c', 'Caro')], historial, pagos=pagos)
        self.assertEqual([filas[n]['estado'] for n in ('Rita', 'Ana', 'Bea', 'Caro')], ['falta_minimo', 'pagado', 'parcial', 'pendiente'])
        self.assertEqual((filas['Bea']['saldo'], filas['Ana']['pagos'][0]['nota']), (120000, 'Transferencia'))
        self.assertEqual(totales, {'cargo': 720000, 'pagado': 360000, 'pendiente': 360000})

    def test_modality_and_tariff_are_the_ones_in_force_that_month(self):
        historial = [since('a', ROTATIVO), since('a', FULL, '2026-11-01')]
        tarifas = TARIFAS + [dict(TARIFAS[0], vigente_desde='2026-12-01', monto=250000)]
        self.assertEqual(summary([artist('a', 'Ana')], historial, periodo='2026-10', tarifas=tarifas)[0]['Ana']['modalidad'], 'Rotativo')
        self.assertEqual(summary([artist('a', 'Ana')], historial, periodo='2026-11', tarifas=tarifas)[0]['Ana']['cargo'], 220000)
        self.assertEqual(summary([artist('a', 'Ana')], historial, periodo='2026-12', tarifas=tarifas)[0]['Ana']['cargo'], 250000)

    def test_who_appears_in_the_month(self):
        tatuadores = [artist('n', 'Nuevo', creado='2026-12-03T00:00:00Z'), artist('i', 'Inactivo', activo=False),
                      artist('w', 'Trabajó', activo=False), artist('s', 'Sin modalidad')]
        historial = [since('n', FULL), since('i', FULL), since('w', ROTATIVO)]
        filas, _ = summary(tatuadores, historial, [reservation('w', ['2026-11-09'])])
        self.assertEqual(sorted(filas), ['Sin modalidad', 'Trabajó'])
        self.assertEqual((filas['Sin modalidad']['estado'], filas['Sin modalidad']['cargo']), ('sin_modalidad', 0))

    def test_month_start_validates_the_month(self):
        self.assertEqual(arriendos.month_start('2026-02'), '2026-02-01')
        with self.assertRaises(ValueError):
            arriendos.month_start('2026-13')


class RentEndpointTests(unittest.TestCase):
    def setUp(self):
        self.api = TestClient(main.app)

    def tearDown(self):
        main.app.dependency_overrides.clear()

    def test_only_admins_see_and_register_rent(self):
        self.assertEqual(self.api.get('/api/arriendos?mes=2026-11').status_code, 401)
        main.app.dependency_overrides[main.get_current_user] = lambda: {'id': 'x', 'role': 'tatuador'}
        self.assertEqual(self.api.get('/api/arriendos?mes=2026-11').status_code, 403)
        payment = {'tatuadorId': '11111111-1111-1111-1111-111111111111', 'periodo': '2026-11', 'monto': 1000, 'pagadoEn': '2026-11-02'}
        self.assertEqual(self.api.post('/api/arriendos/pagos', json=payment).status_code, 403)
        self.assertEqual(self.api.patch('/api/usuarios/11111111-1111-1111-1111-111111111111/modalidad', json={'modalidad': 1}).status_code, 403)

    @patch('main.client')
    def test_invalid_month_or_amount_never_reaches_database(self, client):
        main.app.dependency_overrides[main.get_current_user] = lambda: {'id': 'x', 'role': 'admin'}
        self.assertEqual(self.api.get('/api/arriendos?mes=2026-13').status_code, 422)
        payment = {'tatuadorId': '11111111-1111-1111-1111-111111111111', 'periodo': '2026-11', 'monto': 0, 'pagadoEn': '2026-11-02'}
        self.assertEqual(self.api.post('/api/arriendos/pagos', json=payment).status_code, 422)
        client.assert_not_called()


if __name__ == '__main__':
    unittest.main()


class RentHistoryTests(unittest.TestCase):
    def test_shift_month_crosses_years(self):
        self.assertEqual(arriendos.shift_month('2026-01', -1), '2025-12')
        self.assertEqual(arriendos.shift_month('2026-11', 2), '2027-01')

    def test_history_gives_each_month_totals_with_its_own_payments(self):
        historial = [since('a', FULL), since('r', ROTATIVO)]
        pagos = [{'id': 1, 'tatuador': 'a', 'periodo': '2026-10-01', 'monto': 220000, 'pagado_en': '2026-10-02', 'nota': None},
                 {'id': 2, 'tatuador': 'r', 'periodo': '2026-11-01', 'monto': 30000, 'pagado_en': '2026-11-02', 'nota': None}]
        meses = arriendos.historial_meses('2026-11', 2, [artist('a', 'Ana'), artist('r', 'Rita')], MODALIDADES, TARIFAS, historial,
                                          [reservation('r', [f'2026-11-{d:02d}' for d in range(1, 8)])], pagos)
        self.assertEqual([m['periodo'] for m in meses], ['2026-10', '2026-11'])
        self.assertEqual((meses[0]['cargo'], meses[0]['pagado']), (280000, 220000))
        self.assertEqual((meses[1]['cargo'], meses[1]['pagado'], meses[1]['pendiente']), (304000, 30000, 274000))


class MyRentEndpointTests(unittest.TestCase):
    def setUp(self):
        self.api = TestClient(main.app)

    def tearDown(self):
        main.app.dependency_overrides.clear()

    def test_admin_has_no_own_rent_and_history_is_admin_only(self):
        main.app.dependency_overrides[main.get_current_user] = lambda: {'id': 'x', 'role': 'admin'}
        self.assertEqual(self.api.get('/api/arriendos/mio?mes=2026-11').status_code, 403)
        main.app.dependency_overrides[main.get_current_user] = lambda: {'id': 'x', 'role': 'tatuador'}
        self.assertEqual(self.api.get('/api/arriendos/historial?hasta=2026-11').status_code, 403)

    @patch('main.reservation_rpc')
    @patch('main.rent_data')
    def test_artist_sees_only_own_rent_without_notes(self, rent_data, rpc):
        main.app.dependency_overrides[main.get_current_user] = lambda: {'id': 'r', 'role': 'tatuador'}
        pagos = [{'id': 9, 'tatuador': 'r', 'periodo': '2026-11-01', 'monto': 60000, 'pagado_en': '2026-11-02', 'nota': 'interna'}]
        rent_data.return_value = ([artist('r', 'Rita')], MODALIDADES, TARIFAS, [since('r', ROTATIVO)], pagos)
        rpc.return_value = [reservation('r', ['2026-11-03'] * 7)]
        response = self.api.get('/api/arriendos/mio?mes=2026-11')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(rent_data.call_args.kwargs['tatuador'], 'r')
        fila = response.json()['arriendo']
        self.assertEqual((fila['cargo'], fila['pagado'], fila['saldo']), (84000, 60000, 24000))
        self.assertEqual(fila['pagos'], [{'monto': 60000, 'pagadoEn': '2026-11-02'}])
