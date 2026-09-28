(function () {
  "use strict";
  var UI = window.SedekahUI;
  var API = window.SedekahAPI;
  var allPrograms = [];
  var visiblePrograms = 9;
  function renderList(programs) {
    var grid = UI.$("#program-list");
    if (!grid) return;
    UI.clear(grid);
    programs.slice(0, visiblePrograms).forEach(function (program) { grid.appendChild(UI.createProgramCard(program)); });
    if (!programs.length) UI.renderEmpty(grid, "Program tidak ditemukan", "Coba kata kunci lain.");
    UI.setText("#program-count", programs.length + " program");
    var more = UI.$("#load-more-programs");if(more)more.classList.toggle("hidden",programs.length<=visiblePrograms);
  }
  function bindFilters() {
    var search = UI.$("#program-search");
    function apply() {
      var term = (search.value || "").trim().toLowerCase();
      visiblePrograms=9;renderList(allPrograms.filter(function (program) {
        return !term || [program.title, program.excerpt, program.organization, program.location].join(" ").toLowerCase().indexOf(term) >= 0;
      }));
    }
    search.addEventListener("input", apply);
    var more=UI.$("#load-more-programs");
    if(more)more.addEventListener("click",function(){
      visiblePrograms+=9;
      var term=(search.value||"").trim().toLowerCase();
      renderList(allPrograms.filter(function(p){
        return (!term||[p.title,p.excerpt,p.organization,p.location].join(" ").toLowerCase().includes(term));
      }));
    });
  }
  function campaignDonorCard(d) {
    var name=d.name||"Hamba Allah",initial=name.trim().charAt(0).toUpperCase()||"D",count=Number(d.aamiinCount||0);
    var countNode=UI.el("span",{class:"aamiin-count",text:String(count)});
    var button=UI.el("button",{class:"aamiin-button",type:"button","aria-label":"Aminkan doa dari "+name},[
      UI.icon("prayer","aamiin-hands"),UI.el("span",{text:"Aamiin"}),countNode
    ]);
    button.addEventListener("click",async function(){if(button.disabled)return;button.disabled=true;button.classList.add("is-loading");try{var result=await API.addAamiin({donationId:d.id,token:d.aamiinToken});countNode.textContent=String(result.aamiinCount);button.classList.remove("aamiin-pop");void button.offsetWidth;button.classList.add("aamiin-pop");if(!result.added)UI.toast("Aamiin Anda sudah tercatat.","success");}catch(error){UI.toast(error.message,"error");}finally{button.disabled=false;button.classList.remove("is-loading");}});
    return UI.el("article",{class:"campaign-donor-card"},[
      UI.el("div",{class:"campaign-donor-head"},[
        UI.el("span",{class:"donor-avatar","aria-hidden":"true",text:initial}),
        UI.el("div",{class:"donor-identity"},[UI.el("strong",{text:name}),UI.el("small",{text:UI.formatDate(d.paidAt)})]),
        UI.el("span",{class:"donor-amount",text:UI.formatRupiah(d.amount)})
      ]),UI.el("p",{class:"donor-prayer",text:d.prayer||"Semoga menjadi amal baik yang terus mengalir."}),button
    ]);
  }
async function loadCampaignDonors(program, container, moreButton) {
  var page = Number(container.dataset.page || 0) + 1;
  moreButton.disabled = true;
  moreButton.classList.add("is-loading");
  
  try {
    // Kita gunakan ID jika ada, atau fallback ke slug. Tanpa mengunduh data eksternal lagi.
    var identifier = program.id || program.slug;
    
    // Cetak ke console agar kita tahu apa yang dikirim ke backend
    console.log("Cek Parameter Doa -> ID/Slug:", identifier);
    
    var result = await API.getPublicDonations(page, 5, identifier); 
    var items = result.items || [];
    
    if (container.querySelector(".empty-copy")) {
      UI.clear(container);
    }
    
    items.forEach(function (d) {
      container.appendChild(campaignDonorCard(d));
    });
    
    container.dataset.page = String(page);
    moreButton.classList.toggle("hidden", !result.hasMore);
    
    if (!container.children.length) {
      container.appendChild(UI.el("p", { class: "empty-copy", text: "Belum ada doa publik untuk program ini." }));
    }
  } catch (error) {
    console.error("Error muat doa:", error);
    UI.toast(error.message, "error");
  } finally {
    moreButton.disabled = false;
    moreButton.classList.remove("is-loading");
  }
}
  function enhanceCampaign(program){
    var view=UI.$("#program-detail-view"),description=UI.$("#detail-description");if(!view||!description||view.dataset.enhanced)return;
    view.dataset.enhanced="true";view.classList.add("campaign-detail");
    if((program.description||"").length>420){
      description.classList.add("description-collapsed");var readMore=UI.el("button",{class:"btn btn-secondary detail-read-more",type:"button",text:"Baca selengkapnya"});
      readMore.addEventListener("click",function(){var collapsed=description.classList.toggle("description-collapsed");readMore.textContent=collapsed?"Baca selengkapnya":"Tampilkan lebih sedikit";});description.insertAdjacentElement("afterend",readMore);
    }
    var list=UI.$("#campaign-donor-list"),more=UI.$("#campaign-load-more"),loaded=false;
    function selectTab(name){UI.$$("[data-detail-tab]").forEach(function(btn){var selected=btn.dataset.detailTab===name;btn.classList.toggle("active",selected);btn.setAttribute("aria-selected",String(selected));btn.tabIndex=selected?0:-1;});
      ["description","donors","updates"].forEach(function(key){UI.$("#panel-"+key).classList.toggle("hidden",key!==name);});
      if(name==="donors"&&!loaded){loaded=true;more.classList.remove("hidden");loadCampaignDonors(program,list,more);}}
    UI.$$("[data-detail-tab]").forEach(function(btn,index,buttons){btn.addEventListener("click",function(){selectTab(btn.dataset.detailTab);});btn.addEventListener("keydown",function(e){if(e.key!=="ArrowLeft"&&e.key!=="ArrowRight")return;e.preventDefault();var next=buttons[(index+(e.key==="ArrowRight"?1:buttons.length-1))%buttons.length];next.focus();selectTab(next.dataset.detailTab);});});
    more.addEventListener("click",function(){loadCampaignDonors(program,list,more);});selectTab("description");
  }
  function renderDetail(program) {
    UI.$("#program-list-view").classList.add("hidden");
    var view = UI.$("#program-detail-view");
    view.classList.remove("hidden");
    UI.setText("#detail-title", program.title);
    UI.setText("#detail-org", program.organization || "Mitra terverifikasi");
    UI.setText("#detail-location", program.location || "Indonesia");
    UI.setText("#detail-description", program.description || program.excerpt);
    UI.setText("#detail-raised", UI.formatRupiah(program.collected));
    UI.setText("#detail-target", "Target " + UI.formatRupiah(program.goal));
    UI.setText("#detail-donors", UI.formatCompact(program.donorCount || 0) + " donatur");
    UI.setText("#detail-days", UI.daysLeft(program.deadline));
    UI.setText("#mobile-raised", UI.formatRupiah(program.collected));
    var image = UI.$("#detail-image");
    var imageUrl = UI.safeUrl(program.imageUrl, "/assets/img/hero-charity.webp");
    image.src = imageUrl;
    image.alt = "Ilustrasi program " + program.title;
    var pct = UI.percent(program.collected, program.goal);
    UI.$$("[data-detail-progress]").forEach(function (track) {
      track.setAttribute("aria-valuenow", String(pct));
      var fill = track.querySelector(".progress-fill");
      if (fill) fill.style.width = pct + "%";
    });
    UI.$$("[data-donate-link]").forEach(function (link) { link.href = UI.donationUrl(program.slug); });
    UI.$$("[data-share-program]").forEach(function (button) { button.addEventListener("click", function () { UI.shareProgram(program); }); });
    var updates = UI.$("#program-updates");
    UI.clear(updates);
    var updateItems=(program.updates||[]).slice().sort(function(a,b){return new Date(b.publishedAt)-new Date(a.publishedAt);}),updateShown=0;
    function appendUpdates(){updateItems.slice(updateShown,updateShown+5).forEach(function(update){updates.appendChild(UI.el("article",{class:"update-item"},[UI.el("time",{datetime:update.publishedAt,text:UI.formatDate(update.publishedAt)}),UI.el("h3",{text:update.title}),UI.el("p",{text:update.content})]));});updateShown=Math.min(updateItems.length,updateShown+5);var button=UI.$("#more-program-updates");if(button)button.classList.toggle("hidden",updateShown>=updateItems.length);}
    if(!updateItems.length)updates.appendChild(UI.el("p",{text:"Pembaruan program akan ditampilkan di sini."}));else{var updateMore=UI.el("button",{id:"more-program-updates",class:"btn btn-secondary list-more hidden",type:"button",text:"Lihat pembaruan lainnya"});updateMore.addEventListener("click",appendUpdates);updates.insertAdjacentElement("afterend",updateMore);appendUpdates();}
    var title = program.title + "   " + ((window.SEDEKAH_CONFIG || {}).siteName || "SEDEKAH SUBUH HARAMAIN");
    UI.setSeo({ title: title, description: program.excerpt, url: new URL(UI.campaignUrl(program.slug), location.origin).href });
    var schema = UI.$("#program-schema");
    if (schema) schema.textContent = JSON.stringify({ "@context": "https://schema.org", "@type": "DonateAction", name: program.title, description: program.excerpt, target: new URL(UI.donationUrl(program.slug), location.origin).href, recipient: { "@type": "Organization", name: program.organization || ((window.SEDEKAH_CONFIG || {}).siteName || "SEDEKAH SUBUH HARAMAIN") } });
    enhanceCampaign(program);
  }
  async function init() {
    var slug = UI.getSlugFromPath();
    if (slug) {
      try {
        var result = await API.getProgram(slug);
        if (!result) throw new Error("Program yang Anda cari tidak ditemukan atau sudah tidak tayang.");
        UI.applySettings(result.settings);
        renderDetail(result.program);
      } catch (error) {
        UI.$("#program-list-view").classList.add("hidden");
        UI.$("#program-detail-view").classList.add("hidden");
        UI.$("#program-error").classList.remove("hidden");
        UI.setText("#program-error-message", error.message);
      }
      return;
    }
    var grid = UI.$("#program-list");
    UI.renderProgramSkeleton(grid, 6);
    try {
      var data = await API.getBootstrap();
      UI.applySettings(data.settings); allPrograms = (data.programs || []).filter(function (program) { return program.status === "published"; });
      renderList(allPrograms);
      bindFilters();
    } catch (error) { UI.renderEmpty(grid, "Program belum dapat dimuat", error.message); }
  }
  document.addEventListener("DOMContentLoaded", init);
})();