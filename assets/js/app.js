(function () {
  "use strict";
  var UI = window.SedekahUI;
  var API = window.SedekahAPI;

  async function init() {
    var grid = UI.$("#featured-programs");
    if (grid) UI.renderProgramSkeleton(grid, 3);
    try {
      var data = await API.getBootstrap();
      var settings = data.settings || {};
      UI.applySettings(settings);
      if (settings.heroTitle) UI.setText("#hero-title", settings.heroTitle);
      if (settings.heroDescription) UI.setText("#hero-description", settings.heroDescription);
      UI.setText("#stat-collected", UI.formatCompact(data.stats && data.stats.totalCollected || 0));
      UI.setText("#stat-donors", UI.formatCompact(data.stats && data.stats.donorCount || 0));
      UI.setText("#stat-programs", String(data.stats && data.stats.activePrograms || 0));
      if (grid) {
        UI.clear(grid);
        var programs = (data.programs || []).filter(function (item) { return item.status === "published"; });
        var featured = programs.filter(function (item) { return item.featured === true || String(item.featured) === "true"; });
        (featured.length ? featured : programs).slice(0, 3).forEach(function (program) { grid.appendChild(UI.createProgramCard(program)); });
        if (!grid.children.length) UI.renderEmpty(grid, "Program sedang disiapkan", "Silakan kembali lagi untuk melihat program sedekah terbaru.");
      }
      var demo = UI.$("#demo-notice");
      if (demo && !API.isConfigured()) demo.classList.remove("hidden");
      if (data.stale) UI.toast("Menampilkan data tersimpan karena koneksi sedang terganggu.", "error");
    } catch (error) {
      if (grid) UI.renderEmpty(grid, "Program belum dapat dimuat", error.message);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
