/*
 * config.js — SATU-SATUNYA file yang perlu Anda isi.
 * Backend baru: Google Apps Script Web App (lihat folder backend-appscript/).
 * Payment gateway lama (PHP/Cashi) sudah disingkirkan — tidak ada file PHP lagi.
 *
 * CARA ISI:
 * 1. Deploy backend-appscript/*.gs sebagai Web App (Execute as: Me, Access: Anyone).
 * 2. Tempel URL /exec ke `gasUrl` di bawah.
 * 3. (Opsional tapi sangat disarankan untuk kecepatan) isi `firebaseDatabaseUrl`
 *    supaya data publik dibaca browser LANGSUNG dari RTDB tanpa lewat Apps Script.
 *    Contoh: "https://sedekah-003-default-rtdb.firebaseio.com"
 *    → nyalakan aturan baca publik di firebase/database.rules.json (sudah disiapkan).
 */
window.SEDEKAH_CONFIG = Object.freeze({
  // URL Web App Google Apps Script (wajib) — harus diawali https://
  gasUrl: "https://script.google.com/macros/s/AKfycbz-GANTI-DENGAN-URL-EXEC-ANDAA/exec",

  // Kosongkan bila ingin SEMUA data lewat Apps Script; isi URL RTDB untuk mode tercepat.
  firebaseDatabaseUrl: "",

  googleClientId: "761180083609-kmtsicrjeasdi1auojqcndqsj8bq6ucl.apps.googleusercontent.com",
  siteName: "SEDEKAH SUBUH HARAMAIN",
  siteUrl: window.location.origin && window.location.origin !== "null" ? window.location.origin : "https://sedekahsubuhharamain.com",
  logoUrl: "/assets/images/logo-sedekah-subuh-haramain.png",
  supportWhatsApp: "6281234567890",
  supportEmail: "sedekahsubuhharamain@gmail.com",
  demoMode: false,
  cacheTtlMs: 15000,
  requestTimeoutMs: 15000,
  uploadTimeoutMs: 60000
});
