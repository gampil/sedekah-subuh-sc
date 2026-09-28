/* rich.js — renderer deskripsi aman: teks biasa, URL gambar (tempel link), HTML terbatas dari editor admin. Mendukung paste gambar → upload ImgBB. */
(function () {
  "use strict";

  /* Render deskripsi program/paket ke dalam node target. */
  function renderRichDescription(target, raw, options) {
    if (!target) return;
    options = options || {};
    var text = String(raw == null ? "" : raw);
    target.classList.add("rich-content");
    target.textContent = "";
    if (/<(?:img|p|br|ul|ol|h3|h4|strong|em|b|i|u)\b/i.test(text)) {
      // HTML sudah disanitasi backend (sanitizeRichDescription_); img di-force lazy=false agar cepat tampil
      var frag = document.createElement("div");
      frag.innerHTML = text.replace(/<img\b[^>]*>/gi, function (tag) {
        var clean = tag.replace(/\s(lazy|loading)="[^"]*"/gi, "");
        return clean.replace(/<img\b/, '<img loading="eager" decoding="async" fetchpriority="low"');
      });
      while (frag.firstChild) target.appendChild(frag.firstChild);
    } else {
      var blocks = text.split(/\n{2,}/);
      blocks.forEach(function (block) {
        if (!block.trim()) return;
        var p = document.createElement("p");
        block.split(/\n/).forEach(function (line, i) {
          if (i) p.appendChild(document.createElement("br"));
          p.appendChild(document.createTextNode(line));
        });
        target.appendChild(p);
      });
      // Ubah URL gambar yang ditempel langsung menjadi <img>
      Array.prototype.forEach.call(target.querySelectorAll("p"), function (p) {
        Array.prototype.forEach.call(p.childNodes, function (node) {
          if (node.nodeType !== 3) return;
          var urls = node.textContent.match(/https?:\/\/\S+\.(?:png|jpe?g|webp|gif)(?:\?\S*)?/gi) || [];
          if (!urls.length) return;
          var parts = node.textContent.split(/(https?:\/\/\S+\.(?:png|jpe?g|webp|gif)(?:\?\S*)?)/gi);
          var wrap = document.createDocumentFragment();
          parts.forEach(function (part) {
            if (/^https?:\/\//i.test(part) && /\.(png|jpe?g|webp|gif)(?:\?|$)/i.test(part)) {
              wrap.appendChild(document.createElement("br"));
              wrap.appendChild(document.createElement("img"));
              wrap.lastChild.src = part;
              wrap.lastChild.alt = "Gambar dari deskripsi";
              wrap.lastChild.loading = "eager";
              wrap.lastChild.decoding = "async";
            } else if (part) {
              wrap.appendChild(document.createTextNode(part));
            }
          });
          p.replaceChild(wrap, node);
        });
      });
    }
  }

  /* Tempel gambar pada textarea → upload ke ImgBB via API → sisipkan URL. */
  function attachImagePaste(textarea, callbacks) {
    if (!textarea) return;
    callbacks = callbacks || {};
    textarea.addEventListener("paste", function (event) {
      var items = (event.clipboardData || window.clipboardData).items;
      if (!items) return;
      var file = null;
      for (var i = 0; i < items.length; i += 1) {
        if (items[i].kind === "file" && /^image\//.test(items[i].type)) { file = items[i].getAsFile(); break; }
      }
      if (!file) return;
      event.preventDefault();
      if (file.size > 4000000) { if (callbacks.onError) callbacks.onError("Gambar maksimal 4 MB."); return; }
      if (callbacks.onStart) callbacks.onStart();
      var reader = new FileReader();
      reader.onload = function () {
        var API = window.SedekahAPI;
        Promise.resolve(API && API.admin("adminUploadImage", { dataUrl: reader.result })).then(function (result) {
          var url = result && result.url;
          if (!url) throw new Error("URL gambar tidak diterima.");
          var insert = "\n![gambar](" + url + ")\n" + url + "\n";
          var start = textarea.selectionStart || textarea.value.length;
          textarea.value = textarea.value.slice(0, start) + insert + textarea.value.slice(textarea.selectionEnd || start);
          textarea.focus();
          if (callbacks.onDone) callbacks.onDone(url);
        }).catch(function (error) {
          if (callbacks.onError) callbacks.onError(error.message || "Gambar gagal diunggah.");
        }).then(function () {
          if (callbacks.onFinish) callbacks.onFinish();
        });
      };
      reader.onerror = function () { if (callbacks.onError) callbacks.onError("File tidak dapat dibaca."); if (callbacks.onFinish) callbacks.onFinish(); };
      reader.readAsDataURL(file);
    });
  }

  window.SedekahRich = { render: renderRichDescription, attachImagePaste: attachImagePaste };
})();
