import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError
import main

ACTOR = '11111111-1111-1111-1111-111111111111'
RESERVA = '22222222-2222-2222-2222-222222222222'
SESION = dict(id='44444444-4444-4444-4444-444444444444', puestoId=7, fecha='2026-11-10',
              horaInicio='10:00', horaFin='12:00', estado='Programada')
PAYLOAD = dict(id=RESERVA, clienteNombre='Camila Rojas', clienteRut='12.345.678-5',
               tatuadorId=ACTOR, precio=45000, sesiones=[SESION])


def session(**overrides):
    return {**SESION, **overrides}


class ReservationsTests(unittest.TestCase):
    def setUp(self):
        self.api = TestClient(main.app)
        # El registro de actividad se prueba aparte (tests/test_actividad.py).
        for name in ('reservation_snapshot', 'log_event'):
            patcher = patch(f'main.{name}', return_value=None)
            patcher.start()
            self.addCleanup(patcher.stop)
        # Sin puestos Guest: la regla del puesto Guest se prueba aparte (GuestPuestoTests).
        patcher = patch('main.guest_rule_data', return_value=({}, None))
        patcher.start()
        self.addCleanup(patcher.stop)

    def tearDown(self):
        main.app.dependency_overrides.clear()

    def sign_in(self):
        main.app.dependency_overrides[main.get_current_user] = lambda: {'id': ACTOR, 'role': 'tatuador'}

    def test_anonymous_cannot_access_reservations(self):
        self.assertEqual(self.api.get('/api/reservas').status_code, 401)
        self.assertEqual(self.api.post('/api/reservas', json=PAYLOAD).status_code, 401)

    @patch('main.reservation_rpc')
    def test_create_uses_authenticated_actor_and_real_entity_ids(self, rpc):
        self.sign_in()
        rpc.return_value = RESERVA
        response = self.api.post('/api/reservas', json={**PAYLOAD, 'p_actor': RESERVA})
        self.assertEqual(response.status_code, 201)
        name, params = rpc.call_args.args
        self.assertEqual(name, 'okami_guardar_reserva')
        self.assertEqual(params['p_actor'], ACTOR)
        self.assertEqual(params['p_id'], RESERVA)
        self.assertNotIn('p_cliente', params)
        self.assertEqual(params['p_cliente_nombre'], 'Camila Rojas')
        self.assertEqual(params['p_sesiones'], [{'id': SESION['id'], 'puesto': 7, 'estado': 'Programada',
                                                 'inicio': '2026-11-10T10:00', 'fin': '2026-11-10T12:00'}])
        self.assertEqual(response.json(), {'id': RESERVA})

    @patch('main.reservation_rpc')
    def test_customer_data_is_saved_in_the_reservation(self, rpc):
        self.sign_in()
        rpc.return_value = RESERVA
        response = self.api.post('/api/reservas', json=PAYLOAD)
        self.assertEqual(response.status_code, 201)
        _, params = rpc.call_args.args
        self.assertEqual(params['p_cliente_nombre'], 'Camila Rojas')
        self.assertEqual(params['p_cliente_rut'], '123456785')

    @patch('main.reservation_rpc')
    def test_editing_also_requires_customer_name_and_rut(self, rpc):
        self.sign_in()
        body = {key: value for key, value in PAYLOAD.items() if key not in ('id', 'clienteRut')}
        self.assertEqual(self.api.patch(f'/api/reservas/{RESERVA}', json=body).status_code, 422)
        rpc.assert_not_called()

    @patch('main.reservation_rpc')
    def test_new_customer_rut_accepts_lowercase_k(self, rpc):
        self.sign_in()
        rpc.return_value = RESERVA
        payload = {**PAYLOAD, 'clienteRut': '10.000.013-k'}
        response = self.api.post('/api/reservas', json=payload)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(rpc.call_args.args[1]['p_cliente_rut'], '10000013K')

    @patch('main.reservation_rpc')
    def test_new_customer_rejects_an_invalid_rut_verifier(self, rpc):
        self.sign_in()
        payload = {**PAYLOAD, 'clienteRut': '12345678-K'}
        response = self.api.post('/api/reservas', json=payload)
        self.assertEqual(response.status_code, 422)
        self.assertIn('dígito verificador', response.json()['detail'])
        rpc.assert_not_called()

    @patch('main.reservation_rpc')
    def test_new_customer_requires_a_complete_rut(self, rpc):
        self.sign_in()
        response = self.api.post('/api/reservas', json={**PAYLOAD, 'clienteRut': ''})
        self.assertEqual(response.status_code, 422)
        self.assertIn('RUT', response.json()['detail'])
        rpc.assert_not_called()

    @patch('main.reservation_rpc')
    def test_new_customer_name_is_text_only(self, rpc):
        self.sign_in()
        rpc.return_value = RESERVA
        for nombre in ('11585495k', 'Ana 2', '12.345.678-5', 'A', '@@@'):
            with self.subTest(nombre=nombre):
                payload = {**PAYLOAD, 'clienteNombre': nombre}
                response = self.api.post('/api/reservas', json=payload)
                self.assertEqual(response.status_code, 422)
                self.assertIn('nombre', response.json()['detail'])
        rpc.assert_not_called()
        for nombre, guardado in (("  María José   O'Higgins-Pérez ", "María José O'Higgins-Pérez"), ('Ñuñoa Sr.', 'Ñuñoa Sr.')):
            with self.subTest(nombre=nombre):
                payload = {**PAYLOAD, 'clienteNombre': nombre}
                self.assertEqual(self.api.post('/api/reservas', json=payload).status_code, 201)
                self.assertEqual(rpc.call_args.args[1]['p_cliente_nombre'], guardado)

    def test_there_is_no_customer_search(self):
        self.sign_in()
        self.assertEqual(self.api.get('/api/clientes?busqueda=ana').status_code, 404)

    @patch('main.reservation_rpc')
    def test_delete_archives_and_restore_brings_back(self, rpc):
        self.sign_in()
        rpc.return_value = RESERVA
        self.assertEqual(self.api.delete(f'/api/reservas/{RESERVA}').status_code, 200)
        self.assertEqual(rpc.call_args.args[1]['p_operacion'], 'borrar')
        self.assertEqual(self.api.post(f'/api/reservas/{RESERVA}/restaurar').status_code, 200)
        self.assertEqual(rpc.call_args.args, ('okami_guardar_reserva', {'p_actor': ACTOR, 'p_operacion': 'restaurar', 'p_id': RESERVA}))

    @patch('main.reservation_rpc')
    def test_session_status_changes_only_that_session(self, rpc):
        self.assertEqual(self.api.patch(f"/api/reservas/{RESERVA}/sesiones/{SESION['id']}", json={'estado': 'Completada'}).status_code, 401)
        self.sign_in()
        response = self.api.patch(f"/api/reservas/{RESERVA}/sesiones/{SESION['id']}", json={'estado': 'Completada'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(rpc.call_args.args, ('okami_estado_sesion', {'p_actor': ACTOR, 'p_reserva': RESERVA,
                                                                      'p_sesion': SESION['id'], 'p_estado': 'Completada'}))
        self.assertEqual(self.api.patch(f"/api/reservas/{RESERVA}/sesiones/{SESION['id']}", json={'estado': 'Confirmada'}).status_code, 422)

    @patch('main.reservation_rpc')
    def test_reversed_schedule_never_reaches_database(self, rpc):
        self.sign_in()
        self.assertEqual(self.api.post('/api/reservas', json={**PAYLOAD, 'sesiones': [session(horaFin='09:00')]}).status_code, 422)
        rpc.assert_not_called()

    @patch('main.reservation_rpc')
    def test_confirmada_is_no_longer_a_valid_state(self, rpc):
        self.sign_in()
        response = self.api.post('/api/reservas', json={**PAYLOAD, 'sesiones': [session(estado='Confirmada')]})
        self.assertEqual(response.status_code, 422)
        rpc.assert_not_called()

    @patch('main.reservation_rpc')
    def test_reservation_needs_at_least_one_session(self, rpc):
        self.sign_in()
        self.assertEqual(self.api.post('/api/reservas', json={**PAYLOAD, 'sesiones': []}).status_code, 422)
        rpc.assert_not_called()

    @patch('main.reservation_rpc')
    def test_several_sessions_are_sent_in_one_operation(self, rpc):
        self.sign_in()
        rpc.return_value = RESERVA
        second = session(id='55555555-5555-5555-5555-555555555555', puestoId=3, fecha='2026-11-24', estado='Programada')
        response = self.api.post('/api/reservas', json={**PAYLOAD, 'sesiones': [SESION, second]})
        self.assertEqual(response.status_code, 201)
        sent = rpc.call_args.args[1]['p_sesiones']
        self.assertEqual([item['puesto'] for item in sent], [7, 3])
        self.assertEqual(sent[1]['inicio'], '2026-11-24T10:00')

    @patch('main.reservation_rpc')
    def test_sessions_of_one_reservation_cannot_overlap(self, rpc):
        self.sign_in()
        second = session(id='55555555-5555-5555-5555-555555555555', horaInicio='11:00', horaFin='13:00')
        response = self.api.post('/api/reservas', json={**PAYLOAD, 'sesiones': [SESION, second]})
        self.assertEqual(response.status_code, 422)
        self.assertIn('cruzarse', response.json()['detail'])
        rpc.assert_not_called()
        cancelled = {**second, 'estado': 'Cancelada'}
        rpc.return_value = RESERVA
        self.assertEqual(self.api.post('/api/reservas', json={**PAYLOAD, 'sesiones': [SESION, cancelled]}).status_code, 201)

    @patch('main.reservation_rpc')
    def test_session_ids_must_be_unique(self, rpc):
        self.sign_in()
        response = self.api.post('/api/reservas', json={**PAYLOAD, 'sesiones': [SESION, session(fecha='2026-11-24')]})
        self.assertEqual(response.status_code, 422)
        rpc.assert_not_called()

    @patch('main.client')
    def test_database_capacity_error_becomes_conflict(self, client):
        self.sign_in()
        client.return_value.rpc.return_value.execute.side_effect = APIError({'code':'P0001','message':'Puesto 7 ya está ocupado.'})
        r = self.api.post('/api/reservas', json=PAYLOAD)
        self.assertEqual(r.status_code, 409)
        self.assertIn('ocupado', r.json()['detail'])

    @patch('main.client')
    def test_database_rejects_deleting_someone_elses_reservation(self, client):
        self.sign_in()
        client.return_value.rpc.return_value.execute.side_effect = APIError({'code':'42501','message':'Acceso denegado.'})
        self.assertEqual(self.api.delete(f'/api/reservas/{RESERVA}').status_code, 403)


class GuestPuestoTests(unittest.TestCase):
    """Un puesto Guest solo acepta sesiones de tatuadores con modalidad Guest."""
    PUESTOS = {7: ('Puesto 7', 'Guest'), 8: ('Puesto 8', 'Rotativo')}

    def data(self, *sesiones, tatuador=ACTOR):
        return main.ReservationRequest(**{**PAYLOAD, 'tatuadorId': tatuador, 'sesiones': list(sesiones or [SESION])})

    def test_guest_artist_can_book_a_guest_puesto(self):
        self.assertEqual(main.guest_puesto_error(self.data(), None, self.PUESTOS, 'Guest'), '')

    def test_other_modalities_cannot_book_a_guest_puesto(self):
        for modalidad in ('Rotativo', 'Rotativo light', 'Full', None):
            error = main.guest_puesto_error(self.data(), None, self.PUESTOS, modalidad)
            self.assertIn('Puesto 7 es un puesto Guest', error)

    def test_rotativo_puesto_stays_open_to_everyone(self):
        self.assertEqual(main.guest_puesto_error(self.data(session(puestoId=8)), None, self.PUESTOS, 'Full'), '')

    def test_cancelled_session_is_not_checked(self):
        self.assertEqual(main.guest_puesto_error(self.data(session(estado='Cancelada')), None, self.PUESTOS, 'Full'), '')

    def test_unchanged_session_can_still_be_edited(self):
        # La sesión ya estaba agendada en el puesto Guest (por ejemplo, el tatuador cambió de modalidad después).
        antes = {'tatuadorId': ACTOR, 'sesiones': [{**SESION, 'puestoId': '7'}]}
        self.assertEqual(main.guest_puesto_error(self.data(session(estado='Completada')), antes, self.PUESTOS, 'Rotativo'), '')

    def test_moving_or_reassigning_is_checked(self):
        antes = {'tatuadorId': ACTOR, 'sesiones': [{**SESION, 'puestoId': '8'}]}
        self.assertTrue(main.guest_puesto_error(self.data(), antes, self.PUESTOS, 'Rotativo'))
        otro = '33333333-3333-3333-3333-333333333333'
        antes = {'tatuadorId': otro, 'sesiones': [{**SESION, 'puestoId': '7'}]}
        self.assertTrue(main.guest_puesto_error(self.data(), antes, self.PUESTOS, 'Rotativo'))

    @patch('main.reservation_rpc')
    @patch('main.guest_rule_data', return_value=(PUESTOS, 'Full'))
    def test_api_rejects_before_reaching_the_database(self, _rule, rpc):
        api = TestClient(main.app)
        main.app.dependency_overrides[main.get_current_user] = lambda: {'id': ACTOR, 'role': 'tatuador'}
        self.addCleanup(main.app.dependency_overrides.clear)
        response = api.post('/api/reservas', json=PAYLOAD)
        self.assertEqual(response.status_code, 422)
        self.assertIn('puesto Guest', response.json()['detail'])
        rpc.assert_not_called()
