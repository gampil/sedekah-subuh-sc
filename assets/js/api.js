(function () {
  "use strict";
  /* ==========================================================================
   * api.js — Frontend statis (tanpa server Node saat runtime) ↔ Google Apps
   * Script Web App + Firebase RTDB. Payment gateway PHP lama sudah dibuang.
   *
   * Strategi loading CEPAT (bukan lazy loading):
   *  - SWR (stale-while-revalidate): render dari localStorage seketika, lalu
   *    disenyapkan dengan data segar di background.
   *  - Mode tercepat: browser membaca node publik RTDB LANGSUNG secara paralel,
   *    tanpa antrean eksekusi Apps Script yang lambat.
   *  - Semua tulis (buat donasi, bukti transfer, aamiin, admin) lewat Apps
   *    Script → Gmail invoice, ImgBB upload, Telegram approval.
   * ========================================================================== */
  var config = window.SEDEKAH_CONFIG || {};
  var CACHE_KEY = "ssh_public_v6";
  var GAS_URL = /^https:\/\/script\.google(user)?apis\.com\//i.test(String(config.gasUrl || "")) ? String(config.gasUrl) : "";
  var RTDB_RAW = String(config.firebaseDatabaseUrl || "").trim();
  var RTDB_URL = RTDB_RAW.indexOf("https://") === 0 ? RTDB_RAW.replace(/\/+$/, "") : "";

  function timeoutFetch(url, options, timeoutMs) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs || config.requestTimeoutMs || 15000);
    return fetch(url, Object.assign({ cache: "no-store" }, options || {}, { signal: controller.signal }))
      .catch(function (error) {
        if (error && error.name === "AbortError") throw new Error("Koneksi lambat, silakan coba lagi.");
        throw error;
      })
      .finally(function () { clearTimeout(timer); });
  }

  /* ---------- POST ke Apps Script ----------
   * Content-Type text/plain menghindari preflight CORS; GAS mengikuti
   * redirect 302 -> endpoint ContentService sehingga respons bisa dibaca. */
  function gasPost(body, timeoutMs) {
    if (!GAS_URL) return Promise.reject(new Error("gasUrl belum diisi di assets/js/config.js."));
    return timeoutFetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
      redirect: "follow"
    }, timeoutMs || config.requestTimeoutMs || 15000).then(function (response) {
      return response.text().then(function (text) {
        var result = null;
        try { result = JSON.parse(text); } catch (e) {
          if (/peningkatan trafik|Google Apps Script/i.test(text)) throw new Error("Server Google sedang sibuk, coba lagi sebentar…");
          throw new Error("Respons layanan tidak valid.");
        }
        if (!result || result.ok !== true) throw new Error((result && result.error && result.error.message) || "Permintaan gagal diproses.");
        return result;
      });
    });
  }

  function request(action, payload, token, method) {
    if (method === "GET") {
      if (!GAS_URL) return Promise.reject(new Error("gasUrl belum diisi di assets/js/config.js."));
      var url = GAS_URL + "?action=" + encodeURIComponent(action);
      Object.keys(payload || {}).forEach(function (key) {
        if (payload[key] !== undefined && payload[key] !== null) url += "&" + encodeURIComponent(key) + "=" + encodeURIComponent(String(payload[key]));
      });
      return timeoutFetch(url, { method: "GET" }).then(function (r) { return r.json(); }).then(function (result) {
        if (!result || result.ok !== true) throw new Error((result && result.error && result.error.message) || "Permintaan gagal diproses.");
        return result.data !== undefined ? result.data : result;
      });
    }
    var slow = action === "adminUploadImage" || action === "submitTransferProof";
    return gasPost({ action: action, payload: payload || {}, adminToken: token || "" }, slow ? (config.uploadTimeoutMs || 60000) : undefined)
      .then(function (result) { return result.data !== undefined ? result.data : result; });
  }

  /* ------------------------------ RTDB cepat ------------------------------ */
  function rtdbGet(path) {
    if (!RTDB_URL) return Promise.resolve(null);
    return timeoutFetch(RTDB_URL + "/" + path + ".json", { method: "GET" }, 12000)
      .then(function (r) { if (!r.ok) throw new Error("RTDB read gagal"); return r.json(); })
      .catch(function () { return null; });
  }

  function toList(obj) {
    if (!obj || typeof obj !== "object") return [];
    return Object.keys(obj).map(function (k) {
      var v = obj[k]; if (!v || typeof v !== "object") return null;
      v.id = v.id || k; return v;
    }).filter(Boolean);
  }

  function normalizeProgram(p) {
    delete p.goal;                 // target donasi disingkirkan
    p.deadline = null;             // batas waktu berjalan terus tanpa tanggal akhir
    p.raisedLabel = p.raisedLabel || "Masih mengumpulkan hingga saat ini";
    return p;
  }
  function sortOrder() { return function (a, b) { return Number(a.sortOrder || 0) - Number(b.sortOrder || 0); }; }

  function buildTrend(paid, days) {
    var map = {};
    paid.forEach(function (d) {
      var day = String(d.paidAt || d.createdAt || "").slice(0, 10);
      if (day) map[day] = (map[day] || 0) + Number(d.amount || 0);
    });
    var out = [], now = Date.now();
    for (var i = days - 1; i >= 0; i--) {
      var key = new Date(now - i * 86400000).toISOString().slice(0, 10);
      out.push({ date: key, amount: map[key] || 0 });
    }
    return out;
  }

  function assembleBootstrap(settings, programsRaw, packagesRaw, banksRaw, galleryRaw, updatesRaw, feedRaw) {
    var programs = toList(programsRaw).filter(function (p) { return p.status === "published"; }).map(normalizeProgram)
      .sort(function (a, b) {
        var fa = (a.featured === true || String(a.featured) === "true") ? 1 : 0;
        var fb = (b.featured === true || String(b.featured) === "true") ? 1 : 0;
        if (fb !== fa) return fb - fa;
        return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
      });
    var paid = toList(feedRaw).sort(function (a, b) { return String(b.paidAt || "").localeCompare(String(a.paidAt || "")); });
    var collectedByProgram = {};
    paid.forEach(function (d) {
      var key = d.programId || d.programSlug || "";
      collectedByProgram[key] = (collectedByProgram[key] || 0) + Number(d.amount || 0);
    });
    programs.forEach(function (p) {
      p.collected = collectedByProgram[p.id] || collectedByProgram[p.slug] || Number(p.collected || 0);
    });
    return {
      settings: settings || {},
      programs: programs,
      packages: toList(packagesRaw).filter(function (x) { return x.active !== false; }).sort(sortOrder()),
      banks: toList(banksRaw).filter(function (x) { return x.active !== false; }).sort(sortOrder()),
      gallery: toList(galleryRaw).filter(function (x) { return x.status === "published"; }).sort(sortOrder()),
      updates: toList(updatesRaw).filter(function (x) { return x.status === "published"; })
        .sort(function (a, b) { return String(b.publishedAt || "").localeCompare(String(a.publishedAt || "")); }).slice(0, 30),
      stats: {
        totalCollected: paid.reduce(function (s, d) { return s + Number(d.amount || 0); }, 0),
        donorCount: paid.length,
        activePrograms: programs.length,
        pendingDonations: 0
      },
      trend: buildTrend(paid, 30),
      donations: { items: paid.slice(0, 50), hasMore: paid.length > 50, total: paid.length },
      generatedAt: Date.now()
    };
  }

  /* ---------------------- Cache SWR (localStorage) ------------------------ */
  function readCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch (e) { return null; } }
  function writeCache(data) { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data: data })); } catch (e) {} }

  var inflight = null;
  function fetchFresh() {
    if (RTDB_URL) {
      return Promise.all([
        rtdbGet("settings"), rtdbGet("programs"), rtdbGet("packages"),
        rtdbGet("banks"), rtdbGet("gallery"), rtdbGet("updates"), rtdbGet("publicFeed")
      ]).then(function (results) {
        if (results[0] === null && results[1] === null) throw new Error("Firebase RTDB tidak dapat diakses.");
        return assembleBootstrap.apply(null, results);
      });
    }
    return request("bootstrap", {}, "", "GET").then(function (data) {
      (data.programs || []).forEach(normalizeProgram);
      if (!data.trend) data.trend = buildTrend((data.donations && data.donations.items) || [], 30);
      return data;
    });
  }

  function getBootstrap(force) {
    var cached = readCache();
    if (cached && cached.data && !force) {
      if (!inflight) {
        inflight = fetchFresh()
          .then(function (fresh) { writeCache(fresh); return fresh; })
          .catch(function () { return null; })
          .then(function (x) { inflight = null; return x; });
      }
      return Promise.resolve(cached.data);
    }
    if (!RTDB_URL && !GAS_URL) return Promise.reject(new Error("Konfigurasi backend belum diisi (assets/js/config.js)."));
    // RTDB gagal/blank -> fallback otomatis ke Apps Script bootstrap
    var chain = RTDB_URL
      ? fetchFresh().catch(function () { return request("bootstrap", {}, "", "GET").then(function (data) {
          (data.programs || []).forEach(normalizeProgram);
          if (!data.trend) data.trend = buildTrend((data.donations && data.donations.items) || [], 30);
          return data;
        }); })
      : fetchFresh();
    return chain.then(function (fresh) { writeCache(fresh); return fresh; });
  }

  function getProgram(slug) {
    return getBootstrap().then(function (data) {
      var program = (data.programs || []).find(function (p) { return p.slug === slug; });
      if (!program) return null;
      program.updates = (data.updates || []).filter(function (u) { return u.programId === program.id; });
      return { program: program, settings: data.settings || {} };
    });
  }

  function getPublicDonations(page, limit, programId) {
    page = page || 1; limit = limit || 50;
    if (RTDB_URL) {
      return rtdbGet("publicFeed").then(function (feed) {
        var items = toList(feed).sort(function (a, b) { return String(b.paidAt || "").localeCompare(String(a.paidAt || "")); })
          .filter(function (d) { return !programId || d.programId === programId || d.programSlug === programId; });
        var start = (page - 1) * limit;
        return { items: items.slice(start, start + limit), hasMore: (start + limit) < items.length, total: items.length };
      });
    }
    return request("publicDonations", { page: page, limit: limit, programId: programId || "" }, "", "GET");
  }

  window.SedekahAPI = {
    isConfigured: function () { return Boolean(GAS_URL || RTDB_URL); },
    isLocalPreview: function () { return location.protocol === "file:" || ["localhost", "127.0.0.1"].indexOf(location.hostname) >= 0; },
    getBootstrap: getBootstrap,
    getProgram: getProgram,
    getPublicDonations: getPublicDonations,
    getDonationStatus: function (id) { return request("donationStatus", { id: id }, "", "GET"); },
    createDonation: function (payload) { return gasPost({ action: "createDonation", payload: payload }); },
    submitTransferProof: function (payload) { return request("submitTransferProof", payload); },
    addAamiin: function (payload) { return request("aamiin", payload); },
    admin: function (action, payload, token) { return request(action, payload || {}, token); },
    clearPublicCache: function () { try { localStorage.removeItem(CACHE_KEY); } catch (e) {} }
  };

  /* Percepat render: unduh bootstrap sedini mungkin (prefetch) — halaman tinggal memakai. */
  window.SedekahPrefetch = {
    ready: getBootstrap()["catch"](function () { return null; }),
    take: function () { var p = this.ready; this.ready = getBootstrap()["catch"](function () { return null; }); return p; }
  };
})();
