import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError
import main

ACTOR = '11111111-1111-1111-1111-111111111111'
RESERVA = '22222222-2222-2222-2222-222222222222'
PAYLOAD = dict(id=RESERVA, clienteId='33333333-3333-3333-3333-333333333333',
               tatuadorId=ACTOR, espacioId=19, precio=45000, fecha='2026-11-10',
               horaInicio='10:00', horaFin='12:00', estado='Confirmada')


class ReservationsTests(unittest.TestCase):
    def setUp(self):
        self.api = TestClient(main.app)

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
        self.assertEqual(name, 'okami_mutar_reserva')
        self.assertEqual(params['p_actor'], ACTOR)
        self.assertEqual(params['p_id'], RESERVA)
        self.assertEqual(params['p_espacio'], 19)
        self.assertEqual(params['p_inicio'], '2026-11-10T10:00')
        self.assertEqual(response.json(), {'id': RESERVA})

    @patch('main.reservation_rpc')
    def test_reversed_schedule_never_reaches_database(self, rpc):
        self.sign_in()
        self.assertEqual(self.api.post('/api/reservas', json={**PAYLOAD, 'horaFin':'09:00'}).status_code, 422)
        rpc.assert_not_called()

    @patch('main.client')
    def test_database_capacity_error_becomes_conflict(self, client):
        self.sign_in()
        client.return_value.rpc.return_value.execute.side_effect = APIError({'code':'P0001','message':'El espacio está lleno.'})
        r = self.api.post('/api/reservas', json=PAYLOAD)
        self.assertEqual(r.status_code, 409)
        self.assertIn('lleno', r.json()['detail'])

    @patch('main.client')
    def test_database_rejects_deleting_someone_elses_reservation(self, client):
        self.sign_in()
        client.return_value.rpc.return_value.execute.side_effect = APIError({'code':'42501','message':'Acceso denegado.'})
        self.assertEqual(self.api.delete(f'/api/reservas/{RESERVA}').status_code, 403)
