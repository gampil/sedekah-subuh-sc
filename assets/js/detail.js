(function () {
  "use strict";
  var UI = window.SedekahUI;
  var API = window.SedekahAPI;
  var Transactions = window.SedekahTransaction;
  var currentId = "";
  var bankNumber = "";
  var pollTimer = null;
  var lookupRunning = false;
  var terminalStatuses = ["paid", "failed", "expired", "cancelled", "gateway_error"];

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

  function showError(message) {
    UI.setText("#status-error", message);
    UI.$("#status-error").classList.remove("hidden");
    UI.$("#status-result").classList.add("hidden");
  }

  function safeCheckout(value) {
    try {
      var url = new URL(value);
      if (url.protocol === "https:" && (url.hostname === "cashi.id" || url.hostname.endsWith(".cashi.id"))) return url.href;
    } catch (error) {}
    return "";
  }

  function safeQrImage(value) {
    if (typeof value !== "string" || !value || value.length > 350000) return "";
    if (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(value)) return value;
    try {
      var url = new URL(value);
      if (url.protocol === "https:" && !url.username && !url.password) return url.href;
    } catch (error) {}
    return "";
  }

  function render(data) {
    if (!data || !data.id) return showError("Detail transaksi belum tersedia. Buka kembali dari formulir sedekah atau periksa ID di halaman Cek Donasi.");
    var method = data.paymentMethod;
    var status = data.status;
    var manual = method === "manual_bank";
    var submitted = data.proofStatus === "submitted";
    var waiting = status === "pending" || status === "awaiting_transfer" || status === "creating";
    var title = status === "paid" ? "Pembayaran selesai" :
      status === "expired" || status === "cancelled" || status === "failed" ? "Transaksi tidak aktif" :
      submitted ? "Bukti transfer terkirim" : manual ? "Selesaikan transfer" : "Selesaikan pembayaran QRIS";
    var message = status === "paid" ? "Terima kasih. Pembayaran Anda telah dikonfirmasi." :
      !waiting ? "Periksa status untuk informasi pembayaran terbaru." :
      submitted ? "Admin akan memeriksa bukti transfer sebelum pembayaran dinyatakan berhasil." :
      manual ? "Gunakan rekening tujuan berikut, lalu kirim bukti transfer Anda." :
      "Pindai QRIS di bawah menggunakan aplikasi pembayaran Anda.";
    if (!data.verifiedStatus && waiting && !submitted) message += " Status terbaru dapat diperiksa melalui tombol Cek status pembayaran.";

    UI.setText("#status-title", title);
    UI.setText("#status-message", message);
    UI.setText("#status-id", data.id);
    UI.setText("#status-program", data.programTitle || data.programSlug || "—");
    UI.setText("#status-amount", data.amount == null ? "—" : UI.formatRupiah(data.amount));
    UI.setText("#status-date", UI.formatDate(data.createdAt, true));
    UI.setText("#payment-method-label", manual ? "Transfer rekening" : method === "qris" ? "QRIS" : "Metode belum tersedia");
    UI.$("#check-status-link").href = "/status/?id=" + encodeURIComponent(data.id);

    var link = UI.$("#status-pay-link");
    var checkout = safeCheckout(data.paymentUrl);
    var qrImage = safeQrImage(data.qrImageUrl);
    var image = UI.$("#qris-image");
    image.classList.toggle("hidden", !qrImage || !waiting || method !== "qris");
    image.removeAttribute("src");
    if (qrImage && waiting && method === "qris") image.src = qrImage;
    link.classList.toggle("hidden", !!qrImage || !checkout || !waiting || method !== "qris");
    link.removeAttribute("href");
    if (!qrImage && checkout && waiting && method === "qris") link.href = checkout;
    UI.$("#qris-action").classList.toggle("hidden", method !== "qris" || !waiting);
    UI.setText("#qris-action p", qrImage ? "Pindai kode ini dari aplikasi pembayaran. Pastikan nominal sesuai sebelum membayar." : checkout ? "Gambar QRIS belum dikirim oleh Cashi. Buka pembayaran untuk melihat kode QRIS." : "Gambar QRIS belum tersedia. Coba muat ulang detail atau hubungi admin dengan ID transaksi Anda.");

    var bank = data.bank || null;
    var showBank = manual && waiting && !!bank;
    UI.$("#manual-bank-detail").classList.toggle("hidden", !showBank);
    UI.$("#transfer-proof").classList.add("hidden");
    UI.$("#confirm-transfer").setAttribute("aria-expanded", "false");
    UI.$("#confirm-transfer").classList.toggle("hidden", !showBank || submitted);
    UI.$("#proof-received").classList.toggle("hidden", !showBank || !submitted);
    bankNumber = "";
    if (showBank) {
      bankNumber = String(bank.accountNumber || "");
      UI.setText("#bank-name", bank.bankName || "—");
      UI.setText("#bank-number", bankNumber || "—");
      UI.setText("#bank-holder", bank.accountHolder || "—");
      UI.$("#bank-copy").disabled = !bankNumber;
      var instructions = String(data.instructions || bank.instructions || "").trim();
      UI.setText("#bank-instructions", instructions);
      UI.$("#bank-instructions").classList.toggle("hidden", !instructions);
    }
    if (manual && waiting && !bank) UI.setText("#status-message", "Rekening tujuan belum tersedia. Hubungi admin dengan ID transaksi Anda.");
    if (manual && waiting && data.proofStatus === "rejected") UI.setText("#status-message", "Bukti sebelumnya belum disetujui. Periksa transfer Anda dan kirim bukti baru.");
    UI.$("#status-error").classList.add("hidden");
    UI.$("#status-result").classList.remove("hidden");
  }

  async function lookup(id, silent) {
    if (!id) return showError("ID transaksi tidak ada. Silakan buka kembali detail dari formulir sedekah.");
    currentId = id.trim();
    if (lookupRunning) return;
    lookupRunning = true;
    if (!silent) UI.$("#status-loading").classList.remove("hidden");
    UI.$("#status-error").classList.add("hidden");
    var renderedData = null;
    try {
      var saved = Transactions.load(currentId);
      var response;
      try { response = await API.getDonationStatus(currentId); }
      catch (error) { if (!saved) throw error; }
      var detail = Transactions.normalize(response, currentId, saved);
      if (!detail.paymentMethod && !detail.programTitle && detail.amount == null) {
        showError("Detail transaksi belum tersedia untuk ID ini. Coba kembali dari formulir sedekah atau hubungi admin.");
        return;
      }
      if (detail.verifiedStatus) Transactions.save(detail);
      render(detail);
      renderedData = detail;
    } catch (error) { if (!silent) showError(error.message || "Detail transaksi belum dapat dimuat."); }
    finally {
      lookupRunning = false;
      if (!silent) UI.$("#status-loading").classList.add("hidden");
      schedulePolling(renderedData);
    }
  }

  function uploadProof(event) {
    event.preventDefault();
    var file = UI.$("#proof-file").files[0];
    var button = UI.$("#proof-submit");
    var progress = UI.$("#proof-progress");
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 5000000) {
      UI.toast("Gunakan PNG, JPG, atau WebP maksimal 5 MB.", "error"); return;
    }
    button.disabled = true;
    button.textContent = "Mengirim bukti…";
    var reader = new FileReader();
    reader.onload = async function () {
      try {
        progress.textContent = "Mengunggah bukti…";
        await API.submitTransferProof({ id: currentId, dataUrl: reader.result });
        var saved = Transactions.load(currentId);
        if (saved) { saved.proofStatus = "submitted"; Transactions.save(saved); }
        UI.$("#proof-file").value = "";
        UI.toast("Bukti diterima dan menunggu pemeriksaan admin.", "success");
        await lookup(currentId);
      } catch (error) { UI.toast(error.message, "error"); }
      finally { button.disabled = false; button.textContent = "Kirim bukti transfer"; progress.textContent = ""; }
    };
    reader.onerror = function () { button.disabled = false; button.textContent = "Kirim bukti transfer"; progress.textContent = ""; UI.toast("Bukti tidak dapat dibaca.", "error"); };
    reader.readAsDataURL(file);
  }

  async function copyText(value, message) {
    if (!value) return;
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(value);
      else {
        var input = document.createElement("textarea");
        input.value = value;
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        var success = document.execCommand("copy");
        input.remove();
        if (!success) throw new Error("Gagal menyalin.");
      }
      UI.toast(message, "success");
    } catch (error) { UI.toast("Salin secara manual: " + value, "error"); }
  }

  function init() {
    var id = new URLSearchParams(location.search).get("id") || "";
    UI.$("#status-refresh").addEventListener("click", function () { lookup(currentId); });
    UI.$("#status-copy-id").addEventListener("click", function () { copyText(currentId, "ID transaksi disalin."); });
    UI.$("#bank-copy").addEventListener("click", function () { copyText(bankNumber, "Nomor rekening disalin."); });
    UI.$("#confirm-transfer").addEventListener("click", function () {
      var proof = UI.$("#transfer-proof");
      proof.classList.remove("hidden");
      this.setAttribute("aria-expanded", "true");
      proof.scrollIntoView({ behavior: "smooth", block: "center" });
      UI.$("#proof-file").focus({ preventScroll: true });
    });
    UI.$("#transfer-proof-form").addEventListener("submit", uploadProof);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && currentId) lookup(currentId, true);
    });
    lookup(id);
  }
  document.addEventListener("DOMContentLoaded", init);
})();
