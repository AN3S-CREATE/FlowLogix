/**
 * Optional k6 smoke for FlowLogix. Run: k6 run deploy/load/k6-smoke.js
 * Env: BASE_URL, LOGIN_EMAIL, LOGIN_PASSWORD, BOARD_ID
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const base = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const email = __ENV.LOGIN_EMAIL || '';
const password = __ENV.LOGIN_PASSWORD || '';
const boardId = __ENV.BOARD_ID || '';

export const options = {
  vus: 5,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<1000'],
  },
};

export default function () {
  const health = http.get(`${base}/health`);
  check(health, { 'health 200': (r) => r.status === 200 });

  if (email && password) {
    const login = http.post(
      `${base}/auth/login`,
      JSON.stringify({ email, password }),
      { headers: { 'Content-Type': 'application/json' } },
    );
    check(login, { 'login 200/201': (r) => r.status === 200 || r.status === 201 });

    if (boardId && login.status < 300) {
      let token = '';
      try {
        const body = login.json();
        token = body.accessToken || body.access_token || '';
      } catch (_) {
        token = '';
      }
      if (token) {
        const board = http.get(`${base}/boards/${boardId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        check(board, { 'board 200': (r) => r.status === 200 });
      }
    }
  }

  sleep(0.5);
}
