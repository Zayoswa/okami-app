import unittest
from unittest.mock import Mock, patch
from fastapi.testclient import TestClient
import actividad
import main


def sesion(sid, fecha='2026-11-10', inicio='10:00', fin='12:00', puesto='Puesto 4', estado='Programada'):
    return {'id': sid, 'fecha': fecha, 'horaInicio': inicio, 'horaFin': fin, 'puesto': puesto, 'puestoId': puesto[-1], 'estado': estado}


def reserva(**overrides):
    base = {'id': 'r', 'cliente': 'Camila Rojas', 'clienteRut': '123456785', 'tatuador': 'Jaimito', 'tatuadorId': 't1',
            'precio': 120000, 'sesiones': [sesion('a')]}
    return {**base, **overrides}


class DescribeTests(unittest.TestCase):
    def test_created(self):
        resumen, detalle = actividad.describe_created(reserva())
        self.assertEqual(resumen, 'Creó la reserva de Camila Rojas con Jaimito: 1 sesión, $120.000.')
        self.assertEqual(detalle['sesiones'], ['10-11-2026 10:00–12:00 en Puesto 4'])

    def test_edited_lists_every_change(self):
        antes = reserva(sesiones=[sesion('a'), sesion('b', fecha='2026-11-17')])
        despues = reserva(precio=150000, sesiones=[sesion('a', inicio='11:00', fin='13:00'), sesion('c', fecha='2026-11-24', puesto='Puesto 7')])
        resumen, detalle = actividad.describe_edited(antes, despues)
        self.assertEqual(resumen, 'Editó la reserva de Camila Rojas con Jaimito: precio: $120.000 → $150.000 y 3 cambios más.')
        self.assertEqual(detalle['cambios'], [
            'Precio: $120.000 → $150.000',
            'Movió una sesión: 10-11-2026 10:00–12:00 en Puesto 4 → 10-11-2026 11:00–13:00 en Puesto 4',
            'Agregó la sesión del 24-11-2026 10:00–12:00 en Puesto 7',
            'Quitó la sesión del 17-11-2026 10:00–12:00 en Puesto 4',
        ])

    def test_edited_without_changes_and_status_in_the_form(self):
        self.assertIn('sin cambios', actividad.describe_edited(reserva(), reserva())[0])
        cambios = actividad.reservation_changes(reserva(), reserva(sesiones=[sesion('a', estado='Cancelada')]))
        self.assertEqual(cambios, ['Sesión del 10-11-2026: Programada → Cancelada'])

    def test_deleted_restored_and_status(self):
        self.assertEqual(actividad.describe_deleted(reserva())[0],
                         'Borró la reserva de Camila Rojas con Jaimito (1 sesión). Quedó en el historial.')
        self.assertIn('Restauró', actividad.describe_restored(reserva())[0])
        resumen, detalle = actividad.describe_status(reserva(), sesion('a'), 'Programada', 'Cancelada')
        self.assertEqual(resumen, 'Marcó como Cancelada la sesión del 10-11-2026 10:00–12:00 en Puesto 4 de la reserva de '
                                  'Camila Rojas con Jaimito (antes Programada).')
        self.assertEqual(detalle, {'antes': 'Programada', 'despues': 'Cancelada'})

    def test_formats(self):
        self.assertEqual(actividad.price(1250000), '$1.250.000')
        self.assertEqual(actividad.month_name('2026-11-01'), 'noviembre de 2026')

    def test_registrar_never_raises(self):
        db = Mock()
        db.table.return_value.insert.return_value.execute.side_effect = Exception('sin tabla')
        # El fallo no se propaga: queda solo en el log del servidor (assertLogs lo comprueba y no lo imprime).
        with self.assertLogs('okami.actividad', level='ERROR') as logs:
            actividad.registrar(db, {'id': 'u', 'name': 'Bax', 'role': 'admin'}, 'reserva', 'crear', 'x')
        self.assertIn('reserva/crear', logs.output[0])
        sent = db.table.return_value.insert.call_args.args[0]
        self.assertEqual((sent['actor_nombre'], sent['actor_rol'], sent['categoria']), ('Bax', 'admin', 'reserva'))


class ActivityEndpointTests(unittest.TestCase):
    def setUp(self):
        self.api = TestClient(main.app)

    def tearDown(self):
        main.app.dependency_overrides.clear()

    def test_only_admins(self):
        self.assertEqual(self.api.get('/api/actividad').status_code, 401)
        main.app.dependency_overrides[main.get_current_user] = lambda: {'id': 't', 'name': 'T', 'role': 'tatuador'}
        self.assertEqual(self.api.get('/api/actividad').status_code, 403)

    @patch('main.client')
    def test_filters_and_pagination(self, client):
        main.app.dependency_overrides[main.get_current_user] = lambda: {'id': 'a', 'name': 'Bax', 'role': 'admin'}
        query = client.return_value.table.return_value.select.return_value
        for method in ('eq', 'gte', 'lte', 'or_', 'lt', 'order', 'limit'):
            getattr(query, method).return_value = query
        query.execute.return_value.data = [{'id': n} for n in (5, 4, 3)]
        response = self.api.get('/api/actividad?categoria=reserva&desde=2026-11-01&hasta=2026-11-07&q=Camila,(x)&antes=9&limite=2')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'registros': [{'id': 5}, {'id': 4}], 'hayMas': True})
        client.return_value.table.assert_called_with('registro_actividad_local')
        query.or_.assert_called_with('resumen.ilike.*Camila x*,actor_nombre.ilike.*Camila x*')
        query.lt.assert_called_with('id', 9)
        self.assertEqual(self.api.get('/api/actividad?categoria=otra').status_code, 422)


if __name__ == '__main__':
    unittest.main()
