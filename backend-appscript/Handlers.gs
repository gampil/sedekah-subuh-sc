/**
 * Handlers.gs — Admin actions, Telegram bot approval, email invoice.
 * Bagian dari backend Apps Script Sedekah Subuh Haramain v4.0 (tanpa gateway).
 */

/* ============================ ROUTER ADMIN ================================= */
function routeAdmin_(action, params) {
  var p = params.payload || {};
  switch (action) {
    case 'adminDashboard':            return { ok: true, data: adminDashboard_() };
    case 'adminSaveProgram':          return { ok: true, data: adminSaveEntity_('programs', p.program, 'program') };
    case 'adminDeleteProgram':        return { ok: true, data: adminDeleteEntity_('programs', sanitizeId_(p.id)) };
    case 'adminSaveUpdate':           return { ok: true, data: adminSaveEntity_('updates', p.update, 'pembaruan') };
    case 'adminDeleteUpdate':         return { ok: true, data: adminDeleteEntity_('updates', sanitizeId_(p.id)) };
    case 'adminSaveGallery':          return { ok: true, data: adminSaveEntity_('gallery', p.item, 'galeri') };
    case 'adminDeleteGallery':        return { ok: true, data: adminDeleteEntity_('gallery', sanitizeId_(p.id)) };
    case 'adminSaveBank':             return { ok: true, data: adminSaveEntity_('banks', p.bank, 'rekening') };
    case 'adminDeleteBank':           return { ok: true, data: adminDeleteEntity_('banks', sanitizeId_(p.id)) };
    case 'adminSavePackage':          return { ok: true, data: adminSaveEntity_('packages', p.package, 'paket') };
    case 'adminDeletePackage':        return { ok: true, data: adminDeleteEntity_('packages', sanitizeId_(p.id)) };
    case 'adminSaveSettings':         return { ok: true, data: adminSaveSettings_(p.settings || {}) };
    case 'adminUploadImage':          return { ok: true, data: adminUploadImage_(p.dataUrl, p.name) };
    case 'adminSetDonationStatus':    return { ok: true, data: adminSetDonationStatus_(sanitizeId_(p.id), String(p.status || '')) };
    case 'adminReviewTransferProof':  return { ok: true, data: adminReviewProof_(sanitizeId_(p.id), String(p.decision || '')) };
    case 'adminGetTransferProof':     return { ok: true, data: adminGetTransferProof_(sanitizeId_(p.id)) };
    case 'adminExportDonations':      return { ok: true, data: { donations: toList_(rtdbRead_('donations')) } };
    case 'adminRecalculateTotals':    return { ok: true, data: adminRecalculateTotals_() };
    default: throw new Error('Aksi admin tidak tersedia: ' + action);
  }
}

/* ============================== DASHBOARD ================================== */
function adminDashboard_() {
  var programsRaw = rtdbRead_('programs') || {};
  var donations = toList_(rtdbRead_('donations') || {});
  var paid = donations.filter(function (d) { return d.status === 'paid'; });

  // Perbarui collected tiap program dari donasi paid (in-memory, hemat tulis)
  var programList = toList_(programsRaw).map(function (item) {
    item.collected = paid.reduce(function (s, d) {
      return s + (d.programId === item.id ? Number(d.amount || 0) : 0);
    }, 0);
    item.donorCount = paid.filter(function (d) { return d.programId === item.id; }).length;
    delete item.goal;
    item.raisedLabel = 'Masih mengumpulkan hingga saat ini';
    return item;
  });

  var stats = {
    totalCollected: paid.reduce(function (s, d) { return s + Number(d.amount || 0); }, 0),
    donorCount: paid.length,
    activePrograms: programList.filter(function (x) { return x.status === 'published'; }).length,
    pendingDonations: donations.filter(function (d) { return ['pending_payment', 'awaiting_review'].indexOf(d.status) >= 0; }).length
  };

  return {
    ok: true,
    stats: stats,
    trend: buildTrend_(paid, 14),
    programs: programList.sort(sortOrderFn_()),
    donations: donations.sort(function (a, b) {
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    }).slice(0, 200),
    packages: toList_(rtdbRead_('packages') || {}),
    gallery: toList_(rtdbRead_('gallery') || {}),
    updates: toList_(rtdbRead_('updates') || {}),
    banks: toList_(rtdbRead_('banks') || {}),
    settings: rtdbRead_('settings') || {}
  };
}

function adminRecalculateTotals_() {
  invalidateCache_();
  return { recalculatedAt: new Date().toISOString() };
}

/* ========================= CRUD ENTITAS CONTENT ============================ */
var ENTITY_FIELDS_ = {
  programs: ['title','slug','excerpt','description','imageUrl','organization','location','status','featured','sortOrder','createdAt'],
  updates:  ['programId','title','content','publishedAt','status','createdAt'],
  gallery:  ['programId','title','caption','imageUrl','status','sortOrder','createdAt'],
  banks:    ['bankName','accountNumber','accountHolder','instructions','active','sortOrder','createdAt'],
  packages: ['programId','name','description','price','imageUrl','active','sortOrder','createdAt']
};

/* Simpan entitas TANPA memuat ulang seluruh dashboard (hemat ~1-3 detik). */
function saveEntityCore_(node, input, label) {
  if (!input || typeof input !== 'object') throw new Error('Data ' + label + ' kosong.');
  var current = toList_(rtdbRead_(node) || {});
  var id = sanitizeId_(input.id) || generateKey_();

  // Bersihkan field & tipe
  var clean = {};
  (ENTITY_FIELDS_[node] || []).forEach(function (k) {
    if (input[k] === undefined) return;
    clean[k] = input[k];
  });
  if (clean.title != null) clean.title = sanitizeText_(clean.title, 160);
  if (clean.description != null) clean.description = sanitizeRichDescription_(clean.description);
  if (clean.content != null) clean.content = sanitizeRichDescription_(clean.content);
  if (clean.caption != null) clean.caption = sanitizeText_(clean.caption, 300);
  if (clean.excerpt != null) clean.excerpt = sanitizeText_(clean.excerpt, 300);
  if (clean.imageUrl) clean.imageUrl = safeImageUrl_(clean.imageUrl);
  if (node === 'programs') { // target & deadline disingkirkan
    delete clean.goal; delete clean.deadline;
    clean.raisedLabel = 'Masih mengumpulkan hingga saat ini';
    if (!clean.slug) clean.slug = slugify_(clean.title || id);
  }
  clean.updatedAt = new Date().toISOString();
  if (!clean.createdAt) clean.createdAt = clean.updatedAt;

  // Validasi wajib per node
  if (node === 'programs' && !clean.title) throw new Error('Judul program wajib diisi.');
  if (node === 'gallery' && !clean.imageUrl) throw new Error('Gambar galeri wajib diunggah.');
  if (node === 'banks' && (!clean.bankName || !clean.accountNumber)) throw new Error('Nama bank & nomor rekening wajib diisi.');
  if (node === 'packages' && (!clean.name || !clean.price)) throw new Error('Nama & harga paket wajib diisi.');

  rtdbWrite_(node + '/' + id, Object.assign({}, findInList_(current, id) || {}, clean, { id: id }));
  invalidateCache_();
  return id;
}

function adminSaveEntity_(node, input, label) {
  var id = saveEntityCore_(node, input, label);
  return { ok: true, id: id };
}

function adminDeleteEntity_(node, id) {
  if (!id) throw new Error('ID tidak valid.');
  rtdbDelete_(node + '/' + id);
  if (node === 'programs') {
    // bersihkan juga updates/gallery terkait? biarkan sebagai arsip — cukup feed
  }
  invalidateCache_();
  return { ok: true, id: id };
}

function adminSaveSettings_(input) {
  var allowedKeys = ['siteName','organizationName','supportEmail','supportWhatsApp','address','heroTitle','heroDescription','galleryTitle','minimumDonation','manualBankEnabled','showDonorNames','consentVersion','manualPaymentInstructions','logoUrl'];
  var current = rtdbRead_('settings') || {};
  var next = Object.assign({}, current);
  allowedKeys.forEach(function (k) {
    if (input[k] === undefined) return;
    next[k] = input[k];
  });
  next.qrisEnabled = false; // payment gateway dimatikan permanentsampai fitur kembali
  next.minimumDonation = Math.max(1000, Math.round(Number(next.minimumDonation || 10000)));
  if (next.logoUrl) next.logoUrl = safeImageUrl_(next.logoUrl);
  rtdbWrite_('settings', next);
  invalidateCache_();
  return { ok: true };
}

/* ============================ UPLOAD GAMBAR IMGBB ========================== */
function adminUploadImage_(dataUrl, name) {
  var up = uploadImageToImgbb_(dataUrl, name || ('admin-' + generateKey_()));
  return { url: up.url, deleteUrl: up.deleteUrl };
}

/* ======================= KEPUTUSAN DONASI & APPROVAL ======================= */
var DONATION_STATUSES_ = ['pending_payment', 'awaiting_review', 'paid', 'rejected', 'cancelled'];

/** Status lama ala gateway dipetakan ke skema v4 agar kompatibel. */
function normalizeDonationStatus_(status) {
  var map = {
    pending: 'pending_payment', awaiting_transfer: 'pending_payment', creating: 'pending_payment',
    gateway_error: 'rejected', expired: 'cancelled'
  };
  return map[status] || status;
}

function setDonationStatus_(id, status) {
  if (DONATION_STATUSES_.indexOf(status) < 0) throw new Error('Status tidak dikenal.');
  var d = rtdbRead_('donations/' + encodeURIComponent(id));
  if (!d) throw new Error('Transaksi tidak ditemukan.');
  var prev = d.status;
  if (status === prev) return { ok: true, id: id, status: status, unchanged: true };

  var patch = { status: status, updatedAt: new Date().toISOString() };
  if (status === 'paid') {
    patch.paidAt = new Date().toISOString();
    patch.approvedBy = 'admin-web';
    patch.proofStatus = d.proofStatus === 'submitted' ? 'approved' : (d.proofStatus || '');
  }
  if (status === 'rejected') patch.proofStatus = 'rejected';
  rtdbUpdate_('donations/' + encodeURIComponent(id), patch);

  var fresh = rtdbRead_('donations/' + encodeURIComponent(id));
  afterStatusChange_(fresh, prev);
  return { ok: true, id: id, status: status };
}

function adminSetDonationStatus_(id, status) {
  var result = setDonationStatus_(id, normalizeDonationStatus_(String(status || '')));
  result.dashboard = adminDashboard_();
  return result;
}

function adminReviewProof_(id, decision) {
  var d = rtdbRead_('donations/' + encodeURIComponent(id));
  if (!d) throw new Error('Transaksi tidak ditemukan.');
  if (decision === 'approve') return setDonationStatus_(id, 'paid');
  if (decision === 'reject') {
    rtdbUpdate_('donations/' + encodeURIComponent(id), {
      status: 'rejected', proofStatus: 'rejected', updatedAt: new Date().toISOString()
    });
    var fresh = rtdbRead_('donations/' + encodeURIComponent(id));
    sendMailSafe_(fresh.email, 'Bukti transfer ditolak — ' + fresh.id, renderProofRejectedEmail_(fresh));
    notifyTelegramSimple_('❌ Bukti ' + fresh.id + ' DITOLAK via web admin.');
    invalidateCache_();
    return { ok: true, id: id, status: 'rejected' };
  }
  throw new Error('Keputusan tidak valid.');
}

/** Efek samping setelah perubahan status: feed publik + invoice email + telegram */
function afterStatusChange_(donation, prevStatus) {
  invalidateCache_();
  if (donation.status === 'paid' && prevStatus !== 'paid') {
    addToPublicFeed_(donation);
    // FITUR UTAMA: invoice pembayaran dikirim ke email donatur saat di-approve
    try {
      var html = renderInvoiceEmail_(donation);
      MailApp.sendEmail({
        to: donation.email,
        subject: 'Invoice Donasi ' + donation.id + ' — ' + (donation.programTitle || 'Sedekah'),
        htmlBody: html,
        name: PROP_('SITE_NAME') || 'Sedekah Subuh Haramain'
      });
      rtdbUpdate_('donations/' + encodeURIComponent(donation.id), { invoiceSentAt: new Date().toISOString() });
    } catch (mailErr) {
      Logger.log('Gagal kirim invoice %s: %s', donation.id, mailErr);
      notifyTelegramSimple_('⚠️ Invoice ' + donation.id + ' gagal terkirim: ' + mailErr);
    }
    notifyTelegramSimple_('✅ Donasi ' + donation.id + (' (' + formatRupiah_(donation.amount) + ')') + ' sudah PAID & invoice terkirim ke ' + donation.email);
  } else if (donation.status !== 'paid') {
    // hapus dari feed publik bila status mundur
    try { rtdbDelete_('publicFeed/' + encodeURIComponent(donation.id)); } catch (e) {}
  }
}

function adminGetTransferProof_(id) {
  var d = rtdbRead_('donations/' + encodeURIComponent(id));
  if (!d || !d.proofUrl) throw new Error('Bukti transfer tidak ada.');
  // Kembalikan URL imgbb (frontend menampilkan dalam dialog preview)
  return { dataUrl: d.proofUrl, url: d.proofUrl, uploadedAt: d.proofUploadedAt || '' };
}

/* ============================ TELEGRAM BOT ================================= */
/**
 * Kirim pesan ke chat admin dengan tombol inline (Setujui / Tolak / Detail).
 */
function notifyTelegramApprovalNeeded_(donation) {
  var token = PROP_('TELEGRAM_BOT_TOKEN'), chatId = PROP_('TELEGRAM_ADMIN_CHAT_ID');
  if (!token || !chatId) return;
  var text = '🧾 *BUKTI TRANSFER BARU — PERLU APPROVAL*\n\n' +
    '🆔 Invoice: `' + donation.id + '`\n' +
    '👤 Nama: ' + escapeTg_(donation.realName || donation.name || '-') + '\n' +
    '📱 WA: ' + (donation.phone || '-') + '\n' +
    '✉️ Email: ' + (donation.email || '-') + '\n' +
    '💰 Nominal: *' + formatRupiah_(donation.amount) + '*\n' +
    '🕌 Program: ' + escapeTg_(donation.programTitle || '-') + '\n' +
    (donation.packageName ? '📦 Paket: ' + escapeTg_(donation.packageName) + ' ×' + donation.quantity + '\n' : '') +
    '🏦 Transfer ke: ' + escapeTg_((donation.bank && (donation.bank.bankName + ' ' + donation.bank.accountNumber + ' a.n. ' + donation.bank.accountHolder)) || '-') + '\n\n' +
    '🖼 Bukti: ' + (donation.proofUrl || '(tidak ada)') + '\n\n' +
    'Tekan tombol untuk memutuskan:';
  var kb = {
    inline_keyboard: [[
      { text: '✅ Setujui', callback_data: 'APPROVE:' + donation.id },
      { text: '❌ Tolak', callback_data: 'REJECT:' + donation.id }
    ], [
      { text: '🔍 Lihat Detail', url: (PROP_('SITE_URL') || 'https://sedekahsubuhharamain.com') + '/detail/?id=' + encodeURIComponent(donation.id) }
    ]]
  };
  tgApi_('sendMessage', { chat_id: chatId, text: text, parse_mode: 'Markdown', reply_markup: JSON.stringify(kb) });
}

function notifyAdminsNewDonation_(donation) {
  // Notifikasi ke email admin (webmail Gmail) + pesan telegram tanpa tombol
  var subject = 'Donasi baru ' + donation.id + ' — ' + formatRupiah_(donation.amount);
  var admins = (PROP_('ADMIN_EMAILS') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  if (admins.length) {
    try {
      MailApp.sendEmail({
        to: admins.join(','),
        subject: subject,
        htmlBody: renderAdminNewDonationEmail_(donation)
      });
    } catch (e) { Logger.log('Email admin gagal: ' + e); }
  }
  notifyTelegramSimple_(
    '🆕 *DONASI BARU (belum bayar)*\n' +
    '🆔 `' + donation.id + '`\n💰 ' + formatRupiah_(donation.amount) +
    '\n👤 ' + escapeTg_(donation.realName || donation.name) + '\n🕌 ' + escapeTg_(donation.programTitle) +
    '\nStatus: menunggu transfer donatur.'
  );
}

function notifyTelegramSimple_(text) {
  var token = PROP_('TELEGRAM_BOT_TOKEN'), chatId = PROP_('TELEGRAM_ADMIN_CHAT_ID');
  if (!token || !chatId) return;
  tgApi_('sendMessage', { chat_id: chatId, text: text, parse_mode: 'Markdown' });
}

/**
 * Menangani update webhook Telegram (callback_query approval & perintah admin).
 * HANYA admin (TELEGRAM_ADMIN_CHAT_ID / ADMIN_USER_IDS) yang boleh approve.
 */
function handleTelegramUpdate_(body) {
  var update = typeof body === 'string' ? JSON.parse(body) : (body || {});
  var cb = update.callback_query;
  var msg = update.message;

  if (cb && cb.data) {
    var fromId = String(cb.from && cb.from.id || '');
    var parts = String(cb.data).split(':');
    var command = parts[0], id = parts.slice(1).join(':');
    var isAdmin = isTelegramAdmin_(fromId, cb.message && cb.message.chat && cb.message.chat.id);
    var answerText = '';
    if (!isAdmin) {
      answerText = 'Anda bukan admin terdaftar.';
    } else if (command === 'APPROVE' || command === 'REJECT') {
      try {
        adminReviewProof_(id, command === 'APPROVE' ? 'approve' : 'reject');
        answerText = command === 'APPROVE' ? 'Disetujui ✅ invoice terkirim.' : 'Ditolak ❌';
        tgApi_('editMessageReplyMarkup', {
          chat_id: cb.message.chat.id, message_id: cb.message.message_id, reply_markup: '{}'
        });
        tgApi_('sendMessage', {
          chat_id: cb.message.chat.id,
          text: (command === 'APPROVE' ? '✅ ' : '❌ ') + 'Invoice `' + id + '` ' +
                (command === 'APPROVE' ? 'disetujui. Invoice email terkirim ke donatur.' : 'ditolak.')
        });
      } catch (err) { answerText = 'Gagal: ' + err; }
    } else if (command === 'PENDING') {
      var pendings = toList_(rtdbRead_('donations') || {}).filter(function (d) { return d.status === 'awaiting_review'; }).slice(0, 10);
      answerText = pendings.length + ' menunggu review';
      for (var i = 0; i < pendings.length; i++) {
        notifyTelegramApprovalNeeded_(pendings[i]);
      }
    } else {
      answerText = 'Perintah tidak dikenal.';
    }
    tgApi_('answerCallbackQuery', { callback_query_id: cb.id, text: answerText });
    return { type: 'callback', handled: true };
  }

  if (msg && msg.text) {
    var uid = String(msg.from && msg.from.id || '');
    if (!isTelegramAdmin_(uid, msg.chat && msg.chat.id)) return { type: 'message', ignored: 'not-admin' };
    var t = msg.text.trim().toLowerCase();
    if (t === '/start' || t === '/help') {
      tgReply_(msg.chat.id, 'Bot approval Sedekah Subuh Haramain.\n/pending — daftar bukti menunggu review\n/latest — 5 donasi terakhir');
    } else if (t === '/pending') {
      var list = toList_(rtdbRead_('donations') || {}).filter(function (d) { return d.status === 'awaiting_review'; }).slice(0, 10);
      if (!list.length) { tgReply_(msg.chat.id, 'Tidak ada bukti menunggu review.'); }
      else list.forEach(notifyTelegramApprovalNeeded_);
    } else if (t === '/latest') {
      var latest = toList_(rtdbRead_('donations') || {}).sort(function (a, b) {
        return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      }).slice(0, 5);
      tgReply_(msg.chat.id, latest.map(function (d) {
        return d.id + ' · ' + formatRupiah_(d.amount) + ' · ' + d.status;
      }).join('\n') || 'Belum ada donasi.');
    }
    return { type: 'message', handled: true };
  }
  return { type: 'unknown' };
}

function isTelegramAdmin_(userId, chatId) {
  var admins = (PROP_('TELEGRAM_ADMIN_CHAT_ID') || '') + ',' + (PROP_('TELEGRAM_ADMIN_USER_IDS') || '');
  var ids = admins.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  return ids.indexOf(String(userId)) >= 0 || ids.indexOf(String(chatId)) >= 0;
}

function tgReply_(chatId, text) {
  tgApi_('sendMessage', { chat_id: chatId, text: text });
}

/** Pasang webhook Telegram -> Web App /exec?action=telegramWebhook&secret=... */
function pasangWebhookTelegram() {
  var token = PROP_('TELEGRAM_BOT_TOKEN');
  var secret = PROP_('WEB_APP_TOKEN');
  var scriptId = ScriptService ? '' : ''; // placeholder
  var execUrl = ScriptApp.getService().getUrl();
  var url = execUrl + '?action=telegramWebhook&secret=' + encodeURIComponent(secret);
  var res = tgRaw_('https://api.telegram.org/bot' + token + '/setWebhook', {
    url: url, secret_token: secret, drop_pending_updates: false
  });
  Logger.log(JSON.stringify(res));
  return res;
}

function syncTelegramWebhook() { pasangWebhookTelegram(); } // cron opsional

/* ================================ EMAIL ==================================== */
function sendMailSafe_(to, subject, html) {
  if (!to) return;
  try {
    MailApp.sendEmail({ to: to, subject: subject, htmlBody: html, name: 'Sedekah Subuh Haramain' });
  } catch (e) { Logger.log('Email gagal (' + to + '): ' + e); }
}

/** Invoice resmi HTML — dikirim ke email donatur saat admin menyetujui. */
function renderInvoiceEmail_(d) {
  var site = PROP_('SITE_URL') || 'https://sedekahsubuhharamain.com';
  var org = 'Sedekah Subuh Haramain';
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  return '<div style="font-family:Segoe UI,Arial,sans-serif;background:#f0f9ff;padding:24px">' +
    '<div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">' +
    '<div style="background:#0c4a6e;color:#fff;padding:24px 28px">' +
      '<h2 style="margin:0">INVOICE SEDekAH — ' + esc(d.id) + '</h2>' +
      '<p style="margin:6px 0 0;opacity:.85">' + esc(org) + '</p>' +
    '</div>' +
    '<div style="padding:24px 28px;color:#0f172a">' +
      '<p>Assalamu\'alaikum wr. wb. <strong>' + esc(d.anonymous ? 'Hamba Allah' : d.realName) + '</strong>,</p>' +
      '<p>Terima kasih, sedekah Anda telah <strong>terverifikasi dan diterima</strong>. Berikut invoice resminya:</p>' +
      '<table width="100%" cellpadding="8" style="border-collapse:collapse;font-size:14px">' +
        row_('Nomor Invoice', d.id) +
        row_('Tanggal', Utilities.formatDate(new Date(d.paidAt || d.createdAt), 'Asia/Jakarta', 'dd MMMM yyyy HH:mm')) +
        row_('Program', d.programTitle) +
        (d.packageName ? row_('Paket', d.packageName + ' × ' + d.quantity) : '') +
        row_('Metode', 'Transfer Bank ' + (d.bank ? d.bank.bankName + ' ' + d.bank.accountNumber + ' a.n. ' + d.bank.accountHolder : '')) +
        row_('Nominal', '<strong style="color:#0c4a6e">' + formatRupiah_(d.amount) + '</strong>') +
        row_('Status', '<span style="background:#dcfce7;color:#166534;padding:2px 10px;border-radius:999px;font-weight:bold">LUNAS / TERVERIFIKASI</span>') +
      '</table>' +
      '<p style="margin-top:20px">Jazakumullahu khairan. Doa terbaik menyertai Anda. Pemanfaatan dana dapat dipantau pada halaman program di situs kami.</p>' +
      '<p><a href="' + site + '/detail/?id=' + encodeURIComponent(d.id) + '" style="background:#0ea5e9;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:bold">Lihat detail donasi</a></p>' +
      '<p style="color:#64748b;font-size:12px">Invoice ini adalah bukti transaksi sah. Simpan untuk keperluan dokumentasi. — ' + esc(org) + '</p>' +
    '</div></div></div>';

  function row_(k, v) {
    return '<tr style="border-bottom:1px solid #f1f5f9"><td style="color:#64748b;width:40%">' + esc(k) + '</td><td>' + esc(v) + '</td></tr>';
  }
}

function renderProofReceivedEmail_(d) {
  return '<p>Bukti transfer untuk invoice <strong>' + d.id + '</strong> sudah kami terima dan sedang diverifikasi admin.</p>' +
    '<p>Nominal: ' + formatRupiah_(d.amount) + ' — ' + (d.programTitle || '') + '</p>' +
    '<p>Invoice resmi akan dikirim ke email ini setelah verifikasi.</p>';
}

function renderProofRejectedEmail_(d) {
  return '<p>Maaf, bukti transfer untuk invoice <strong>' + d.id + '</strong> belum dapat diterima.</p>' +
    '<p>Silakan unggah bukti baru melalui halaman detail transaksi: ' +
    (PROP_('SITE_URL') || '') + '/detail/?id=' + encodeURIComponent(d.id) + '</p>';
}

function renderAdminNewDonationEmail_(d) {
  return '<h3>Donasi baru menunggu transfer</h3><ul>' +
    '<li>ID: ' + d.id + '</li><li>Atas nama: ' + (d.realName || d.name) + '</li>' +
    '<li>Nominal: ' + formatRupiah_(d.amount) + '</li><li>Program: ' + d.programTitle + '</li>' +
    '<li>Email: ' + d.email + '</li><li>WA: ' + d.phone + '</li></ul>';
}
