import unittest
from datetime import date
from io import BytesIO
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
from pypdf import PdfReader

import consentimiento_pdf
import main

TATUADOR = '11111111-1111-1111-1111-111111111111'
OTRO = '33333333-3333-3333-3333-333333333333'
CONSENT_ID = '55555555-5555-5555-5555-555555555555'
HOY = date.today().isoformat()
BODY = dict(fecha=HOY, tatuadorId=TATUADOR, tatuadorRut='12.345.678-5', clienteNombre='Camila Rojas',
            clienteRut='30.000.001-0', clienteNacimiento='1995-02-02', clienteTelefono='+56 9 1234 5678',
            descripcion='Rosa en línea fina', zonaCuerpo='Antebrazo derecho', tipoTatuaje='Nuevo')
FILA = dict(id=CONSENT_ID, folio=42, fecha=HOY, reserva=None, tatuador=TATUADOR, tatuador_nombre='Jaimito',
            tatuador_rut='123456785', tatuador_nacimiento=None, tatuador_telefono=None, cliente_nombre='Camila Rojas',
            cliente_rut='300000010', cliente_nacimiento='1995-02-02', cliente_telefono=None, cliente_direccion=None,
            representante_nombre=None, representante_rut=None, representante_nacimiento=None, representante_telefono=None,
            descripcion='Rosa en línea fina', zona_cuerpo='Antebrazo derecho', condiciones=None, tipo_tatuaje='Nuevo',
            creado_en='2026-11-09T12:00:00Z')


def fake_db(consentimientos=None, usuarios=None, roles=None, insert=None):
    """Cliente de Supabase falso: devuelve filas según la tabla y anota lo insertado y los filtros eq."""
    tablas = {'consentimientos': consentimientos or [], 'usuarios': usuarios or [], 'rol': roles or []}
    db = MagicMock()
    db.insertadas, db.filtros = [], []

    def table(nombre):
        t = MagicMock()
        consulta = MagicMock()
        consulta.execute.return_value.data = tablas.get(nombre, [])
        for metodo in ('select', 'order', 'limit', 'in_'):
            getattr(consulta, metodo).return_value = consulta

        def eq(columna, valor):
            db.filtros.append((nombre, columna, valor))
            return consulta
        consulta.eq.side_effect = eq
        t.select.return_value = consulta

        def insertar(fila):
            db.insertadas.append(fila)
            resultado = MagicMock()
            resultado.execute.return_value.data = [insert] if insert else []
            return resultado
        t.insert.side_effect = insertar
        return t
    db.table.side_effect = table
    return db


class ConsentValidationTests(unittest.TestCase):
    def errores(self, **cambios):
        return main.consent_errors(main.ConsentRequest(**{**BODY, **cambios}), date.today())

    def test_valid_adult_has_no_errors(self):
        self.assertEqual(self.errores(), '')

    def test_minor_needs_a_representative(self):
        menor = f'{date.today().year - 16}-01-01'
        self.assertIn('menor de edad', self.errores(clienteNacimiento=menor))
        self.assertEqual(self.errores(clienteNacimiento=menor, representanteNombre='María Fuentes',
                                      representanteRut='11.111.111-1'), '')
        self.assertIn('RUT del representante', self.errores(clienteNacimiento=menor, representanteNombre='María Fuentes',
                                                            representanteRut='11.111.111-2'))

    def test_ruts_phones_and_dates_are_checked(self):
        self.assertIn('RUT del tatuador', self.errores(tatuadorRut='12.345.678-0'))
        self.assertIn('dígito verificador', self.errores(clienteRut='30.000.001-3'))
        self.assertIn('teléfono del cliente', self.errores(clienteTelefono='llamar a las 5'))
        self.assertIn('nacimiento del cliente', self.errores(clienteNacimiento='2999-01-01'))
        self.assertIn('fecha del consentimiento', self.errores(fecha='2001-01-01'))
        self.assertIn('Describe el tatuaje', self.errores(descripcion='   '))

    def test_age(self):
        self.assertEqual(consentimiento_pdf.edad('2008-12-01', '2026-11-30'), 17)
        self.assertEqual(consentimiento_pdf.edad('2008-12-01', '2026-12-01'), 18)
        self.assertEqual(consentimiento_pdf.formato_rut('30000001K'), '30.000.001-K')


class ConsentEndpointTests(unittest.TestCase):
    def setUp(self):
        self.api = TestClient(main.app)
        self.addCleanup(main.app.dependency_overrides.clear)
        patcher = patch('main.log_event')
        patcher.start()
        self.addCleanup(patcher.stop)

    def sign_in(self, role, uid=TATUADOR):
        main.app.dependency_overrides[main.get_current_user] = lambda: {'id': uid, 'role': role, 'name': 'X'}

    def test_anonymous_cannot_access(self):
        self.assertEqual(self.api.get('/api/consentimientos').status_code, 401)
        self.assertEqual(self.api.post('/api/consentimientos', json=BODY).status_code, 401)
        self.assertEqual(self.api.get(f'/api/consentimientos/{CONSENT_ID}/pdf').status_code, 401)

    def test_artist_cannot_create_for_another_artist(self):
        self.sign_in('tatuador', OTRO)
        with patch('main.client') as client:
            response = self.api.post('/api/consentimientos', json=BODY)
        self.assertEqual(response.status_code, 403)
        client.assert_not_called()

    def test_reception_creates_and_the_row_is_cleaned(self):
        self.sign_in('recepcion', OTRO)
        db = fake_db(usuarios=[{'id': TATUADOR, 'nombre': 'Jaimito', 'rol': 1}], roles=[{'id': 1, 'nombre': 'tatuador'}],
                     insert=FILA)
        with patch('main.client', return_value=db):
            response = self.api.post('/api/consentimientos', json={**BODY, 'clienteNombre': '  Camila   Rojas ',
                                                                   'representanteNombre': 'Ignorado'})
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()['folio'], 42)
        fila = db.insertadas[0]
        self.assertEqual((fila['cliente_nombre'], fila['cliente_rut'], fila['tatuador_rut']), ('Camila Rojas', '300000010', '123456785'))
        self.assertIsNone(fila['representante_nombre'])  # adulto: el representante no se guarda
        self.assertEqual((fila['tatuador_nombre'], fila['creado_por']), ('Jaimito', OTRO))

    def test_artist_only_sees_own_pdf(self):
        self.sign_in('tatuador', OTRO)
        with patch('main.client', return_value=fake_db(consentimientos=[FILA])):
            self.assertEqual(self.api.get(f'/api/consentimientos/{CONSENT_ID}/pdf').status_code, 404)
        self.sign_in('tatuador', TATUADOR)
        with patch('main.client', return_value=fake_db(consentimientos=[FILA])):
            response = self.api.get(f'/api/consentimientos/{CONSENT_ID}/pdf')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['content-type'], 'application/pdf')
        texto = PdfReader(BytesIO(response.content)).pages[0].extract_text()
        self.assertIn('000042', texto)
        self.assertIn('Camila Rojas', texto)
        self.assertIn('30.000.001-0', texto)

    def test_artist_listing_is_filtered_by_artist(self):
        self.sign_in('tatuador', TATUADOR)
        db = fake_db(consentimientos=[FILA])
        with patch('main.client', return_value=db):
            rows = self.api.get('/api/consentimientos').json()
        self.assertIn(('consentimientos', 'tatuador', TATUADOR), db.filtros)
        self.assertEqual(rows[0]['folio'], 42)
        self.assertFalse(rows[0]['menorDeEdad'])


if __name__ == '__main__':
    unittest.main()
