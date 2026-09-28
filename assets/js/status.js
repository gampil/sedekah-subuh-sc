(function () {
  "use strict";
  var UI = window.SedekahUI;
  var API = window.SedekahAPI;
  var Transactions = window.SedekahTransaction;
  var currentId = "";
  var pollTimer = null;
  var lookupRunning = false;
  var terminalStatuses = ["paid", "failed", "expired", "cancelled", "gateway_error"];
  var labels = {
    paid: ["Pembayaran berhasil", "Terima kasih. Pembayaran sedekah Anda sudah terkonfirmasi."],
    pending: ["Menunggu pembayaran QRIS", "Selesaikan pembayaran melalui halaman detail transaksi."],
    awaiting_transfer: ["Menunggu transfer", "Transfer ke rekening tujuan dan kirim bukti melalui halaman detail transaksi."],
    creating: ["Pembayaran sedang disiapkan", "Coba perbarui status beberapa saat lagi."],
    gateway_error: ["Pembayaran belum tersedia", "Hubungi admin dengan ID transaksi Anda."],
    cancelled: ["Transaksi dibatalkan", "Transaksi ini sudah dibatalkan."],
    failed: ["Pembayaran gagal", "Silakan buat transaksi baru."],
    expired: ["Pembayaran kedaluwarsa", "Silakan buat transaksi baru."]
  };
  // Endpoint donasi publik hanya berisi transaksi berstatus paid di Apps Script.
  // Gunakan kecocokan ID persis sebagai verifikasi tambahan saat endpoint status
  // lama mengembalikan detail tanpa field status.
  async function confirmPaidFromPublicList(id, detail) {
    for (var page = 1; page <= 4; page += 1) {
      var result = await API.getPublicDonations(page, 50);
      var items = result && Array.isArray(result.items) ? result.items : [];
      var paid = items.find(function (item) { return item && String(item.id) === String(id); });
      if (paid) {
        if (detail.amount != null && Number(detail.amount) !== Number(paid.amount)) return detail;
        return Object.assign({}, detail, {
          status: "paid",
          verifiedStatus: true,
          amount: paid.amount,
          programTitle: paid.programTitle || detail.programTitle,
          paidAt: paid.paidAt || ""
        });
      }
      if (!result || !result.hasMore || items.length === 0) break;
    }
    return detail;
  }
  function stopPolling() {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
  }
  function schedulePolling(data) {
    stopPolling();
    if (!currentId || (data && data.verifiedStatus && terminalStatuses.includes(data.status))) return;
    pollTimer = setTimeout(function () {
      if (document.visibilityState === "visible") lookup(currentId, true);
      else schedulePolling(data);
    }, 10000);
  }
  function render(data) {
    var verified = data.verifiedStatus;
    var status = data.status;
    var copy = verified ? (labels[status] || ["Status pembayaran", "Perbarui status untuk memperoleh informasi terbaru."]) :
      ["Respons status belum lengkap", "Server belum mengirim status transaksi untuk ID ini. Pastikan deployment Apps Script sudah diperbarui dan situs menggunakan URL deployment yang benar."];
    if (verified && status === "awaiting_transfer" && data.proofStatus === "submitted")
      copy = ["Menunggu verifikasi admin", "Bukti transfer sudah diterima dan sedang diperiksa admin."];
    if (verified && status === "awaiting_transfer" && data.proofStatus === "rejected")
      copy = ["Bukti perlu dikirim ulang", "Periksa transfer Anda lalu kirim bukti baru dari halaman detail transaksi."];
    UI.setText("#status-title", copy[0]);
    UI.setText("#status-message", copy[1]);
    UI.setText("#status-id", data.id);
    UI.setText("#status-program", data.programTitle || data.programSlug || "—");
    UI.setText("#status-amount", data.amount == null ? "—" : UI.formatRupiah(data.amount));
    var icon = UI.$("#status-icon");
    icon.className = "status-icon " + (verified && status === "paid" ? "success" : verified && ["failed", "expired", "gateway_error", "cancelled"].includes(status) ? "failed" : "");
    UI.clear(icon);
    icon.appendChild(UI.icon(verified && status === "paid" ? "check" : verified && ["failed", "expired", "gateway_error", "cancelled"].includes(status) ? "alert" : "clock", "icon-lg"));
    var badge = UI.$("#status-badge");
    UI.clear(badge);
    badge.appendChild(verified ? UI.statusBadge(status) : UI.el("span", { class: "badge badge-gray", text: "Belum terverifikasi" }));
    var showDetail = status === "pending" || status === "awaiting_transfer" || status === "creating";
    UI.$("#detail-link").classList.toggle("hidden", !showDetail);
    UI.$("#detail-link").href = "/detail/?id=" + encodeURIComponent(data.id);
    UI.$("#status-result").classList.remove("hidden");
    UI.$("#status-search").classList.add("hidden");
    UI.$("#status-error").classList.add("hidden");
  }
  async function lookup(id, silent) {
    currentId = String(id || "").trim();
    if (!currentId || lookupRunning) return;
    lookupRunning = true;
    if (!silent) UI.$("#status-loading").classList.remove("hidden");
    UI.$("#status-error").classList.add("hidden");
    var renderedData = null;
    try {
      var response = await API.getDonationStatus(currentId);
      var saved = Transactions.load(currentId);
      var data = Transactions.normalize(response, currentId, saved);
      if (!data.verifiedStatus) {
        try { data = await confirmPaidFromPublicList(currentId, data); }
        catch (verificationError) { /* Keep the unknown state if verification is unavailable. */ }
      }
      if (!data.verifiedStatus && !saved) throw new Error("Status transaksi belum tersedia untuk ID ini. Periksa kembali ID transaksi Anda.");
      if (data.verifiedStatus) Transactions.save(data);
      render(data);
      renderedData = data;
    } catch (error) {
      if (silent) return;
      UI.setText("#status-error", error.message || "Status belum dapat diperiksa. Coba lagi nanti.");
      UI.$("#status-error").classList.remove("hidden");
      UI.$("#status-result").classList.add("hidden");
      UI.$("#status-search").classList.remove("hidden");
    } finally {
      lookupRunning = false;
      if (!silent) UI.$("#status-loading").classList.add("hidden");
      schedulePolling(renderedData);
    }
  }
  function init() {
    var id = new URLSearchParams(location.search).get("id") || "";
    UI.$("#status-form").addEventListener("submit", function (event) {
      event.preventDefault();
      var value = UI.$("#transaction-id").value.trim();
      if (value) {
        history.replaceState({}, "", "/status/?id=" + encodeURIComponent(value));
        lookup(value);
      }
    });
    UI.$("#status-refresh").addEventListener("click", function () { lookup(currentId); });
    UI.$("#status-new-search").addEventListener("click", function () {
      stopPolling();
      currentId = "";
      UI.$("#status-result").classList.add("hidden");
      UI.$("#status-search").classList.remove("hidden");
      UI.$("#transaction-id").focus();
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && currentId) lookup(currentId, true);
    });
    if (id) { UI.$("#transaction-id").value = id; lookup(id); }
  }
  document.addEventListener("DOMContentLoaded", init);
})();
