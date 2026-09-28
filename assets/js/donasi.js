(function () {
  "use strict";

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
      ? Number(ricePackage.price) *
          Math.max(1, Math.round(Number(UI.$("#quantity").value || 1)))
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

    ok = error(
      "amount",
      a < minimum
        ? "Minimal " + UI.formatRupiah(minimum) + "."
        : a > 100000000
          ? "Maksimal Rp100.000.000."
          : ""
    ) && ok;

    ok = error(
      "name",
      !anonymous && UI.$("#name").value.trim().length < 2
        ? "Nama minimal 2 karakter."
        : ""
    ) && ok;

    ok = error(
      "phone",
      !/^62\d{8,13}$/.test(phone(UI.$("#phone").value))
        ? "Nomor WhatsApp belum valid."
        : ""
    ) && ok;

    var email = UI.$("#email").value.trim();

    ok = error(
      "email",
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ? "Masukkan email yang valid agar konfirmasi berhasil diterima."
        : ""
    ) && ok;

    UI.$("#terms-error").textContent = UI.$("#terms").checked
      ? ""
      : "Persetujuan diperlukan.";

    return ok && UI.$("#terms").checked;
  }

  function paymentChanged() {
    var method = document.querySelector(
      'input[name="paymentMethod"]:checked'
    ).value;

    UI.$("#bank-selector").classList.toggle(
      "hidden",
      method !== "manual_bank"
    );
  }

  async function submit(event) {
    event.preventDefault();

    if (!program || !validate()) return;

    var button = UI.$("#submit-donation"),
        original = button.textContent;

    button.disabled = true;
    button.textContent = "Menyiapkan transaksi…";

    var method = document.querySelector(
      'input[name="paymentMethod"]:checked'
    ).value;

    var payload = {
      programId: program.id,
      programSlug: program.slug,
      packageId: ricePackage ? ricePackage.id : "",
      quantity: ricePackage
        ? Math.max(1, Math.round(Number(UI.$("#quantity").value || 1)))
        : 0,
      amount: amount(),
      name: UI.$("#name").value.trim(),
      phone: phone(UI.$("#phone").value),
      email: UI.$("#email").value.trim(),
      prayer: UI.$("#prayer").value.trim(),
      publishPrayer: UI.$("#publishPrayer").checked,
      anonymous: UI.$("#anonymous").checked,
      paymentMethod: method,
      bankAccountId: UI.$("#bankAccountId").value,
      idempotencyKey: attemptKey,
      consentAccepted: true,
      consentVersion: String(settings.consentVersion || "1.0")
    };

    try {
      var result = await API.createDonation(payload);

      if (!result || !result.id) throw new Error("ID transaksi tidak tersedia.");
      var selectedBank = banks.find(function (bank) {
        return String(bank.id) === String(payload.bankAccountId);
      });
      window.SedekahTransaction.save({
        id: result.id,
        status: method === "manual_bank" ? "awaiting_transfer" : "pending",
        paymentMethod: method,
        paymentUrl: result.paymentUrl || "",
        qrImageUrl: result.qrImageUrl || "",
        bank: method === "manual_bank" ? (selectedBank || result.bank || null) : null,
        amount: result.amount == null ? payload.amount : result.amount,
        programTitle: ricePackage ? ricePackage.name : program.title,
        createdAt: result.createdAt || new Date().toISOString()
      });
      try { sessionStorage.setItem("lastDonationId", result.id); } catch (storageError) {}
      location.assign("/detail/?id=" + encodeURIComponent(result.id));
    } catch (e) {
      UI.toast(e.message, "error");
      button.disabled = false;
      button.textContent = original;
    }
  }

  document.addEventListener("DOMContentLoaded", async function () {
    try {
      var data = await API.getBootstrap();
      settings = data.settings || {};
      UI.applySettings(settings);

      var packageId = new URLSearchParams(location.search).get("package") || "",
          slug = new URLSearchParams(location.search).get("program") || "";

      ricePackage = packageId
        ? (data.packages || []).find(function (p) {
            return p.id === packageId;
          })
        : null;

      if (packageId && !ricePackage) {
        throw new Error("Paket nasi tidak ditemukan.");
      }

      program = ricePackage
        ? (data.programs || []).find(function (p) {
            return p.id === ricePackage.programId;
          })
        : (data.programs || []).find(function (p) {
            return p.slug === slug;
          });

      if (!program) {
        throw new Error("Program tidak ditemukan.");
      }

      attemptKey = randomKey();

      UI.setText(
        "#donation-program-title",
        ricePackage ? ricePackage.name : program.title
      );

      UI.setText(
        "#summary-program-title",
        ricePackage ? ricePackage.name : program.title
      );

      UI.setText(
        "#summary-program-org",
        program.organization || "SEDEKAH SUBUH HARAMAIN"
      );

      UI.$("#summary-image").src = UI.safeUrl(
        (ricePackage && ricePackage.imageUrl) || program.imageUrl,
        "/assets/img/hero-charity.webp"
      );

      if (ricePackage) {
        UI.$("#package-summary").textContent =
          ricePackage.description +
          " — " +
          UI.formatRupiah(ricePackage.price) +
          " per paket";

        UI.$("#package-summary").classList.remove("hidden");
        UI.$("#quantity-wrap").classList.remove("hidden");
        UI.$("#amount-wrap").classList.add("hidden");
      }

      var bankAvailable =
        !!settings.manualBankEnabled && !!(data.banks || []).length;

      UI.$("#qris-choice").classList.toggle(
        "hidden",
        !settings.qrisEnabled
      );

      UI.$("#bank-choice").classList.toggle(
        "hidden",
        !bankAvailable
      );

      if (!settings.qrisEnabled && bankAvailable) {
        UI.$("#bank-choice input").checked = true;
      }

      if (!settings.qrisEnabled && !bankAvailable) {
        throw new Error("Belum ada metode pembayaran aktif.");
      }

      banks = data.banks || [];
      var select = UI.$("#bankAccountId");

      (data.banks || []).forEach(function (b) {
        select.appendChild(
          UI.el("option", {
            value: b.id,
            text:
              b.bankName +
              " — " +
              b.accountNumber +
              " a.n. " +
              b.accountHolder
          })
        );
      });

      document
        .querySelectorAll('input[name="paymentMethod"]')
        .forEach(function (r) {
          r.addEventListener("change", paymentChanged);
        });

      UI.$("#quantity").addEventListener("input", updateTotal);
      UI.$("#amount").addEventListener("input", updateTotal);
      UI.$("#nominal-grid").querySelectorAll(".nominal-card").forEach(function (card) {
        card.addEventListener("click", function () { selectNominal(card); });
      });

      UI.$("#anonymous").addEventListener("change", function (e) {
        UI.$("#name").disabled = e.target.checked;
      });

      UI.$("#donation-form").addEventListener("submit", submit);

      paymentChanged();
      updateTotal();
    } catch (e) {
      UI.$("#donation-form").classList.add("hidden");
      UI.$("#donation-error").classList.remove("hidden");
      UI.setText("#donation-error-message", e.message);
    }
  });
})();
