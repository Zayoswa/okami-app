import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

import main


def wrong_password(*_args, **_kwargs):
    raise RuntimeError("Invalid login credentials")


class SecurityHeadersTests(unittest.TestCase):
    def setUp(self):
        self.api = TestClient(main.app)

    def test_every_response_carries_security_headers(self):
        # También en un error: /auth/me sin sesión responde 401.
        for response in (self.api.get('/health'), self.api.get('/auth/me')):
            with self.subTest(status=response.status_code):
                self.assertEqual(response.headers['x-content-type-options'], 'nosniff')
                self.assertEqual(response.headers['x-frame-options'], 'DENY')
                self.assertEqual(response.headers['referrer-policy'], 'no-referrer')
                self.assertIn('max-age=', response.headers['strict-transport-security'])
                self.assertEqual(response.headers['content-security-policy'], main.API_CSP)

    def test_swagger_docs_keep_working_without_csp(self):
        response = self.api.get('/docs')
        self.assertEqual(response.status_code, 200)
        self.assertNotIn('content-security-policy', response.headers)
        self.assertEqual(response.headers['x-frame-options'], 'DENY')


@patch('main.client')
class LoginRateLimitTests(unittest.TestCase):
    def setUp(self):
        self.api = TestClient(main.app)
        main._login_failures.clear()

    def tearDown(self):
        main._login_failures.clear()

    def login(self, email='ana@okami.test', password='mala'):
        return self.api.post('/auth/login', json={'email': email, 'password': password})

    def test_blocks_after_too_many_failures(self, client):
        client.return_value.auth.sign_in_with_password.side_effect = wrong_password
        codes = [self.login().status_code for _ in range(main.LOGIN_MAX_FAILURES)]
        self.assertEqual(codes, [401] * main.LOGIN_MAX_FAILURES)

        blocked = self.login()
        self.assertEqual(blocked.status_code, 429)
        self.assertIn('Demasiados intentos', blocked.json()['detail'])
        self.assertGreater(int(blocked.headers['retry-after']), 0)
        # Bloqueado ya no consulta a Supabase Auth.
        self.assertEqual(client.return_value.auth.sign_in_with_password.call_count, main.LOGIN_MAX_FAILURES)

    def test_same_email_with_other_case_counts_together(self, client):
        client.return_value.auth.sign_in_with_password.side_effect = wrong_password
        for i in range(main.LOGIN_MAX_FAILURES):
            self.login(email='ANA@okami.test' if i % 2 else ' ana@okami.test ')
        self.assertEqual(self.login().status_code, 429)

    def test_other_email_is_not_blocked(self, client):
        client.return_value.auth.sign_in_with_password.side_effect = wrong_password
        for _ in range(main.LOGIN_MAX_FAILURES):
            self.login()
        self.assertEqual(self.login(email='otra@okami.test').status_code, 401)

    def test_block_expires_after_the_window(self, client):
        client.return_value.auth.sign_in_with_password.side_effect = wrong_password
        with patch('main.time_module.monotonic', return_value=1000.0):
            for _ in range(main.LOGIN_MAX_FAILURES):
                self.login()
            self.assertEqual(self.login().status_code, 429)
        with patch('main.time_module.monotonic', return_value=1000.0 + main.LOGIN_WINDOW_SECONDS + 1):
            self.assertEqual(self.login().status_code, 401)

    @patch('main.profile', return_value={'id': 'u-1', 'name': 'Ana', 'role': 'tatuador'})
    def test_successful_login_resets_the_count(self, _profile, client):
        auth = client.return_value.auth
        auth.sign_in_with_password.side_effect = wrong_password
        for _ in range(main.LOGIN_MAX_FAILURES - 1):
            self.login()
        auth.sign_in_with_password.side_effect = None
        auth.sign_in_with_password.return_value = SimpleNamespace(
            user=SimpleNamespace(id='u-1'), session=SimpleNamespace(access_token='a', refresh_token='r'))
        self.assertEqual(self.login(password='buena').status_code, 200)
        self.assertNotIn(main._login_key(SimpleNamespace(client=SimpleNamespace(host='testclient')), 'ana@okami.test'),
                         main._login_failures)
        auth.sign_in_with_password.side_effect = wrong_password
        self.assertEqual(self.login().status_code, 401)


if __name__ == '__main__':
    unittest.main()
