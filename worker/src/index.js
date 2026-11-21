/**
 * TABESH Request Management System - Cloudflare Worker
 * Phase 1 backend implementation.
 */

const FRONTEND_ORIGIN = 'https://tabeshmachine.ir';
const ALLOWED_STATUSES = ['new', 'in_progress', 'follow_up', 'completed', 'rejected'];
const ALLOWED_TYPES = ['contact', 'product_inquiry'];
const SESSION_TTL_SECONDS = 28800;
const MAX_NAME_LEN = 200;
const MAX_CONTACT_LEN = 200;
const MAX_SUBJECT_LEN = 100;
const MAX_MESSAGE_LEN = 4000;
const MAX_PRODUCT_LEN = 200;
const MAX_NOTE_LEN = 4000;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const PBKDF2_ITERATIONS = 200000;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_SECONDS = 900;
const MAX_BODY_SIZE = 64 * 1024;

// ---------- helpers ----------
function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': FRONTEND_ORIGIN,
      'Access-Control-Allow-Credentials': 'true',
      'Vary': 'Origin',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

function errorResponse(message, status = 400, code = 'bad_request') {
  return jsonResponse({ ok: false, error: { message, code } }, status);
}

function corsPreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': FRONTEND_ORIGIN,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    },
  });
}

async function readJson(request) {
  try {
    const text = await request.text();
    if (!text) return null;
    if (text.length > MAX_BODY_SIZE) return null;
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function clientIp(request) {
  return (request.cf && request.cf.clientIp) || request.headers.get('CF-Connecting-IP') || 'unknown';
}

function isNonEmptyString(v) { return typeof v === 'string' && v.trim() !== ''; }
function isValidIranianMobile(value) { return /^09\d{9}$/.test(String(value).replace(/[\s-]/g, '')); }
function isValidEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value)); }
function isValidContact(value) { if (!isNonEmptyString(value)) return false; const v = value.trim(); return isValidEmail(v) || isValidIranianMobile(v); }
function clip(str, max) { if (str === null || str === undefined) return null; return String(str).slice(0, max); }

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function verifyPassword(password, storedHashB64, saltB64) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(bits)));
  return timingSafeEqual(hashB64, storedHashB64);
}

function generateSessionId() { return crypto.randomUUID(); }

async function getSession(request, KV) {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  if (!m) return null;
  const sid = m[1];
  const raw = await KV.get(`session:${sid}`);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    if (Date.now() > s.expires_at) { await KV.delete(`session:${sid}`); return null; }
    return s;
  } catch (_) { return null; }
}

async function destroySession(request, KV) {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  if (m) await KV.delete(`session:${m[1]}`);
}

function setCookie(headers, sessionId) {
  headers.append('Set-Cookie', `session=${sessionId}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SECONDS}`);
}

function clearCookie(headers) {
  headers.append('Set-Cookie', 'session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
}
// ---------- rate limit ----------
const loginAttempts = new Map();
function checkLoginRateLimit(ip) {
  const now = Date.now();
  const e = loginAttempts.get(ip);
  if (!e || now - e.windowStart > LOGIN_WINDOW_SECONDS * 1000) {
    loginAttempts.set(ip, { count: 1, windowStart: now });
    return { allowed: true, remaining: MAX_LOGIN_ATTEMPTS - 1 };
  }
  if (e.count >= MAX_LOGIN_ATTEMPTS) {
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((e.windowStart + LOGIN_WINDOW_SECONDS * 1000 - now) / 1000) };
  }
  e.count++;
  return { allowed: true, remaining: MAX_LOGIN_ATTEMPTS - e.count };
}

// ---------- idempotency ----------
async function checkIdempotency(KV, key) {
  if (!key) return { ok: true, duplicate: false, result: null };
  const stored = await KV.get(`idem:${key}`);
  if (stored) return { ok: true, duplicate: true, result: stored };
  await KV.put(`idem:${key}`, 'pending', { expirationTtl: 600 });
  return { ok: true, duplicate: false, result: null };
}

async function confirmIdempotency(KV, key, result) {
  if (!key) return;
  if (result) await KV.put(`idem:${key}`, result, { expirationTtl: 600 });
  else await KV.delete(`idem:${key}`);
}

// ---------- validation ----------
function validateCreateRequest(body) {
  const errors = [];
  const type = body.type;
  if (!type || !ALLOWED_TYPES.includes(type)) return [{ field: 'type', message: 'نوع درخواست نامعتبر است.' }];
  if (type === 'contact') {
    for (const f of ['name', 'contact', 'subject', 'message']) {
      if (!isNonEmptyString(body[f])) errors.push({ field: f, message: 'فیلد ناهماهنگ.' });
    }
    if (body.name && body.name.length > MAX_NAME_LEN) errors.push({ field: 'name', message: 'نام بیش از حد طولانی است.' });
    if (body.contact && !isValidContact(body.contact)) errors.push({ field: 'contact', message: 'تماس نامعتبر.' });
    if (body.subject && body.subject.length > MAX_SUBJECT_LEN) errors.push({ field: 'subject', message: 'موضوع بیش از حد طولانی است.' });
    if (body.message && body.message.length > MAX_MESSAGE_LEN) errors.push({ field: 'message', message: 'پیام بیش از حد طولانی است.' });
  } else if (type === 'product_inquiry') {
    if (body.name && body.name.length > MAX_NAME_LEN) errors.push({ field: 'name', message: 'نام بیش از حد طولانی است.' });
    for (const f of ['contact', 'product']) {
      if (!isNonEmptyString(body[f])) errors.push({ field: f, message: 'فیلد ناهماهنگ.' });
    }
    if (body.contact && !isValidIranianMobile(body.contact)) errors.push({ field: 'contact', message: 'شماره موبایل نامعتبر.' });
    if (body.product && body.product.length > MAX_PRODUCT_LEN) errors.push({ field: 'product', message: 'نام محصول بیش از حد طولانی است.' });
  }
  return errors;
}

function validatePatchRequest(body) {
  const errors = [];
  if (body.status !== undefined && !ALLOWED_STATUSES.includes(body.status)) errors.push({ field: 'status', message: 'وضعیت نامعتبر.' });
  if (body.note !== undefined && body.note.length > MAX_NOTE_LEN) errors.push({ field: 'note', message: 'یادداشت بیش از حد طولانی است.' });
  return errors;
}

function paginate(url) {
  const page = Math.max(1, parseInt(url.searchParams.get('page')) || 1);
  let limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(url.searchParams.get('limit')) || DEFAULT_PAGE_SIZE));
  return { page, limit, offset: (page - 1) * limit };
}
async function requireAdminSession(request, env) {
  const session = await getSession(request, env.SESSIONS);
  if (!session) return jsonResponse({ ok: false, error: { message: 'جلسه منقضی شده است. دوباره وارد شوید.', code: 'unauthenticated' } }, 401);
  if (request.method === 'PATCH' || request.method === 'POST' || request.method === 'DELETE') {
    if (!request.headers.has('X-CSRF-Token')) {
      return jsonResponse({ ok: false, error: { message: 'توکن CSRF نامعتبر است.', code: 'csrf_invalid' } }, 403);
    }
  }
  request.session = session;
  return null;
}
// ---- handler: POST /api/requests - async function handleCreateRequest(request, env) {
  const body = await readJson(request);
  if (!body) return errorResponse('بدن درخواست نامعتبر است.', 400);

  const idemKey = request.headers.get('Idempotency-Key');
  const idemCheck = await checkIdempotency(env.SESSIONS, idemKey);
  if (idemCheck.duplicate) {
    if (idemCheck.result && idemCheck.result !== 'pending') {
      return new Response(idemCheck.result, {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': FRONTEND_ORIGIN, 'Access-Control-Allow-Credentials': 'true' },
      });
    }
    return errorResponse('درخواست تکراری است.', 409, 'duplicate_request');
  }

  const errors = validateCreateRequest(body);
  if (errors.length) {
    await confirmIdempotency(env.SESSIONS, idemKey, null);
    return jsonResponse({ ok: false, errors, message: 'اعتبارسنجی ناموفق بود.' }, 422);
  }

  const type = body.type;
  const name = type === 'contact' ? clip(body.name, MAX_NAME_LEN) : body.name ? clip(body.name, MAX_NAME_LEN) : null;
  const contact = clip(body.contact, MAX_CONTACT_LEN);
  const subject = type === 'contact' ? clip(body.subject, MAX_SUBJECT_LEN) : null;
  const message = type === 'contact' ? clip(body.message, MAX_MESSAGE_LEN) : null;
  const product = type === 'product_inquiry' ? clip(body.product, MAX_PRODUCT_LEN) : null;

  try {
    const stmt = env.DB.prepare(
      `INSERT INTO requests (type, name, contact, subject, message, product, status)
       VALUES (?, ?, ?, ?, ?, ?, 'new')
       RETURNING id, type, name, contact, subject, message, product, status, created_at`
    );
    stmt.bind(type, name, contact, subject, message, product);
    const result = await stmt.first();

    if (!result) {
      await confirmIdempotency(env.SESSIONS, idemKey, null);
      return errorResponse('خطا در ذخیره درخواست.', 500);
    }

    try {
      await env.DB.prepare(
        `INSERT INTO request_history (request_id, action, new_status, changed_by, details)
         VALUES (?, 'request_created', 'new', 'system', ?)`
      ).bind(result.id, `درخواست جدید از طریق وب‌سایت (${type})`).run();
    } catch (_) {}

    const responseBody = JSON.stringify({ ok: true, data: { id: result.id, type: result.type, status: result.status, created_at: result.created_at } });
    await confirmIdempotency(env.SESSIONS, idemKey, responseBody);
    return jsonResponse({ ok: true, data: { id: result.id, type: result.type, status: result.status, created_at: result.created_at } }, 201);
  } catch (_) {
    await confirmIdempotency(env.SESSIONS, idemKey, null);
    return errorResponse('خطای سرور در ذخیره درخواست.', 500, 'db_error');
  }
}
// ---- handler: POST /api/auth/login - async function handleLogin(request, env) {
  const ip = clientIp(request);
  const rate = checkLoginRateLimit(ip);
  if (!rate.allowed) {
    return jsonResponse(
      { ok: false, error: { message: 'تعداد محاولات ورود بیش از حد مجاز است. لطفاً بعداً امتحان کنید.', code: 'rate_limited', retry_after: rate.retryAfter } },
      429,
      { 'Retry-After': String(rate.retryAfter) }
    );
  }

  const body = await readJson(request);
  if (!body || !body.username || !body.password) {
    return jsonResponse({ ok: false, error: { message: 'نام کاربری و رمز عبور الزامی است.', code: 'missing_credentials' } }, 400);
  }

  if (body.username !== env.ADMIN_USERNAME) {
    return jsonResponse({ ok: false, error: { message: 'نام کاربری یا رمز عبور اشتباه است.', code: 'invalid_credentials' } }, 401);
  }

  const passwordOk = await verifyPassword(body.password, env.ADMIN_PASSWORD_HASH, env.ADMIN_PBKDF2_SALT);
  if (!passwordOk) {
    return jsonResponse({ ok: false, error: { message: 'نام کاربری یا رمز عبور اشتباه است.', code: 'invalid_credentials' } }, 401);
  }

  const sessionId = generateSessionId();
  const session = { username: body.username, created_at: Date.now(), expires_at: Date.now() + SESSION_TTL_SECONDS * 1000, ip };
  await env.SESSIONS.put(`session:${sessionId}`, JSON.stringify(session), { expirationTtl: SESSION_TTL_SECONDS });

  const headers = new Headers();
  setCookie(headers, sessionId);
  return jsonResponse({ ok: true, message: 'ورود با موفقیت انجام شد.' }, 200, Object.fromEntries(headers));
}

// ---- handler: POST /api/auth/logout - async function handleLogout(request, env) {
  await destroySession(request, env.SESSIONS);
  const headers = new Headers();
  clearCookie(headers);
  return jsonResponse({ ok: true, message: 'خروج انجام شد.' }, 200, Object.fromEntries(headers));
}

// ---- handler: GET /api/auth/me - async function handleMe(request) {
  return jsonResponse({ ok: true, data: { username: request.session.username, created_at: request.session.created_at } });
}
// ---- handler: GET /api/requests - async function handleListRequests(request, url) {
  const { page, limit, offset } = paginate(url);
  const sf = url.searchParams.get('status') || undefined;
  const tf = url.searchParams.get('type') || undefined;
  const q = url.searchParams.get('q') || undefined;

  let sql = 'SELECT id, type, name, contact, subject, message, product, status, created_at, updated_at FROM requests WHERE 1=1';
  const p = [];
  if (sf) { if (!ALLOWED_STATUSES.includes(sf)) return errorResponse('فیلتر وضعیت نامعتبر.', 400); sql += ` AND status = ?`; p.push(sf); }
  if (tf) { if (!ALLOWED_TYPES.includes(tf)) return errorResponse('فیلتر نوع نامعتبر.', 400); sql += ` AND type = ?`; p.push(tf); }
  if (q) { sql += ` AND (name LIKE ? OR contact LIKE ? OR product LIKE ? OR message LIKE ?)`; const l = '%' + q + '%'; p.push(l, l, l, l); }
  sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  p.push(limit, offset);

  try {
    const stm = env.DB.prepare(sql);
    for (let i = 0; i < p.length; i++) stm.bind(i + 1, p[i]);
    const rows = await stm.all();

    let cntSql = 'SELECT COUNT(*) as cnt FROM requests WHERE 1=1';
    const cp = [];
    if (sf) { cntSql += ` AND status = ?`; cp.push(sf); }
    if (tf) { cntSql += ` AND type = ?`; cp.push(tf); }
    if (q) { cntSql += ` AND (name LIKE ? OR contact LIKE ? OR product LIKE ? OR message LIKE ?)`; const l2 = '%' + q + '%'; cp.push(l2, l2, l2, l2); }
    const cstmt = env.DB.prepare(cntSql);
    for (let i = 0; i < cp.length; i++) cstmt.bind(i + 1, cp[i]);
    const totalRow = await cstmt.first().catch(() => ({cnt:0}));
    const total = totalRow.cnt ?? 0;
    return jsonResponse({ ok: true, data: rows.results || [], meta: { page, limit, total, total_pages: Math.ceil(total / limit) } });
  } catch (_) { return errorResponse('خطا در بازیابی درخواست‌ها.', 500); }
}

// ---- handler: GET /api/requests/:id - async function handleRequestDetail(request, requestId) {
  try {
    const rStmt = env.DB.prepare(`SELECT * FROM requests WHERE id = ?`);
    rStmt.bind(1, requestId);
    const req = await rStmt.first();
    if (!req) return errorResponse('درخواست پیدا نشد.', 404);

    const nStmt = env.DB.prepare(`SELECT id, note, created_by, created_at FROM request_notes WHERE request_id = ? ORDER BY created_at ASC`);
    nStmt.bind(1, requestId);
    const notes = await nStmt.all();

    const hStmt = env.DB.prepare(`SELECT id, action, old_status, new_status, changed_by, changed_at, details FROM request_history WHERE request_id = ? ORDER BY changed_at DESC`);
    hStmt.bind(1, requestId);
    const history = await hStmt.all();

    return jsonResponse({ ok: true, data: { request: req, notes: notes.results || [], history: history.results || [] } });
  } catch (_) { return errorResponse('خطا در بازیابی درخواست.', 500); }
}
// ---- handler: PATCH /api/requests/:id - async function handlePatchRequest(request, requestId) {
  const body = await readJson(request);
  if (!body) return errorResponse('بدن درخواست نامعتبر است.', 400);
  const errs = validatePatchRequest(body);
  if (errs.length) return jsonResponse({ ok: false, errors: errs, message: 'اعتبارسنجی ناموفق بود.' }, 422);
  try {
    const curStmt = env.DB.prepare(`SELECT status FROM requests WHERE id = ?`);
    curStmt.bind(1, requestId);
    const current = await curStmt.first();
    if (!current) return errorResponse('درخواست پیدا نشد.', 404);
    if (body.status !== undefined && body.status !== current.status) {
      await env.DB.prepare(`UPDATE requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(body.status, requestId).run();
      await env.DB.prepare(`INSERT INTO request_history (request_id, action, old_status, new_status, changed_by, details) VALUES (?, 'status_changed', ?, ?, ?, ?)`).bind(requestId, current.status, body.status, request.session.username, `تغییر وضعیت توسط ${request.session.username}`).run();
    }
    if (body.note && String(body.note).trim()) {
      await env.DB.prepare(`INSERT INTO request_notes (request_id, note, created_by) VALUES (?, ?, ?)`).bind(requestId, String(body.note).trim(), request.session.username).run();
      await env.DB.prepare(`INSERT INTO request_history (request_id, action, new_status, changed_by, details) VALUES (?, 'note_added', ?, ?, ?, ?)`).bind(requestId, current.status, request.session.username, `افزودن یادداشت توسط ${request.session.username}`).run();
    }
    return jsonResponse({ ok: true, message: 'درخواست به‌روزرسانی شد.' });
  } catch (_) { return errorResponse('خطا در به‌روزرسانی.', 500); }
}
// ---- handler: GET /api/export - async function handleExport(request, url) {
  const sf = url.searchParams.get('status') || undefined;
  const tf = url.searchParams.get('type') || undefined;
  const q = url.searchParams.get('q') || undefined;
  let sql = 'SELECT id, type, name, contact, subject, message, product, status, created_at FROM requests WHERE 1=1';
  const p = [];
  if (sf) { if (!ALLOWED_STATUSES.includes(sf)) return errorResponse('فیلتر وضعیت نامعتبر.', 400); sql += ` AND status = ?`; p.push(sf); }
  if (tf) { if (!ALLOWED_TYPES.includes(tf)) return errorResponse('فیلتر نوع نامعتبر.', 400); sql += ` AND type = ?`; p.push(tf); }
  if (q) { sql += ` AND (name LIKE ? OR contact LIKE ? OR product LIKE ? OR message LIKE ?)`; const l = '%' + q + '%'; p.push(l, l, l, l); }
  sql += ` ORDER BY created_at DESC`;
  try {
    const stm = env.DB.prepare(sql);
    for (let i = 0; i < p.length; i++) stm.bind(i + 1, p[i]);
    const rows = await stm.all();
    const esc = (v) => v === null || v === undefined ? '' : ' ' + String(v).replace(/"/g, '""').replace(/
/g, ' ');
    const lines = ['id,type,name,contact,subject,message,product,status,created_at'];
    for (const r of rows.results || []) {
      lines.push([r.id, esc(r.type), esc(r.name), esc(r.contact), esc(r.subject), esc(r.message), esc(r.product), r.status, esc(r.created_at)].join(','));
    }
    return new Response(lines.join('\r\n'), { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="tabesh_requests_export.csv"', 'Access-Control-Allow-Origin': FRONTEND_ORIGIN, 'Access-Control-Allow-Credentials': 'true' } });
  } catch (_) { return errorResponse('خطا در خروجی فایل.', 500); }
}
// ---------- Main dispatcher ----------
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') return corsPreflight();

    const origin = request.headers.get('Origin') || '';
    if (origin && origin !== FRONTEND_ORIGIN) {
      return errorResponse('Origin not allowed', 403, 'origin_not_allowed');
    }

    // Public: POST /api/requests
    if (path === '/api/requests' && method === 'POST') {
      return handleCreateRequest(request, env);
    }

    // Public: POST /api/auth/login
    if (path === '/api/auth/login' && method === 'POST') {
      return handleLogin(request, env);
    }

    // Admin routes require session middleware
    const adminRoutes = ['/api/requests', '/api/export', '/api/auth/logout', '/api/auth/me'];
    const isAdminRoute = adminRoutes.some(r => path.startsWith(r + '/'));
    if (isAdminRoute && method !== 'OPTIONS') {
      const block = await requireAdminSession(request, env);
      if (block) return block;
    }

    if (path === '/api/auth/me' && method === 'GET') return handleMe(request);
    if (path === '/api/auth/logout' && method === 'POST') return handleLogout(request, env);

    if (path === '/api/requests' && method === 'GET') return handleListRequests(request, url);

    const detailMatch = path.match(/^\/api\/requests\/(\d+)$/);
    if (detailMatch && method === 'GET') return handleRequestDetail(request, parseInt(detailMatch[1], 10));
    if (detailMatch && method === 'PATCH') return handlePatchRequest(request, parseInt(detailMatch[1], 10));

    if (path === '/api/export' && method === 'GET') return handleExport(request, url);

    return errorResponse('Endpoint یافت نشد.', 404, 'not_found');
  },
};
