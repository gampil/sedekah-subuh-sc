(function () {
  "use strict";
  /* Form donasi — TANPA payment gateway. Donatur submit → invoice dibuat
   * (status pending_payment) → transfer manual → unggah bukti → approval admin
   * via web/Telegram → invoice resmi dikirim ke email donatur. */

  var UI = window.SedekahUI,
      API = window.SedekahAPI,
      program = null,
      ricePackage = null,
      settings = {},
      attemptKey = "",
      banks = [];

  function randomKey() {
    return window.crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : "idem-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function phone(value) {
    var d = String(value || "").replace(/\D/g, "");
    return d.indexOf("0") === 0 ? "62" + d.slice(1) : d;
  }

  function amount() {
    return ricePackage
      ? Number(ricePackage.price) * Math.max(1, Math.round(Number(UI.$("#quantity").value || 1)))
      : Math.round(Number(UI.$("#amount").value || 0));
  }

  function updateTotal() {
    UI.setText("#summary-total", UI.formatRupiah(amount()));
    var submit = UI.$("#submit-donation");
    if (submit && !submit.disabled) UI.setText("#submit-donation", "Lanjut Sedekah " + (amount() > 0 ? UI.formatRupiah(amount()) : ""));
  }

  function selectNominal(button) {
    var custom = button.getAttribute("data-amount") === "other";
    UI.$("#nominal-grid").querySelectorAll(".nominal-card").forEach(function (card) {
      card.setAttribute("aria-pressed", String(card === button));
    });
    UI.$("#amount").classList.toggle("hidden", !custom);
    UI.$("#amount-custom-label").classList.toggle("hidden", !custom);
    UI.$("#amount").value = custom ? "" : button.getAttribute("data-amount");
    if (custom) UI.$("#amount").focus();
    updateTotal();
  }

  function error(id, msg) {
    var el = UI.$("#" + id + "-error");
    if (el) el.textContent = msg || "";
    return !msg;
  }

  function validate() {
    var ok = true,
        a = amount(),
        minimum = Number(settings.minimumDonation || 10000),
        anonymous = UI.$("#anonymous").checked;

    ok = error("amount", a < minimum ? "Minimal " + UI.formatRupiah(minimum) + "." : a > 100000000 ? "Maksimal Rp100.000.000." : "") && ok;
    ok = error("name", !anonymous && UI.$("#name").value.trim().length < 2 ? "Nama minimal 2 karakter." : "") && ok;
    ok = error("phone", !/^62\d{8,13}$/.test(phone(UI.$("#phone").value)) ? "Nomor WhatsApp belum valid." : "") && ok;
    ok = error("email", !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(UI.$("#email").value.trim()) ? "Masukkan email yang valid agar invoice terkirim." : "") && ok;
    UI.$("#terms-error").textContent = UI.$("#terms").checked ? "" : "Persetujuan diperlukan.";
    return ok && UI.$("#terms").checked;
  }

  async function submit(event) {
    event.preventDefault();
    if (!program || !validate()) return;

    var button = UI.$("#submit-donation"), original = button.textContent;
    button.disabled = true;
    button.classList.add("is-loading");
    button.textContent = "Membuat invoice…";

    var payload = {
      programId: program.id,
      programSlug: program.slug,
      packageId: ricePackage ? ricePackage.id : "",
      quantity: ricePackage ? Math.max(1, Math.round(Number(UI.$("#quantity").value || 1))) : 0,
      amount: amount(),
      name: UI.$("#name").value.trim(),
      phone: phone(UI.$("#phone").value),
      email: UI.$("#email").value.trim(),
      prayer: UI.$("#prayer").value.trim(),
      publishPrayer: UI.$("#publishPrayer").checked,
      anonymous: UI.$("#anonymous").checked,
      paymentMethod: "manual_bank",
      bankAccountId: UI.$("#bankAccountId") ? UI.$("#bankAccountId").value : "",
      idempotencyKey: attemptKey,
      consentAccepted: true,
      consentVersion: String(settings.consentVersion || "1.0")
    };

    try {
      var result = await API.createDonation(payload);
      if (!result || !result.id) throw new Error("ID transaksi tidak tersedia.");
      var selectedBank = banks.find(function (bank) { return String(bank.id) === String(payload.bankAccountId); }) || result.bank || null;
      window.SedekahTransaction.save({
        id: result.id,
        status: "pending_payment",
        paymentMethod: "manual_bank",
        bank: selectedBank,
        amount: result.amount == null ? payload.amount : result.amount,
        instructions: result.instructions || "",
        programTitle: ricePackage ? ricePackage.name : program.title,
        createdAt: result.createdAt || new Date().toISOString()
      });
      try { sessionStorage.setItem("lastDonationId", result.id); } catch (storageError) {}
      location.assign("/detail/?id=" + encodeURIComponent(result.id));
    } catch (e) {
      UI.toast(e.message, "error");
      button.disabled = false;
      button.classList.remove("is-loading");
      button.textContent = original;
    }
  }

  document.addEventListener("DOMContentLoaded", async function () {
    // Manfaatkan prefetch bootstrap dari api.js supaya form tampil seketika.
    var boot = window.SedekahPrefetch ? await window.SedekahPrefetch.take() : await API.getBootstrap();
    try {
      if (!boot) throw new Error("Backend belum dikonfigurasi. Isi gasUrl di assets/js/config.js.");
      settings = boot.settings || {};
      UI.applySettings(settings);

      var params = new URLSearchParams(location.search),
          packageId = params.get("package") || "",
          slug = params.get("program") || "";

      ricePackage = packageId ? (boot.packages || []).find(function (p) { return p.id === packageId; }) : null;
      if (packageId && !ricePackage) throw new Error("Paket nasi tidak ditemukan.");

      program = ricePackage
        ? (boot.programs || []).find(function (p) { return p.id === ricePackage.programId; })
        : (boot.programs || []).find(function (p) { return p.slug === slug; }) || (boot.programs || [])[0];

      if (!program) throw new Error("Program tidak ditemukan.");

      attemptKey = randomKey();

      UI.setText("#donation-program-title", ricePackage ? ricePackage.name : program.title);
      UI.setText("#summary-program-title", ricePackage ? ricePackage.name : program.title);
      UI.setText("#summary-program-org", program.organization || "SEDEKAH SUBUH HARAMAIN");
      UI.$("#summary-image").src = UI.safeUrl((ricePackage && ricePackage.imageUrl) || program.imageUrl, "/assets/img/hero-charity.webp");

      if (ricePackage) {
        UI.$("#package-summary").textContent = ricePackage.description + " — " + UI.formatRupiah(ricePackage.price) + " per paket";
        UI.$("#package-summary").classList.remove("hidden");
        UI.$("#quantity-wrap").classList.remove("hidden");
        UI.$("#amount-wrap").classList.add("hidden");
      }

      banks = boot.banks || [];
      if (!banks.length) throw new Error("Rekening tujuan belum dikonfigurasi. Hubungi admin.");

      var select = UI.$("#bankAccountId");
      banks.forEach(function (b, i) {
        select.appendChild(UI.el("option", {
          value: b.id,
          text: b.bankName + " — " + b.accountNumber + " a.n. " + b.accountHolder,
          selected: i === 0 ? "selected" : null
        }));
      });

      UI.$("#quantity") && UI.$("#quantity").addEventListener("input", updateTotal);
      UI.$("#amount") && UI.$("#amount").addEventListener("input", updateTotal);
      var grid = UI.$("#nominal-grid");
      if (grid) grid.querySelectorAll(".nominal-card").forEach(function (card) {
        card.addEventListener("click", function () { selectNominal(card); });
      });
      UI.$("#anonymous").addEventListener("change", function (e) { UI.$("#name").disabled = e.target.checked; });
      UI.$("#donation-form").addEventListener("submit", submit);

      updateTotal();
    } catch (e) {
      var form = UI.$("#donation-form"), err = UI.$("#donation-error");
      if (form) form.classList.add("hidden");
      if (err) { err.classList.remove("hidden"); UI.setText("#donation-error-message", e.message); }
    }
  });
})();
