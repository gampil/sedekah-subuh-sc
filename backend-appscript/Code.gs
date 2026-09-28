/**
 * ============================================================================
 * SEDEKAH SUBUH HARAMAIN — BACKEND GOOGLE APPS SCRIPT (v4.0 — Tanpa Payment Gateway)
 * ============================================================================
 * Arsitektur baru (frontend statis di-chunk dengan Node.js, tanpa server PHP):
 *   Frontend  ->  Apps Script Web App (file ini)  ->  Firebase Realtime Database
 *                                            ->  Gmail (invoice & notifikasi)
 *                                            ->  ImgBB (upload gambar)
 *                                            ->  Telegram Bot (approval donasi)
 *
 * CARA PAKAI:
 * 1. Buka https://script.google.com , buat project baru, tempel semua file
 *    backend-appscript/*.gs ini (Code.gs, Handlers.gs, Services.gs).
 * 2. Isi Script Properties (File > Project properties > Script properties):
 *      FIREBASE_DB_URL       : https://sedekah-003-default-rtdb.firebaseio.com
 *      FIREBASE_AUTH_TOKEN   : token akses jangka panjang / Custom Token generator
 *                              (untuk produksi pakai SERVICE_ACCOUNT_EMAIL +
 *                               PRIVATE_KEY — makeFirebaseToken() membuat JWT)
 *      SERVICE_ACCOUNT_EMAIL : sedekah-backend@sedekah-003.iam.gserviceaccount.com
 *      PRIVATE_KEY           : -----BEGIN PRIVATE KEY----- ... (satu baris, \n asli)
 *      ADMIN_EMAILS          : admin@sedekahsubuhharamain.com,gampilmedia@gmail.com,sedekahsubuhb@gmail.com
 *      IMGBB_API_KEY         : kunci API imgbb kamu
 *      TELEGRAM_BOT_TOKEN    : 123456:ABC... (dari @BotFather)
 *      TELEGRAM_ADMIN_CHAT_ID: -100xxxxxxxxxx (grup admin) atau user id admin
 *      WEB_APP_TOKEN         : string acak panjang (shared secret dgn frontend)
 *      SITE_URL              : https://sedekahsubuhharamain.com
 * 3. Jalankan setupAwal() sekali dari editor (Run) untuk mengisi settings default.
 * 4. Deploy -> New deployment -> Web app -> Execute as: Me, Who has access: Anyone.
 * 5. Salin URL /exec ke assets/js/config.js kolom `gasUrl`.
 * 6. Jalankan pasangWebhookTelegram() sekali setelah deploy.
 *
 * STATUS DONASI (tanpa payment gateway):
 *   pending_payment -> donatur submit form, menunggu transfer manual
 *   awaiting_review -> bukti transfer diunggah, menunggu approval (web/telegram)
 *   paid            -> disetujui admin -> INVOICE otomatis dikirim ke email donatur
 *   rejected        -> bukti ditolak, donatur boleh unggah ulang
 *   cancelled       -> dibatalkan
 * ============================================================================
 */

var VERSION = '4.0.0-no-gateway';

function PROP_(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

function doGet(e) { return handleRequest_(e); }
function doPost(e) { return handleRequest_(e); }

/** Router utama */
function handleRequest_(e) {
  var params = parseParams_(e);
  var action = String(params.action || 'bootstrap');

  // Webhook Telegram masuk langsung ke handler telegram (diverifikasi secret)
  if (action === 'telegramWebhook') {
    try { return json_({ ok: true, handled: handleTelegramUpdate_(params.body) }); }
    catch (err) { return json_({ ok: false, error: { message: String(err) } }, 500); }
  }

  var guard = verifySharedSecret_(params);
  if (!guard.ok) return json_({ ok: false, error: { message: guard.error } }, 401);

  try {
    switch (action) {
      /* ---------- PUBLIC ---------- */
      case 'bootstrap':           return json_(publicBootstrap_());
      case 'publicDonations':     return json_(apiPublicDonations_(params));
      case 'donationStatus':      return json_(apiDonationStatus_(params));
      case 'createDonation':      return json_(apiCreateDonation_(params));
      case 'submitTransferProof': return json_(apiSubmitProof_(params));
      case 'aamiin':              return json_(apiAamiin_(params));
      case 'health':              return json_({ ok: true, version: VERSION, time: new Date().toISOString() });

      /* ---------- ADMIN (token Google JWT divalidasi) ---------- */
      default:
        if (action.indexOf('admin') === 0) {
          var who = verifyAdminToken_(params.adminToken);
          if (!who.ok) return json_({ ok: false, error: { message: who.error } }, 403);
          return json_(routeAdmin_(action, params));
        }
        return json_({ ok: false, error: { message: 'Aksi tidak tersedia.' } }, 404);
    }
  } catch (err) {
    Logger.log('ERROR %s: %s', action, err && err.stack || err);
    return json_({ ok: false, error: { message: 'Layanan sedang sibuk, coba lagi sebentar.' } }, 500);
  }
}

/* ============================ BOOTSTRAP PUBLIK =============================
 * DIOPTIMALKAN: hanya membaca node yang dibutuhkan halaman publik (per-node,
 * bukan seluruh pohon DB), plus cache 60 detik via CacheService.
 * PERBAIKAN STRUKTUR LEMOT: list donatur publik dibaca dari node ringkas
 * `publicFeed` (denormalisasi saat donasi menjadi `paid`).
 */
function publicBootstrap_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('bootstrap_v4');
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }

  var settings = rtdbRead_('settings') || {};
  var programs = toList_(rtdbRead_('programs'))
    .filter(function (p) { return p.status === 'published'; })
    .map(function (p) {
      // TANPA TARGET: diganti keterangan "masih mengumpulkan sampai saat ini"
      delete p.goal;
      p.deadline = null; // batas waktu berjalan terus, tanpa tanggal akhir
      p.raisedLabel = 'Masih mengumpulkan hingga saat ini';
      return p;
    })
    .sort(function (a, b) {
      var fa = (a.featured === true || String(a.featured) === 'true') ? 1 : 0;
      var fb = (b.featured === true || String(b.featured) === 'true') ? 1 : 0;
      if (fb !== fa) return fb - fa;
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });

  var packages = toList_(rtdbRead_('packages')).filter(function (x) { return x.active !== false; }).sort(sortOrderFn_());
  var banks = toList_(rtdbRead_('banks')).filter(function (x) { return x.active !== false; }).sort(sortOrderFn_());
  var gallery = toList_(rtdbRead_('gallery')).filter(function (x) { return x.status === 'published'; }).sort(sortOrderFn_());
  var updates = toList_(rtdbRead_('updates')).filter(function (x) { return x.status === 'published'; })
    .sort(function (a, b) { return String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')); })
    .slice(0, 30);

  var paid = publicDonationsRead_();
  var stats = {
    totalCollected: paid.reduce(function (s, d) { return s + Number(d.amount || 0); }, 0),
    donorCount: paid.length,
    activePrograms: programs.length,
    pendingDonations: countByStatus_('awaiting_review') + countByStatus_('pending_payment')
  };

  var result = {
    ok: true,
    settings: settings,
    programs: programs,
    packages: packages,
    banks: banks,
    gallery: gallery,
    updates: updates,
    stats: stats,
    trend: buildTrend_(paid, 14),
    donations: paginateList_(paid, 1, 50),
    serverVersion: VERSION
  };
  try { cache.put('bootstrap_v4', JSON.stringify(result), 60); } catch (tooBig) {}
  return result;
}

/* ============================ FEED PUBLIK (DONATUR/DOA) ====================
 * Hanya doa dengan publishPrayer=true & status paid yang masuk feed.
 * Data pribadi (email/phone/nama asli utk anonim) TIDAK ditulis ke publicFeed.
 */
function publicDonationsRead_() {
  var cached = CacheService.getScriptCache().get('publicFeed_v4');
  if (cached) { try { return JSON.parse(cached); } catch (e) {} }
  var feed = rtdbRead_('publicFeed') || {};
  var list = toList_(feed).sort(function (a, b) {
    return String(b.paidAt || '').localeCompare(String(a.paidAt || ''));
  });
  try { CacheService.getScriptCache().put('publicFeed_v4', JSON.stringify(list.slice(0, 300)), 60); } catch (e) {}
  return list;
}

function addToPublicFeed_(donation) {
  var item = {
    id: donation.id,
    name: donation.anonymous ? 'Hamba Allah' : (donation.name || 'Hamba Allah'),
    amount: donation.amount,
    programId: donation.programId,
    programSlug: donation.programSlug,
    programTitle: donation.programTitle,
    packageName: donation.packageName || '',
    prayer: donation.publishPrayer ? (donation.prayer || '') : '',
    publishPrayer: !!donation.publishPrayer,
    aamiinCount: Number(donation.aamiinCount || 0),
    paidAt: donation.paidAt || new Date().toISOString(),
    createdAt: donation.createdAt
  };
  // Feed privat: hanya doa yang diizinkan tampil publik
  if (item.publishPrayer && item.prayer) {
    rtdbWrite_('publicFeed/' + item.id, item);
  }
  invalidateCache_();
  return item;
}

function apiPublicDonations_(params) {
  var page = Math.max(1, parseInt(params.page || 1, 10));
  var limit = Math.min(100, Math.max(1, parseInt(params.limit || 50, 10)));
  var programId = String(params.programId || '');
  var items = publicDonationsRead_().filter(function (d) {
    return !programId || d.programId === programId || d.programSlug === programId ||
           (params.programSlug && d.programSlug === params.programSlug);
  });
  return { ok: true, data: paginateList_(items, page, limit) };
}

function apiDonationStatus_(params) {
  var id = sanitizeId_(params.id);
  if (!id) throw new Error('ID transaksi wajib diisi.');
  var d = rtdbRead_('donations/' + encodeURIComponent(id));
  if (!d) return { ok: true, data: { id: id, status: 'unknown' } };
  // Sensor data pribadi: respons publik hanya field non-sensitif
  return { ok: true, data: {
    id: id, status: d.status, amount: d.amount, programTitle: d.programTitle,
    packageName: d.packageName || '', paymentMethod: d.paymentMethod,
    proofStatus: d.proofStatus || '', bank: d.bank || null,
    instructions: d.instructions || '', createdAt: d.createdAt, paidAt: d.paidAt || ''
  }};
}

/* ============================ CREATE DONATION ==============================
 * Tanpa payment gateway: status awal pending_payment + instruksi transfer manual.
 */
function apiCreateDonation_(params) {
  var p = params.payload || {};
  var settings = rtdbRead_('settings') || {};
  var minimum = Number(settings.minimumDonation || 10000);
  var amount = Math.round(Number(p.amount || 0));
  var name = sanitizeText_(p.name, 80);
  var phone = sanitizeDigits_(p.phone, 15);
  var email = sanitizeEmail_(p.email);
  var prayer = sanitizeText_(p.prayer, 500);

  if (!email) throw new Error('Email valid wajib diisi agar invoice terkirim.');
  if (!/^62\d{8,13}$/.test(phone)) throw new Error('Nomor WhatsApp belum valid.');
  if (amount < minimum) throw new Error('Nominal minimal ' + formatRupiah_(minimum));
  if (amount > 100000000) throw new Error('Nominal maksimal Rp100.000.000.');

  var program = findProgramByIdOrSlug_(p.programId || p.programSlug);
  if (!program) throw new Error('Program tidak ditemukan.');

  var pkg = p.packageId ? findById_('packages', p.packageId) : null;
  if (p.packageId && !pkg) throw new Error('Paket tidak ditemukan.');
  var qty = pkg ? Math.max(1, Math.min(999, Math.round(Number(p.quantity || 1)))) : 0;
  if (pkg) amount = Math.round(Number(pkg.price || 0)) * qty;

  var bank = (p.bankAccountId && findById_('banks', p.bankAccountId)) || firstActiveBank_();
  if (!bank) throw new Error('Rekening tujuan belum dikonfigurasi. Hubungi admin.');

  var lk = LockService.getScriptLock();
  lk.waitLock(8000);
  var id, donation, now;
  try {
    var existing = p.idempotencyKey ? findDonationByIdem_(String(p.idempotencyKey)) : null;
    if (existing) {
      return { ok: true, data: { id: existing.id, reused: true, amount: existing.amount, bank: existing.bank, instructions: existing.instructions, createdAt: existing.createdAt } };
    }
    id = generateInvoiceId_();
    now = new Date().toISOString();
    donation = {
      id: id,
      status: 'pending_payment',
      paymentMethod: 'manual_bank',
      amount: amount,
      programId: program.id, programSlug: program.slug, programTitle: program.title,
      packageId: pkg ? pkg.id : '', packageName: pkg ? pkg.name : '', quantity: qty,
      name: p.anonymous ? 'Hamba Allah' : (name || 'Hamba Allah'),
      realName: name, phone: phone, email: email,
      prayer: prayer,
      publishPrayer: p.publishPrayer === true || String(p.publishPrayer) === 'true',
      anonymous: p.anonymous === true || String(p.anonymous) === 'true',
      bank: { bankName: bank.bankName, accountNumber: bank.accountNumber, accountHolder: bank.accountHolder },
      instructions: String(settings.manualPaymentInstructions || bank.instructions || ''),
      idempotencyKey: String(p.idempotencyKey || ''),
      consentAccepted: !!p.consentAccepted,
      consentVersion: String(p.consentVersion || '1.0'),
      createdAt: now, updatedAt: now,
      aamiinCount: 0
    };
    rtdbWrite_('donations/' + id, donation);
  } finally { lk.releaseLock(); }

  notifyAdminsNewDonation_(donation); // email webmail + telegram
  return { ok: true, data: { id: id, amount: amount, bank: donation.bank, instructions: donation.instructions, createdAt: now } };
}

/* ============================ BUKTI TRANSFER =============================== */
function apiSubmitProof_(params) {
  var p = params.payload || {};
  var id = sanitizeId_(p.id);
  var d = rtdbRead_('donations/' + encodeURIComponent(id));
  if (!d) throw new Error('Transaksi tidak ditemukan.');
  if (['pending_payment', 'awaiting_review', 'rejected'].indexOf(d.status) < 0)
    throw new Error('Status transaksi tidak memungkinkan unggah bukti.');
  if (!String(p.dataUrl || '').match(/^data:image\/(png|jpeg|webp);base64,/i))
    throw new Error('Format bukti tidak valid.');

  var uploaded = uploadImageToImgbb_(p.dataUrl, 'bukti-' + id);
  var now = new Date().toISOString();
  rtdbUpdate_('donations/' + encodeURIComponent(id), {
    status: 'awaiting_review',
    proofStatus: 'submitted',
    proofUrl: uploaded.url,
    proofUploadedAt: now,
    updatedAt: now
  });
  d.proofUrl = uploaded.url; d.status = 'awaiting_review';
  notifyTelegramApprovalNeeded_(d); // tombol Setujui/Tolak inline di Telegram
  sendMailSafe_(d.email, 'Bukti transfer diterima — ' + d.id,
    renderProofReceivedEmail_(d));
  return { ok: true, data: { id: id, proofStatus: 'submitted' } };
}

/* ============================== AAMIIN ===================================== */
function apiAamiin_(params) {
  var p = params.payload || {};
  var id = sanitizeId_(p.donationId);
  var token = sanitizeId_(p.token) || ('web-' + Date.now());
  var lk = LockService.getScriptLock(); lk.waitLock(5000);
  try {
    var path = 'donations/' + encodeURIComponent(id);
    var taken = rtdbRead_(path + '/aamiinTokens/' + encodeURIComponent(token));
    var count = Number(rtdbRead_(path + '/aamiinCount') || 0);
    if (!taken) {
      count += 1;
      rtdbWrite_(path + '/aamiinCount', count);
      rtdbWrite_(path + '/aamiinTokens/' + encodeURIComponent(token), 1);
      var feedItem = rtdbRead_('publicFeed/' + encodeURIComponent(id) + '/aamiinCount');
      if (feedItem != null) rtdbWrite_('publicFeed/' + encodeURIComponent(id) + '/aamiinCount', count);
    }
    return { ok: true, data: { aamiinCount: count, added: !taken } };
  } finally { lk.releaseLock(); }
}

/* ============================ SETUP AWAL =================================== */
function setupAwal() {
  var settings = rtdbRead_('settings') || {};
  var defaults = {
    siteName: 'SEDEKAH SUBUH HARAMAIN',
    organizationName: 'Sedekah Subuh Haramain',
    supportEmail: PROP_('ADMIN_EMAILS').split(',')[0] || 'admin@sedekahsubuhharamain.com',
    supportWhatsApp: '6281234567890',
    heroTitle: 'Sedekah mudah, dampaknya terasa.',
    heroDescription: 'Salurkan kebaikan untuk program yang terverifikasi. Proses ringkas, laporan transparan.',
    galleryTitle: 'Jejak Kebaikan',
    minimumDonation: 10000,
    manualBankEnabled: true,
    qrisEnabled: false, // payment gateway disingkirkan
    showDonorNames: true,
    consentVersion: '1.0',
    manualPaymentInstructions: 'Transfer sesuai nominal, kirim bukti transfer melalui halaman detail transaksi. Invoice resmi dikirim ke email setelah verifikasi admin.'
  };
  var merged = Object.assign({}, defaults, settings);
  merged.qrisEnabled = false;
  rtdbWrite_('settings', merged);
  Logger.log('Settings default tersimpan. Site: ' + merged.siteName);
}
