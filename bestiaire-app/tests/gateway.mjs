// Passerelle de test : imite l'API Supabase (auth + PostgREST + fonctions) devant un PostgreSQL local.
// Utilisée uniquement par les tests de bout en bout.
import http from 'node:http';
import crypto from 'node:crypto';
import pg from 'pg';
import jwt from 'jsonwebtoken';
const SECRET = 'test-secret', PORT = +(process.env.GW_PORT || 54321);
pg.types.setTypeParser(20, Number); // bigint → nombre, comme PostgREST
const db = new pg.Pool();
const pw = new Map(); // email -> mot de passe
export const calls = [];
const send = (res, code, body, headers = {}) => { res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*', ...headers }); res.end(body === undefined ? '' : JSON.stringify(body)) };
const session = (u) => { const exp = Math.floor(Date.now() / 1000) + 3600; return { access_token: jwt.sign({ sub: u.id, role: 'authenticated', email: u.email, aud: 'authenticated', exp }, SECRET), token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r-' + u.id, user: userObj(u) } };
const userObj = (u) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString(), email_confirmed_at: new Date().toISOString() });
const body = (req) => new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => { try { r(d ? JSON.parse(d) : {}) } catch { r({}) } }) });
const sub = (req) => { const h = req.headers.authorization || ''; try { const t = jwt.verify(h.replace(/^Bearer /, ''), SECRET); return t.sub } catch { return null } };
async function asUser(uid, fn) {
  const c = await db.connect();
  try { await c.query('begin'); await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid || '']); await c.query(uid ? 'set local role authenticated' : 'set local role anon'); const r = await fn(c); await c.query('commit'); return r }
  catch (e) { await c.query('rollback'); throw e } finally { c.release() }
}
const ID = /^[a-z_][a-z0-9_]*$/;
const OPS = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };
http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204);
  const u = new URL(req.url, 'http://x'); const p = u.pathname;
  try {
    // ---- Auth (GoTrue) ----
    if (p === '/auth/v1/signup') { const b = await body(req); const ex = (await db.query('select * from auth.users where email=$1', [b.email])).rows[0]; if (ex) return send(res, 422, { code: 422, msg: 'User already registered', error_code: 'user_already_exists' }); const r = (await db.query('insert into auth.users(email) values ($1) returning *', [b.email])).rows[0]; pw.set(b.email, b.password); return send(res, 200, session(r)) }
    if (p === '/auth/v1/token') { const b = await body(req); const gt = u.searchParams.get('grant_type');
      if (gt === 'password') { const r = (await db.query('select * from auth.users where email=$1', [b.email])).rows[0]; if (!r || pw.get(b.email) !== b.password) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 400, msg: 'Invalid login credentials', error_code: 'invalid_credentials' }); return send(res, 200, session(r)) }
      if (gt === 'refresh_token') { const id = String(b.refresh_token || '').slice(2); const r = (await db.query('select * from auth.users where id=$1', [id])).rows[0]; if (!r) return send(res, 400, { error: 'invalid_grant' }); return send(res, 200, session(r)) } }
    if (p === '/auth/v1/user') { const id = sub(req); const r = id && (await db.query('select * from auth.users where id=$1', [id])).rows[0]; return r ? send(res, 200, userObj(r)) : send(res, 401, { msg: 'unauthorized' }) }
    if (p === '/auth/v1/logout') return send(res, 204);
    if (p === '/auth/v1/otp') { calls.push({ otp: (await body(req)).email }); return send(res, 200, {}) }
    // ---- Fonctions serveur (Stripe simulé) ----
    if (p.startsWith('/functions/v1/')) { const id = sub(req); if (!id) return send(res, 401, { error: 'non connecté' }); calls.push({ fn: p.split('/').pop(), uid: id }); return send(res, 200, { url: 'about:blank#stripe-' + p.split('/').pop() }) }
    // ---- PostgREST ----
    if (p.startsWith('/rest/v1/rpc/')) {
      const fn = p.split('/').pop(); if (!ID.test(fn)) return send(res, 404, {});
      const b = await body(req); const keys = Object.keys(b).filter(k => ID.test(k));
      const info = (await db.query(`select proretset from pg_proc where proname=$1 and pronamespace='public'::regnamespace`, [fn])).rows[0];
      if (!info) return send(res, 404, { code: 'PGRST202', message: 'fonction inconnue' });
      const args = keys.map((k, i) => `${k} => $${i + 1}`).join(', ');
      const out = await asUser(sub(req), c => info.proretset ? c.query(`select * from public.${fn}(${args})`, keys.map(k => b[k])).then(r => r.rows) : c.query(`select public.${fn}(${args}) as r`, keys.map(k => b[k])).then(r => r.rows[0].r));
      return send(res, 200, out ?? null);
    }
    if (p.startsWith('/rest/v1/')) {
      const table = p.split('/').pop(); if (!ID.test(table)) return send(res, 404, {});
      const where = [], vals = []; let order = '', limit = '', offset = '', cols = '*';
      for (const [k, v] of u.searchParams) {
        if (k === 'select') { cols = v === '*' ? '*' : v.split(',').filter(x => ID.test(x)).join(','); continue }
        if (k === 'order') { order = ' order by ' + v.split(',').map(o => { const [c, d] = o.split('.'); return ID.test(c) ? `${c} ${d === 'desc' ? 'desc' : 'asc'}` : '' }).filter(Boolean).join(','); continue }
        if (k === 'limit') { limit = ' limit ' + (+v | 0); continue } if (k === 'offset') { offset = ' offset ' + (+v | 0); continue }
        if (!ID.test(k)) continue; const [op, ...rest] = v.split('.'); const val = rest.join('.');
        if (OPS[op]) { vals.push(val); where.push(`${k} ${OPS[op]} $${vals.length}`) }
        else if (op === 'is') where.push(`${k} is ${val === 'null' ? 'null' : val === 'true' ? 'true' : 'false'}`);
      }
      const w = where.length ? ' where ' + where.join(' and ') : '';
      if (req.method === 'GET') { const rows = await asUser(sub(req), c => c.query(`select ${cols} from public.${table}${w}${order}${limit}${offset}`, vals).then(r => r.rows)); return send(res, 200, rows) }
      if (req.method === 'PATCH') { const b = await body(req); const ks = Object.keys(b).filter(k => ID.test(k)); const sets = ks.map((k, i) => `${k} = $${vals.length + i + 1}`).join(', ');
        const rows = await asUser(sub(req), c => c.query(`update public.${table} set ${sets}${w} returning *`, [...vals, ...ks.map(k => b[k])]).then(r => r.rows)); return send(res, 200, rows) }
    }
    if (p.startsWith('/realtime/')) return send(res, 404, {});
    send(res, 404, { message: 'inconnu ' + p });
  } catch (e) { send(res, 400, { code: e.code || 'P0001', message: e.message, details: null, hint: null }) }
}).listen(PORT, () => console.log('passerelle Supabase de test sur', PORT));
export { db };
