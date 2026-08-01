#!/usr/bin/env node
/**
 * Minimal Node load smoke for FlowLogix critical endpoints.
 * Uses built-in fetch — no required deps. For heavier load, see README (autocannon/k6).
 *
 * Env:
 *   BASE_URL       default http://localhost:3000
 *   LOGIN_EMAIL    optional — enables login + board steps
 *   LOGIN_PASSWORD optional
 *   BOARD_ID       optional — GET /boards/:id after login
 *   ITERATIONS     default 20
 */
/* eslint-disable no-console */

const base = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const iterations = Number(process.env.ITERATIONS ?? 20);
const email = process.env.LOGIN_EMAIL;
const password = process.env.LOGIN_PASSWORD;
const boardId = process.env.BOARD_ID;

/**
 * @param {string} name
 * @param {() => Promise<Response>} fn
 */
async function timed(name, fn) {
  const samples = [];
  let errors = 0;
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    try {
      const res = await fn();
      const ms = performance.now() - t0;
      samples.push(ms);
      if (!res.ok) {
        errors += 1;
        console.warn(`${name} status ${res.status}`);
      }
    } catch (e) {
      errors += 1;
      samples.push(performance.now() - t0);
      console.warn(`${name} error`, e instanceof Error ? e.message : e);
    }
  }
  samples.sort((a, b) => a - b);
  const p95 = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))];
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  console.log(
    `${name}: n=${iterations} avg=${avg.toFixed(1)}ms p95=${p95.toFixed(1)}ms errors=${errors}`,
  );
  return errors === 0;
}

async function main() {
  console.log(`FlowLogix load smoke → ${base} (${iterations} iters)`);
  let ok = await timed('GET /health', () => fetch(`${base}/health`));

  let token = null;
  if (email && password) {
    ok =
      (await timed('POST /auth/login', async () => {
        const res = await fetch(`${base}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        if (res.ok) {
          const body = await res.json();
          token = body.accessToken ?? body.access_token ?? null;
        }
        return res;
      })) && ok;

    if (token && boardId) {
      ok =
        (await timed(`GET /boards/${boardId}`, () =>
          fetch(`${base}/boards/${boardId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        )) && ok;
    } else if (token) {
      console.log('LOGIN ok — set BOARD_ID to also smoke GET /boards/:id');
    }
  } else {
    console.log('Skip login/board — set LOGIN_EMAIL + LOGIN_PASSWORD to enable');
  }

  if (!ok) {
    process.exitCode = 1;
    console.error('Load smoke reported errors');
  } else {
    console.log('Load smoke finished without HTTP errors');
  }
}

main();
