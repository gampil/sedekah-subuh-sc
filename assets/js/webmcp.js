(function () {
  "use strict";
  function register(tool) {
    var context = document.modelContext;
    if (!context || typeof context.registerTool !== "function") return;
    try { Promise.resolve(context.registerTool(tool)).catch(function () {}); } catch (error) {}
  }
  document.addEventListener("DOMContentLoaded", function () {
    register({
      name: "list_active_donation_programs",
      title: "Lihat program sedekah",
      description: "Menampilkan program sedekah aktif beserta target dan jumlah yang sudah terkumpul.",
      inputSchema: { type: "object", properties: { category: { type: "string", description: "Kategori opsional" } }, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async function (input) {
        var data = await window.SedekahAPI.getBootstrap();
        var category = input && input.category ? String(input.category).toLowerCase() : "";
        return (data.programs || []).filter(function (p) { return p.status === "published" && (!category || String(p.category).toLowerCase() === category); }).map(function (p) { return { title: p.title, slug: p.slug, category: p.category, goal: Number(p.goal), collected: Number(p.collected), url: new URL(window.SedekahUI.campaignUrl(p.slug), location.origin).href }; });
      }
    });
    var slug = window.SedekahUI.getSlugFromPath();
    if (slug) register({
      name: "start_donation_for_program",
      title: "Mulai sedekah",
      description: "Membuka formulir sedekah untuk program yang sedang dilihat dan menyiapkan nominal pilihan.",
      inputSchema: { type: "object", properties: { amount: { type: "integer", minimum: 10000, maximum: 100000000 } }, required: ["amount"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: function (input) {
        var amount = Number(input && input.amount);
        if (!Number.isInteger(amount) || amount < 10000 || amount > 100000000) throw new Error("Nominal harus antara Rp10.000 dan Rp100.000.000.");
        var url = window.SedekahUI.donationUrl(slug) + "&amount=" + amount;
        var result = { staged: true, programSlug: slug, amount: amount, url: new URL(url, location.origin).href };
        setTimeout(function () { location.assign(url); }, 0);
        return result;
      }
    });
  });
})();
