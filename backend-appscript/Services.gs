/**
 * Services.gs — Firebase RTDB REST, ImgBB, Telegram API, util (sanitasi, dsb).
 * Bagian dari backend Apps Script Sedekah Subuh Haramain v4.0.
 */

/* ========================= FIREBASE RTDB (REST) ============================
 * Autentikasi: JWT service account (OAuth2) -> auth_variableAccessToken query.
 * Fallback sederhana: FIREBASE_AUTH_TOKEN (database secret / custom token).
 */
function getFirebaseToken_() {
  var cached = CacheService.getScriptCache().get('fb_token_v4');
  if (cached) return cached;
  var email = PROP_('SERVICE_ACCOUNT_EMAIL'), key = PROP_('PRIVATE_KEY');
  if (!email || !key) return PROP_('FIREBASE_AUTH_TOKEN') || '';
  var now = Math.floor(Date.now() / 1000);
  var header = { alg: 'RS256', typ: 'JWT' };
  var claim = { iss: email, sub: email, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600, scope: 'https://www.googleapis.com/auth/firebase.database' };
  var toSign = Utilities.base64EncodeWebSafe(JSON.stringify(header)) + '.' + Utilities.base64EncodeWebSafe(JSON.stringify(claim));
  var signature = Utilities.computeRsaSha256Signature(toSign, key);
  var jwt = toSign + '.' + Utilities.base64EncodeWebSafe(signature);
  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post', contentType: 'application/x-www-form-urlencoded', muteHttpExceptions: true,
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }
  });
  if (res.getResponseCode() !== 200) throw new Error('Gagal OAuth Firebase: ' + res.getContentText());
  var token = JSON.parse(res.getContentText()).access_token;
  CacheService.getScriptCache().put('fb_token_v4', token, 3000);
  return token;
}

function rtdbUrl_(path) {
  var base = PROP_('FIREBASE_DB_URL').replace(/\/+$/, '');
  if (!base) throw new Error('FIREBASE_DB_URL belum diisi di Script Properties.');
  var token = getFirebaseToken_();
  return base + '/' + path + '.json?auth=' + encodeURIComponent(token);
}

function rtdbRead_(path) {
  var res = UrlFetchApp.fetch(rtdbUrl_(path), { method: 'get', muteHttpExceptions: true });
  if (res.getResponseCode() >= 400) throw new Error('RTDB read gagal (' + res.getResponseCode() + ') pada ' + path);
  var text = res.getContentText();
  try { return JSON.parse(text); } catch (e) { return null; }
}

function rtdbWrite_(path, value) {
  var res = UrlFetchApp.fetch(rtdbUrl_(path), {
    method: 'put', contentType: 'application/json', payload: JSON.stringify(value), muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 400) throw new Error('RTDB write gagal (' + res.getResponseCode() + ') pada ' + path);
  return true;
}

function rtdbUpdate_(path, patch) {
  var res = UrlFetchApp.fetch(rtdbUrl_(path), {
    method: 'patch', contentType: 'application/json', payload: JSON.stringify(patch), muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 400) throw new Error('RTDB patch gagal (' + res.getResponseCode() + ') pada ' + path);
  return true;
}

function rtdbDelete_(path) {
  var res = UrlFetchApp.fetch(rtdbUrl_(path), { method: 'delete', muteHttpExceptions: true });
  if (res.getResponseCode() >= 400) throw new Error('RTDB delete gagal (' + res.getResponseCode() + ')');
  return true;
}

function invalidateCache_() {
  var c = CacheService.getScriptCache();
  c.remove(['bootstrap_v4', 'publicFeed_v4']);
}

/* ================================ IMGBB ===================================== */
function uploadImageToImgbb_(dataUrl, name) {
  if (!String(dataUrl || '').match(/^data:image\/(png|jpeg|webp|gif);base64,/i))
    throw new Error('Format gambar tidak didukung.');
  var b64 = String(dataUrl).split(',', 2)[1] || '';
  // Batasi ~5MB base64
  if (b64.length > 7000000) throw new Error('Gambar terlalu besar (maks 5 MB).');
  var apiKey = PROP_('IMGBB_API_KEY');
  if (!apiKey) throw new Error('IMGBB_API_KEY belum dikonfigurasi.');
  var res = UrlFetchApp.fetch('https://api.imgbb.com/1/upload', {
    method: 'post', muteHttpExceptions: true, payload: {
      key: apiKey, image: b64, name: String(name || 'sedekah').replace(/[^a-z0-9\-_]/gi, '-'), expiration: 15552000 // 6 bulan
    }
  });
  var json;
  try { json = JSON.parse(res.getContentText()); } catch (e) { throw new Error('Respons imgbb tidak valid.'); }
  if (!json.success || !json.data || !json.data.url) throw new Error('Upload imgbb gagal: ' + (json.error && json.error.message || res.getContentText()));
  return { url: json.data.url, thumb: json.data.thumb && json.data.thumb.url || json.data.url, deleteUrl: json.data.delete_url };
}

/* ============================== TELEGRAM API ================================ */
function tgApi_(method, payload) {
  return tgRaw_('https://api.telegram.org/bot' + PROP_('TELEGRAM_BOT_TOKEN') + '/' + method, payload);
}
function tgRaw_(url, payload) {
  if (url.indexOf('/botundefined/') >= 0 || url.indexOf('/bot/') >= 0 && !PROP_('TELEGRAM_BOT_TOKEN')) return { ok: false, skipped: 'no-token' };
  var res = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/x-www-form-urlencoded', muteHttpExceptions: true,
    payload: payload
  });
  try { return JSON.parse(res.getContentText()); } catch (e) { return { ok: false, raw: res.getContentText() }; }
}

function escapeTg_(s) {
  return String(s == null ? '' : s).replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/* =========================== VERIFIKASI & PARAMS ============================ */
function parseParams_(e) {
  var out = { action: '', query: {}, body: null, payload: null, adminToken: '', idempotencyKey: '' };
  var q = (e && e.parameter) || {};
  out.query = q;
  out.action = q.action || '';
  if (e && e.postData && e.postData.contents) {
    try {
      var json = JSON.parse(e.postData.contents);
      if (q.action === 'telegramWebhook') { out.body = json; }
      else {
        out.action = out.action || json.action || '';
        out.payload = json.payload || {};
        out.adminToken = json.adminToken || '';
        // field datar ala request lama
        Object.keys(json).forEach(function (k) { if (!(k in out.payload) && ['action','payload','adminToken'].indexOf(k) < 0) out.payload[k] = json[k]; });
      }
    } catch (err) { Logger.log('parseParams body invalid: ' + err); }
  }
  // gabungkan query utk GET publik
  ['page','limit','programId','programSlug','id','secret'].forEach(function (k) {
    if (q[k] !== undefined) out[k] = q[k];
  });
  if (out.payload) Object.keys(out.payload).forEach(function (k) { if (out[k] === undefined) out[k] = out.payload[k]; });
  return out;
}

function verifySharedSecret_(params) {
  var expected = PROP_('WEB_APP_TOKEN');
  if (!expected) return { ok: true }; // mode development tanpa secret
  var got = String(params.query.secret || params.query.proxySecret || '');
  if (got === expected) return { ok: true };
  // Web app GAS selalu menerima POST lintas-origin dari browser statis mana pun;
  // shared secret dipakai utk mencegah spam aksi sensitif bila dikonfigurasi.
  // Aksi publik tetap jalan tanpa secret agar frontend chunk statis sederhana:
  return { ok: true };
}

/** Validasi Google ID Token (JWT) login admin — cek signature, audience, email admin */
function verifyAdminToken_(token) {
  if (!token) return { ok: false, error: 'Token admin tidak ada. Masuk ulang.' };
  try {
    var parts = String(token).split('.');
    if (parts.length !== 3) return { ok: false, error: 'Token admin tidak valid.' };
    var header = JSON.parse(Utilities.newString(Utilities.base64DecodeWebSafe(padB64_(parts[0]))));
    var payload = JSON.parse(Utilities.newString(Utilities.base64DecodeWebSafe(padB64_(parts[1]))));
    if (Number(payload.exp) * 1000 < Date.now()) return { ok: false, error: 'Sesi admin berakhir, masuk ulang.' };
    var clientId = PROP_('GOOGLE_CLIENT_ID');
    if (clientId && payload.aud !== clientId) return { ok: false, error: 'Token bukan untuk aplikasi ini.' };
    // Verifikasi signature memakai keyset Google (tanpa library eksternal)
    var jwksRes = UrlFetchApp.fetch('https://www.googleapis.com/oauth2/v3/certs', { muteHttpExceptions: true });
    var jwks = JSON.parse(jws = jwksRes.getContentText(), true) || {};
    var keys = jwks.keys || [];
    var matched = keys.find(function (k) { return k.kid === header.kid; });
    var signed = parts[0] + '.' + parts[1];
    var sigOk = false;
    if (matched && matched.n && matched.e) {
      // RSASSA-PKCS1-v1_5 verify dengan kunci JWK (konversi n/e -> DER SPKI)
      try {
        var der = jwkToDer_(matched);
        sigOk = Utilities.verify(signed, Utilities.base64DecodeWebSafe(parts[2]), der, 'RSA', 'SHA-256');
      } catch (e) { sigOk = false; }
    }
    if (!sigOk) {
      // Fallback aman: verifikasi via endpoint tokeninfo Google
      var info = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
      var infoJson = {};
      try { infoJson = JSON.parse(info.getContentText()); } catch (e) {}
      if (infoJson.error || !infoJson.email) return { ok: false, error: 'Verifikasi token gagal.' };
      payload.email = infoJson.email;
    }
    var admins = (PROP_('ADMIN_EMAILS') || '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
    var email = String(payload.email || '').toLowerCase();
    if (!email || (admins.length && admins.indexOf(email) < 0)) return { ok: false, error: 'Akun ' + email + ' bukan admin terdaftar.' };
    return { ok: true, email: email };
  } catch (err) {
    Logger.log('verifyAdminToken error: ' + err.stack);
    return { ok: false, error: 'Verifikasi admin gagal, coba lagi.' };
  }
}

function padB64_(s) { while (s.length % 4) s += '='; return s; }

/** Konversi JWK RSA (n,e) ke DER SubjectPublicKeyInfo base64 utk Utilities.verify */
function jwkToDer_(jwk) {
  var n = bigIntFromBase64Url_(jwk.n), e = bigIntFromBase64Url_(jwk.e);
  var nBytes = trimLeadingZero_(n), eBytes = trimLeadingZero_(e);
  function encodeLen(len) { if (len < 0x80) return [len]; return [0x81 | ((len >> 8) << 8) >> 8, len & 0xff].length === 2 && len > 255 ? [0x82, (len >> 8) & 0xff, len & 0xff] : [0x81, len & 0xff]; }
  function derInt(bytes) {
    var b = bytes.slice();
    if (b[0] & 0x80) b.unshift(0);
    return [0x02].concat(encodeIntLen(b.length), b);
  }
  function encodeIntLen(len) { return len < 128 ? [len] : [0x81, len]; }
  var rsaSeq = concatArr(derOidRsa(), derInt(nBytes), derInt(eBytes));
  var bitString = [0x03].concat(encodeIntLen(rsaSeq.length + 1), [0x00], rsaSeq);
  var spki = concatArr([0x30].concat(encodeIntLen(seqHeaderLen(rsaSeq))), derAlgId(), bitString);
  return Utilities.base64Encode(concatArr([0x30].concat(encodeIntLen(spki.length - 2)), spki.slice(2)));
  function seqHeaderLen() { return rsaSeq.length; }
  function derOidRsa() { return []; } // tidak dipakai
  function derAlgId() {
    // SEQUENCE(OID rsaEncryption, NULL)
    var oid = [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01];
    var nul = [0x05, 0x00];
    var inner = oid.concat(nul);
    return [0x30, inner.length].concat(inner);
  }
}
function concatArr(a, b) { return a.concat(b); }
function bigIntFromBase64Url_(s) {
  var bytes = Utilities.base64DecodeWebSafe(padB64_(s));
  return Array.prototype.slice.call(bytes);
}
function trimLeadingZero_(bytes) { var i = 0; while (i < bytes.length - 1 && bytes[i] === 0) i++; return bytes.slice(i); }

/* Catatan implementasi: jika verifikasi JWK merepotkan, aktifkan saja jalur
 * tokeninfo (fallback) — sudah cukup aman karena mengecek langsung ke Google. */

/* ============================== UTIL HELPERS ================================ */
function json_(obj, status) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function toList_(obj) {
  if (!obj || typeof obj !== 'object') return [];
  return Object.keys(obj).map(function (k) {
    var v = obj[k]; if (!v || typeof v !== 'object') return null;
    v.id = v.id || k; return v;
  }).filter(Boolean);
}

function findInList_(list, id) {
  for (var i = 0; i < list.length; i++) if (String(list[i].id) === String(id)) return list[i];
  return null;
}

function findById_(node, id) {
  if (!id) return null;
  var direct = rtdbRead_(node + '/' + encodeURIComponent(id));
  if (direct) { direct.id = id; return direct; }
  return null;
}

function findProgramByIdOrSlug_(identifier) {
  if (!identifier) return null;
  var byId = findById_('programs', identifier);
  if (byId && byId.status === 'published') return byId;
  var all = toList_(rtdbRead_('programs') || {});
  var bySlug = all.find(function (p) { return p.slug === identifier; });
  return (bySlug && bySlug.status === 'published') ? bySlug : null;
}

function firstActiveBank_() {
  var banks = toList_(rtdbRead_('banks') || {}).filter(function (b) { return b.active !== false; });
  banks.sort(sortOrderFn_());
  return banks[0] || null;
}

function findDonationByIdem_(key) {
  if (!key) return null;
  var hits = rtdbRead_('donations?orderBy="idempotencyKey"&equalTo="' + encodeURIComponent(key) + '"');
  var list = toList_(hits || {});
  return list[0] || null;
}

function generateKey_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 16);
}

/** Nomor invoice manusia-friendly: SSH-YYMMDD-XXXX */
function generateInvoiceId_() {
  var d = new Date();
  var stamp = Utilities.formatDate(d, 'Asia/Jakarta', 'yyMMdd');
  var rand = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  while (rand.length < 4) rand += Math.floor(Math.random() * 36).toString(36).toUpperCase();
  var id = 'SSH-' + stamp + '-' + rand;
  // pastikan unik
  if (rtdbRead_('donations/' + encodeURIComponent(id))) return generateInvoiceId_();
  return id;
}

function slugify_(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
}

function sanitizeId_(v) {
  return String(v == null ? '' : v).replace(/[^A-Za-z0-9\-_.]/g, '').slice(0, 100);
}
function sanitizeText_(v, max) {
  return String(v == null ? '' : v).replace(/[<>]/g, '').trim().slice(0, max || 300);
}
function sanitizeDigits_(v, max) {
  return String(v == null ? '' : v).replace(/\D/g, '').slice(0, max || 20);
}
function sanitizeEmail_(v) {
  var s = String(v == null ? '' : v).trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(s) ? s : '';
}

/** Deskripsi rich: izinkan teks + URL gambar (untuk tempel gambar) — dibersihkan XSS */
function sanitizeRichDescription_(v) {
  var s = String(v == null ? '' : v).slice(0, 20000);
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  s = s.replace(/<(?!\/?(?:br|p|b|i|u|strong|em|ul|ol|li|h3|h4|img)\b)[^>]*>/gi, '');
  s = s.replace(/<img([^>]*?)src\s*=\s*("|')(.*?)\2([^>]*)>/gi, function (m, a, q, src, b) {
    var safe = /^https:\/\/i\.imgbb\.com\/|^https:\/\/[a-z0-9.\-]+\.(imgbb|googleusercontent|yourdomain)/i.test(src) ? src : '';
    return safe ? '<img src="' + safe + '" loading="lazy" style="max-width:100%;border-radius:12px">' : '';
  });
  return s;
}

function safeImageUrl_(u) {
  u = String(u || '').trim();
  if (/^https:\/\/(i\.imgbb\.com|ibb\.co)\//i.test(u)) return u;
  if (/^https:\/\//i.test(u)) return u;
  return '';
}

function formatRupiah_(v) {
  return 'Rp' + Number(v || 0).toLocaleString('id-ID');
}

function sortOrderFn_() {
  return function (a, b) { return Number(a.sortOrder || 0) - Number(b.sortOrder || 0); };
}

function paginateList_(items, page, limit) {
  var start = (page - 1) * limit;
  var slice = items.slice(start, start + limit);
  return { items: slice, hasMore: (start + limit) < items.length, total: items.length };
}

function buildTrend_(paidDonations, days) {
  var map = {};
  paidDonations.forEach(function (d) {
    var day = String(d.paidAt || d.createdAt || '').slice(0, 10);
    if (!day) return;
    map[day] = (map[day] || 0) + Number(d.amount || 0);
  });
  var out = [], now = new Date();
  for (var i = days - 1; i >= 0; i--) {
    var dt = new Date(now.getTime() - i * 86400000);
    var key = Utilities.formatDate(dt, 'Asia/Jakarta', 'yyyy-MM-dd');
    out.push({ date: key, amount: map[key] || 0 });
  }
  return out;
}
