(function () {
  "use strict";
  var prefix = "ssh_transaction_";
  var allowed = ["creating", "pending", "awaiting_transfer", "paid", "gateway_error", "cancelled", "failed", "expired"];
  function save(value) {
    if (!value || !value.id) return;
    try { sessionStorage.setItem(prefix + value.id, JSON.stringify(value)); } catch (error) {}
  }
  function load(id) {
    try { var value = JSON.parse(sessionStorage.getItem(prefix + id) || "null"); return value && String(value.id) === String(id) ? value : null; }
    catch (error) { return null; }
  }
  function normalize(response, id, saved) {
    var candidates = [response, response && response.donation, response && response.transaction, response && response.data,
      response && response.data && response.data.donation, response && response.data && response.data.transaction];
    var record = candidates.find(function (item) { return item && typeof item === "object" && allowed.includes(String(item.status || "").toLowerCase()); });
    var partial = candidates.find(function (item) { return item && typeof item === "object" && (item.paymentMethod || item.paymentUrl || item.qrImageUrl || item.amount != null); });
    // Do not combine data from a different transaction with the requested ID.
    if (record && record.id && String(record.id) !== String(id)) record = null;
    if (partial && partial.id && String(partial.id) !== String(id)) partial = null;
    var local = saved && String(saved.id) === String(id) ? saved : {};
    var merged = Object.assign({}, local, partial || {}, record || {}, { id: String(id) });
    merged.verifiedStatus = !!record;
    if (!merged.verifiedStatus) merged.status = merged.paymentMethod === "manual_bank" ? "awaiting_transfer" : "pending";
    return merged;
  }
  window.SedekahTransaction = { save: save, load: load, normalize: normalize };
})();
