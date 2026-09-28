/* timeago.js — label waktu relatif bahasa Indonesia ("1 menit yang lalu", "kemarin"). */
(function () {
  "use strict";
  function timeAgo(value) {
    if (!value) return "";
    var t = new Date(value).getTime();
    if (Number.isNaN(t)) return "";
    var diff = Math.max(0, Date.now() - t);
    var s = Math.floor(diff / 1000);
    if (s < 60) return s <= 10 ? "baru saja" : s + " detik yang lalu";
    var m = Math.floor(s / 60);
    if (m < 60) return m + " menit yang lalu";
    var h = Math.floor(m / 60);
    if (h < 24) return h + " jam yang lalu";
    var d = Math.floor(h / 24);
    if (d === 1) return "kemarin";
    if (d < 7) return d + " hari yang lalu";
    if (d < 31) return Math.floor(d / 7) + " minggu yang lalu";
    if (d < 365) return Math.floor(d / 30) + " bulan yang lalu";
    return Math.floor(d / 365) + " tahun yang lalu";
  }
  window.SedekahTimeAgo = timeAgo;
})();
