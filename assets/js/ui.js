(function () {
  "use strict";
  var config = window.SEDEKAH_CONFIG || {};
  var NS = "http://www.w3.org/2000/svg";
  var ICONS = {
    heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"/><path d="M12 5.7v8.2M7.9 9.8h8.2"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    close: '<path d="m18 6-12 12M6 6l12 12"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3v8Z"/><path d="m9 12 2 2 4-4"/>',
    check: '<path d="m20 6-11 11-5-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    wallet: '<path d="M20 7V6a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v10H5a3 3 0 0 1-3-3V7"/><path d="M16 14h.01"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z"/><path d="M9 3v15M15 6v15"/>',
    calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/>',
    leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 18 2 18 2c1 5.5-1 12-7 14"/><path d="M2 21c0-3 1.85-5.36 5.08-6.94C9.17 13.03 12 12 16 12"/>',
    school: '<path d="m3 10 9-5 9 5-9 5Z"/><path d="M7 12v5c3 2 7 2 10 0v-5M21 10v6"/>',
    food: '<path d="M4 3v7a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3M6 3v18M14 3v8a3 3 0 0 0 3 3h1V3v18"/>',
    medical: '<path d="M12 2v20M2 12h20"/><circle cx="12" cy="12" r="9"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    prayer: '<path d="M10.5 21V11l-2-7a2 2 0 0 0-3.8 1L7 13l-2-2a1.7 1.7 0 0 0-2.5 2.3l4 5.4V21"/><path d="M13.5 21V11l2-7a2 2 0 0 1 3.8 1L17 13l2-2a1.7 1.7 0 0 1 2.5 2.3l-4 5.4V21"/>',
    alert: '<path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
    home: '<path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
    archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v12h16V8M10 12h4"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.63h.01A1.7 1.7 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.54 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.37 9v.01A1.7 1.7 0 0 0 20.91 10H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z"/>',
    refresh: '<path d="M20 6v6h-6M4 18v-6h6"/><path d="M18.5 9A7 7 0 0 0 6 5.5L4 8m16 8-2 2.5A7 7 0 0 1 5.5 15"/>',
    logout: '<path d="M10 17l5-5-5-5M15 12H3M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    dashboard: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>'
  };
  function $(selector, root) { return (root || document).querySelector(selector); }
  function $$(selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
  function icon(name, className) {
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", className || "icon");
    svg.innerHTML = ICONS[name] || ICONS.heart;
    return svg;
  }
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      var value = attrs[key];
      if (value === undefined || value === null) return;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.indexOf("on") === 0 && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
      else node.setAttribute(key, value);
    });
    (children || []).forEach(function (child) {
      if (child === null || child === undefined) return;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });
    return node;
  }
  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }
  function formatRupiah(value) { return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value || 0)); }
  function formatCompact(value) { return new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value || 0)); }
  function formatDate(value, withTime) {
    if (!value) return "";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("id-ID", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "long" }).format(date);
  }
  function percent(collected, goal) { return Math.max(0, Math.min(100, goal ? Math.round((Number(collected || 0) / Number(goal)) * 100) : 0)); }
  function daysLeft(deadline) {
    if (!deadline) return "Tanpa batas waktu";
    var diff = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
    if (diff < 0) return "Program berakhir";
    return diff + " hari lagi";
  }
  function safeUrl(value, fallback) {
    if (!value) return fallback || "";
    try {
      var url = new URL(value, location.origin);
      if (url.protocol !== "https:" && url.origin !== location.origin) return fallback || "";
      return url.href;
    } catch (error) { return fallback || ""; }
  }
  function campaignUrl(slug) { return "/program/" + encodeURIComponent(slug) + "/"; }
  function donationUrl(slug) { return "/donasi/?program=" + encodeURIComponent(slug); }
  function categoryIcon() { return "heart"; }
  function createProgramCard(program) {
    var card = el("article", { class: "program-card" });
    var media = el("a", { class: "program-media", href: campaignUrl(program.slug), "aria-label": "Buka " + program.title });
    var imageUrl = safeUrl(program.imageUrl);
    if (imageUrl) {
      var image = el("img", { src: imageUrl, alt: "", loading: "lazy", width: "640", height: "400" });
      image.addEventListener("error", function () {
        clear(media);
        media.appendChild(el("div", { class: "program-fallback" }, [icon(categoryIcon(), "icon-lg")]));
      }, { once: true });
      media.appendChild(image);
    } else {
      media.appendChild(el("div", { class: "program-fallback" }, [icon(categoryIcon(), "icon-lg")]));
    }
    var body = el("div", { class: "program-body" });
    body.appendChild(el("div", { class: "program-org", text: program.organization || "Mitra terverifikasi" }));
    body.appendChild(el("h3", { class: "program-title" }, [el("a", { href: campaignUrl(program.slug), text: program.title })]));
    body.appendChild(el("p", { class: "program-excerpt", text: program.excerpt || "Bersama, kita dapat menghadirkan manfaat yang nyata." }));
    var progress = el("div", { class: "progress-track", role: "progressbar", "aria-label": "Progres donasi", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(percent(program.collected, program.goal)) }, [el("div", { class: "progress-fill", style: "width:" + percent(program.collected, program.goal) + "%" })]);
    body.appendChild(progress);
    var stats = el("div", { class: "program-stats" }, [
      el("div", { class: "program-raised" }, [el("strong", { text: formatRupiah(program.collected) }), el("span", { text: "dari " + formatRupiah(program.goal) })]),
      el("span", { class: "program-days", text: daysLeft(program.deadline) })
    ]);
    body.appendChild(stats);
    body.appendChild(el("a", { class: "btn btn-primary", href: donationUrl(program.slug) }, [document.createTextNode("Sedekah sekarang"), icon("arrow") ]));
    card.appendChild(media);
    card.appendChild(body);
    return card;
  }
  function renderProgramSkeleton(container, count) {
    clear(container);
    for (var i = 0; i < (count || 3); i += 1) container.appendChild(el("div", { class: "card-skeleton skeleton", "aria-hidden": "true" }));
  }
  function renderEmpty(container, title, description) {
    clear(container);
    container.appendChild(el("div", { class: "empty-state surface" }, [
      el("div", { class: "empty-icon" }, [icon("search", "icon-lg")]),
      el("h3", { text: title || "Belum ada program" }),
      el("p", { text: description || "Program sedekah akan ditampilkan di sini." })
    ]));
  }
  function setText(selector, text) { var node = $(selector); if (node) node.textContent = text; }
  function setMeta(selector, content) { var node = $(selector); if (node) node.setAttribute("content", content); }
  function setSeo(options) {
    options = options || {};
    if (options.title) document.title = options.title;
    if (options.description) {
      setMeta('meta[name="description"]', options.description);
      setMeta('meta[property="og:description"]', options.description);
      setMeta('meta[name="twitter:description"]', options.description);
    }
    if (options.title) {
      setMeta('meta[property="og:title"]', options.title);
      setMeta('meta[name="twitter:title"]', options.title);
    }
    var canonical = $("link[rel=canonical]");
    var url = options.url || location.href.split("?")[0];
    if (canonical) canonical.href = url;
    setMeta('meta[property="og:url"]', url);
  }
  function normalizeStaticSeo() {
    var base = location.origin && location.origin !== "null" ? location.origin : (config.siteUrl || "http://localhost");
    var canonical = $("link[rel=canonical]");
    if (canonical && canonical.getAttribute("href") && canonical.getAttribute("href").indexOf("/") === 0) canonical.href = new URL(canonical.getAttribute("href"), base).href;
    var ogUrl = $('meta[property="og:url"]');
    if (ogUrl && ogUrl.content && ogUrl.content.indexOf("/") === 0) ogUrl.content = new URL(ogUrl.content, base).href;
  }
  function brandNode() {
    var brand = el("a", { class: "brand", href: "/", "aria-label": (config.siteName || "SEDEKAH SUBUH HARAMAIN") + "   Beranda" });
    brand.appendChild(el("span", { class: "brand-mark brand-logo-wrap" }, [el("img", { class: "site-logo", src: config.logoUrl || "/assets/images/logo-sedekah-subuh-haramain.png", alt: "" })]));
    brand.appendChild(el("span", { class: "brand-copy" }, [el("span", { class: "brand-copy-text", text: config.siteName || "SEDEKAH SUBUH HARAMAIN" }), el("small", { text: "Sedekah Online" })]));
    return brand;
  }
  function currentRoot() {
    var part = location.pathname.split("/").filter(Boolean)[0] || "home";
    return part === "index.html" ? "home" : part;
  }
  function navLink(label, href, key) {
    return el("a", { class: "nav-link", href: href, "aria-current": currentRoot() === key ? "page" : null, text: label });
  }
  function initHeader() {
    var mount = $("[data-site-header]");
    if (!mount) return;
    var header = el("header", { class: "site-header" });
    var wrap = el("div", { class: "container-shell nav-wrap" });
    wrap.appendChild(brandNode());
    var nav = el("nav", { class: "nav-links", "aria-label": "Navigasi utama" }, [
      navLink("Beranda", "/", "home"),
      navLink("Program", "/program/", "program"),
      navLink("Paket Nasi", "/paket-nasi/", "paket-nasi"),
      navLink("Donatur", "/donatur/", "donatur"),
      navLink("Galeri", "/galeri/", "galeri"),
      navLink("Tentang", "/tentang/", "tentang"),
      navLink("Cek donasi", "/status/", "status")
    ]);
    wrap.appendChild(nav);
    var actions = el("div", { class: "nav-actions" }, [
      el("a", { class: "btn btn-primary", href: "/program/" }, [document.createTextNode("Mulai sedekah"), icon("arrow")])
    ]);
    var menuButton = el("button", { class: "mobile-menu-button", type: "button", "aria-label": "Buka menu", "aria-expanded": "false", "aria-controls": "mobile-menu" }, [icon("menu", "icon-lg")]);
    actions.appendChild(menuButton);
    wrap.appendChild(actions);
    var mobile = el("nav", { id: "mobile-menu", class: "mobile-menu", "aria-label": "Navigasi seluler" }, [
      navLink("Beranda", "/", "home"), navLink("Program sedekah", "/program/", "program"), navLink("Paket nasi", "/paket-nasi/", "paket-nasi"), navLink("Donatur", "/donatur/", "donatur"), navLink("Galeri", "/galeri/", "galeri"), navLink("Tentang kami", "/tentang/", "tentang"), navLink("Cek donasi", "/status/", "status"),
      el("a", { class: "btn btn-primary", href: "/program/" }, [document.createTextNode("Mulai sedekah"), icon("arrow")])
    ]);
    menuButton.addEventListener("click", function () {
      var open = mobile.classList.toggle("open");
      document.body.classList.toggle("menu-open", open);
      menuButton.setAttribute("aria-expanded", String(open));
      menuButton.setAttribute("aria-label", open ? "Tutup menu" : "Buka menu");
      clear(menuButton);
      menuButton.appendChild(icon(open ? "close" : "menu", "icon-lg"));
    });
    header.appendChild(wrap);
    header.appendChild(mobile);
    mount.replaceWith(header);
  }
  function initFooter() {
    var mount = $("[data-site-footer]");
    if (!mount) return;
    var year = new Date().getFullYear();
    var footer = el("footer", { class: "site-footer" });
    var grid = el("div", { class: "container-shell footer-grid" });
    var about = el("div", {}, [brandNode(), el("p", { class: "footer-about", text: "Platform sedekah yang menghubungkan niat baik dengan program terverifikasi dan laporan yang transparan." })]);
    var programs = el("div", {}, [el("div", { class: "footer-title", text: "Jelajahi" }), el("div", { class: "footer-links" }, [el("a", { href: "/program/", text: "Semua program" }), el("a", { href: "/paket-nasi/", text: "Paket nasi" }), el("a", { href: "/donatur/", text: "Doa donatur" }), el("a", { href: "/galeri/", text: "Galeri" }), el("a", { href: "/status/", text: "Cek donasi" })])]);
    var legal = el("div", {}, [el("div", { class: "footer-title", text: "Informasi" }), el("div", { class: "footer-links" }, [el("a", { href: "/kebijakan-privasi/", text: "Kebijakan privasi" }), el("a", { href: "/syarat-ketentuan/", text: "Syarat & ketentuan" }), el("a", { href: "/admin/", text: "Panel admin" })])]);
    var contact = el("div", {}, [el("div", { class: "footer-title", text: "Butuh bantuan?" }), el("div", { class: "footer-links" }, [el("a", { class:"support-email", href: "mailto:" + (config.supportEmail || "admin@example.org"), text: config.supportEmail || "admin@example.org" }), el("a", { class:"support-whatsapp", href: "https://wa.me/" + (config.supportWhatsApp || "6281234567890"), rel: "noopener noreferrer", target: "_blank", text: "WhatsApp dukungan" })])]);
    grid.appendChild(about); grid.appendChild(programs); grid.appendChild(legal); grid.appendChild(contact);
    var bottom = el("div", { class: "container-shell footer-bottom" }, [el("span", { text: "  " + year + " " + (config.siteName || "SEDEKAH SUBUH HARAMAIN") + ". Semua hak dilindungi." }), el("span", { text: "Pembayaran aman diproses melalui layanan pembayaran" })]);
    footer.appendChild(grid); footer.appendChild(bottom); mount.replaceWith(footer);
  }
  function initFaq() {
    $$(".faq-question").forEach(function (button) {
      button.addEventListener("click", function () {
        var item = button.closest(".faq-item");
        var open = item.classList.toggle("open");
        button.setAttribute("aria-expanded", String(open));
      });
    });
  }
  function toast(message, type) {
    var stack = $(".toast-stack");
    if (!stack) { stack = el("div", { class: "toast-stack", "aria-live": "polite" }); document.body.appendChild(stack); }
    var item = el("div", { class: "toast " + (type || "") }, [icon(type === "error" ? "alert" : "check"), el("span", { text: message })]);
    stack.appendChild(item);
    setTimeout(function () { item.remove(); }, 4200);
  }
  async function copyText(value) {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(value);
      else {
        var input = el("textarea", { class: "sr-only" }); input.value = value; document.body.appendChild(input); input.select(); document.execCommand("copy"); input.remove();
      }
      toast("Tautan berhasil disalin.", "success");
      return true;
    } catch (error) { toast("Tautan belum dapat disalin.", "error"); return false; }
  }
  async function shareProgram(program) {
    var url = new URL(campaignUrl(program.slug), config.siteUrl || location.origin).href;
    if (navigator.share) {
      try { await navigator.share({ title: program.title, text: program.excerpt, url: url }); return; } catch (error) { if (error.name === "AbortError") return; }
    }
    await copyText(url);
  }
  function getSlugFromPath() {
    if (window.__PROGRAM_SLUG__) return window.__PROGRAM_SLUG__;
    var query = new URLSearchParams(location.search).get("slug");
    if (query) return query;
    var parts = location.pathname.split("/").filter(Boolean);
    if (parts[0] === "program" && parts[1] && parts[1] !== "index.html") return decodeURIComponent(parts[1]);
    return "";
  }
  function statusBadge(status) {
    var labels = { paid: "Berhasil", pending: "Menunggu QRIS", awaiting_transfer:"Menunggu transfer", creating:"Diproses", gateway_error:"Gangguan gateway", cancelled:"Dibatalkan", failed: "Gagal", expired: "Kedaluwarsa", published: "Tayang", draft: "Draf", archived: "Diarsipkan" };
    var classes = { paid: "badge-green", published: "badge-green", pending: "badge-amber", awaiting_transfer:"badge-amber", creating:"badge-amber", draft: "badge-gray", failed: "badge-red", expired: "badge-red", cancelled:"badge-red", gateway_error:"badge-red", archived: "badge-gray" };
    return el("span", { class: "badge " + (classes[status] || "badge-gray"), text: labels[status] || status || " " });
  }
  function applySettings(settings) {
    settings = settings || {};
    $$(".brand-copy-text").forEach(function(node){ node.textContent = settings.siteName || config.siteName || "SEDEKAH SUBUH HARAMAIN"; });
    $$(".site-logo").forEach(function(node){ node.src = safeUrl(settings.logoUrl || config.logoUrl, "/assets/images/logo-sedekah-subuh-haramain.png"); });
    $$(".support-email").forEach(function(node){ var email=settings.supportEmail||config.supportEmail||"admin@example.org";node.textContent=email;node.href="mailto:"+email; });
    $$(".support-whatsapp").forEach(function(node){ var phone=settings.supportWhatsApp||config.supportWhatsApp||"6281234567890";node.href="https://wa.me/"+String(phone).replace(/\D/g,""); });
  }
  document.addEventListener("DOMContentLoaded", function () { normalizeStaticSeo(); initHeader(); initFooter(); initFaq(); if (window.SedekahAPI) window.SedekahAPI.getBootstrap().then(function(data){applySettings(data.settings);}).catch(function(){}); });
  window.SedekahUI = {
    $: $, $$: $$, el: el, icon: icon, clear: clear, formatRupiah: formatRupiah, formatCompact: formatCompact, formatDate: formatDate,
    percent: percent, daysLeft: daysLeft, safeUrl: safeUrl, campaignUrl: campaignUrl, donationUrl: donationUrl, categoryIcon: categoryIcon,
    createProgramCard: createProgramCard, renderProgramSkeleton: renderProgramSkeleton, renderEmpty: renderEmpty, setText: setText, setSeo: setSeo,
    toast: toast, copyText: copyText, shareProgram: shareProgram, getSlugFromPath: getSlugFromPath, statusBadge: statusBadge, applySettings:applySettings
  };
})();