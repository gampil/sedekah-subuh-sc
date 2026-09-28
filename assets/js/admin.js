(function(){
  "use strict";
  var UI=window.SedekahUI, API=window.SedekahAPI, config=window.SEDEKAH_CONFIG||{}, token="", data=null, currentType="", currentItem=null;
  var pendingUploads=0;
  
  var schemas={
    program:[
      {k:"title",l:"Judul",r:1},
      {k:"slug",l:"Alamat halaman",r:1},
      {k:"excerpt",l:"Ringkasan",t:"textarea",r:1},
      {k:"description",l:"Deskripsi",t:"textarea",r:1},
      /* Bagian kategori telah dihapus dari sini */
      {k:"imageUrl",l:"Gambar program",img:1},
      {k:"goal",l:"Target dana",t:"number",r:1},
      {k:"organization",l:"Pengelola",r:1},
      {k:"location",l:"Lokasi"},
      {k:"deadline",l:"Batas waktu",t:"date"},
      {k:"status",l:"Status",o:["draft","published","archived"]},
      {k:"featured",l:"Program pilihan",t:"checkbox"}
    ],
    update:[{k:"programId",l:"Program",programs:1,r:1},{k:"title",l:"Judul",r:1},{k:"content",l:"Isi pembaruan",t:"textarea",r:1},{k:"publishedAt",l:"Tanggal terbit",t:"date",r:1},{k:"status",l:"Status",o:["draft","published"]}],
    gallery:[{k:"programId",l:"Program terkait",programs:1,optional:1},{k:"title",l:"Judul",r:1},{k:"caption",l:"Keterangan",t:"textarea"},{k:"imageUrl",l:"Gambar",img:1,r:1},{k:"status",l:"Status",o:["draft","published"]},{k:"sortOrder",l:"Urutan",t:"number"}],
    bank:[{k:"bankName",l:"Nama bank",r:1},{k:"accountNumber",l:"Nomor rekening",r:1},{k:"accountHolder",l:"Atas nama",r:1},{k:"instructions",l:"Instruksi",t:"textarea"},{k:"active",l:"Aktif",t:"checkbox"},{k:"sortOrder",l:"Urutan",t:"number"}],
    package:[{k:"programId",l:"Program tujuan",programs:1,r:1},{k:"name",l:"Nama paket",r:1},{k:"description",l:"Deskripsi",t:"textarea"},{k:"price",l:"Harga per paket",t:"number",r:1},{k:"imageUrl",l:"Gambar",img:1},{k:"active",l:"Aktif",t:"checkbox"},{k:"sortOrder",l:"Urutan",t:"number"}]
  };

  function saveToken(v){try{sessionStorage.setItem("ssh_admin_token",v);}catch(e){}}
  function savedToken(){try{return sessionStorage.getItem("ssh_admin_token")||"";}catch(e){return"";}}
  function clearToken(){try{sessionStorage.removeItem("ssh_admin_token");}catch(e){}}
  function jwtEmail(v){try{return JSON.parse(atob(v.split(".")[1].replace(/-/g,"+").replace(/_/g,"/"))).email||"Admin";}catch(e){return"Admin";}}
  
  async function call(action,payload){
    if(!token)throw new Error("Sesi admin berakhir.");
    try{return await API.admin(action,payload||{},token);}
    catch(error){if(/Aksi admin tidak tersedia/i.test(error.message))throw new Error("Aksi "+action+" belum tersedia pada deployment Apps Script aktif. Deploy ulang versi Main.gs terbaru, lalu coba lagi.");throw error;}
  }
  
  function loading(on){UI.$("#admin-loading").classList.toggle("hidden",!on);UI.$("#admin-app").setAttribute("aria-busy",String(on));}
  function showLogin(message){UI.$("#admin-login").classList.remove("hidden");UI.$("#admin-app").classList.add("hidden");if(message){UI.setText("#login-error",message);UI.$("#login-error").classList.remove("hidden");}}
  function showApp(){UI.$("#admin-login").classList.add("hidden");UI.$("#admin-app").classList.remove("hidden");UI.setText("#admin-email",jwtEmail(token));}
  async function load(){loading(true);try{data=await call("adminDashboard");renderAll();saveToken(token);}finally{loading(false);}}
  
  function switchSection(name){
    UI.$$(".admin-section").forEach(function(s){s.classList.toggle("active",s.id==="section-"+name);});
    UI.$$(".admin-nav-button").forEach(function(b){b.classList.toggle("active",b.dataset.section===name);b.setAttribute("aria-current",b.dataset.section===name?"page":"false");});
    var b=UI.$('[data-section="'+name+'"]');UI.setText("#admin-title",b?b.textContent:"Panel Admin");UI.$("#admin-sidebar").classList.remove("open");UI.$("#admin-menu-button").setAttribute("aria-expanded","false");
  }
  
  function buttonBusy(button,on){if(!button)return;button.disabled=Boolean(on);button.classList.toggle("is-loading",Boolean(on));button.setAttribute("aria-busy",String(Boolean(on)));if(on){button.dataset.busyLabel=button.textContent.trim();button.textContent="Memproses…";}else if(button.dataset.busyLabel){button.textContent=button.dataset.busyLabel;delete button.dataset.busyLabel;}}
  async function withButtonBusy(button,task){if(button.disabled)return;buttonBusy(button,true);try{return await task();}finally{buttonBusy(button,false);}}
  function action(label,handler,danger){var button=UI.el("button",{class:"btn btn-sm "+(danger?"btn-danger":"btn-secondary"),type:"button",text:label});button.addEventListener("click",function(){withButtonBusy(button,handler).catch(function(e){UI.toast(e.message,"error");});});return button;}
  function empty(parent,text){parent.appendChild(UI.el("p",{class:"empty-copy",text:text}));}
  function trend(){window.SedekahLineChart(UI.$("#admin-trend"),data.trend||[]);}
  
  function renderStats(){var s=data.stats||{};UI.setText("#stat-total",UI.formatRupiah(s.totalCollected));UI.setText("#stat-donors",String(s.donorCount||0));UI.setText("#stat-programs",String(s.activePrograms||0));UI.setText("#stat-pending",String(s.pendingDonations||0));trend();}
  
  var visible={programs:15,donations:15,packages:9,gallery:9,updates:9,banks:9};
  function moreButton(key,total,render){var node=UI.$("#more-admin-"+key);if(!node)return;node.classList.toggle("hidden",total<=visible[key]);node.textContent="Lihat lainnya ("+Math.min(visible[key],total)+" dari "+total+")";node.onclick=function(){visible[key]+=key==="programs"||key==="donations"?15:9;render();};}
  
  function renderPrograms(){
    var body=UI.$("#table-programs"),term=(UI.$("#search-programs").value||"").toLowerCase();UI.clear(body);
    /* Filter kategori juga dihapus dari pencarian di bawah ini */
    var matches=(data.programs||[]).filter(function(p){return!term||[p.title,p.slug].join(" ").toLowerCase().includes(term);});
    matches.slice(0,visible.programs).forEach(function(p){
      var row=UI.el("tr");
      row.appendChild(UI.el("td",{},[UI.el("strong",{text:p.title}),UI.el("small",{text:p.slug})]));
      row.appendChild(UI.el("td",{},[UI.statusBadge(p.status)]));
      row.appendChild(UI.el("td",{text:UI.formatRupiah(p.goal)}));
      row.appendChild(UI.el("td",{text:UI.formatRupiah(p.collected)}));
      row.appendChild(UI.el("td",{},[UI.el("div",{class:"table-actions"},[action("Edit",function(){openEntity("program",p);}),action("Lihat",function(){window.open("/program/"+encodeURIComponent(p.slug)+"/","_blank","noopener");}),action("Hapus",function(){remove("program",p.id,p.title);},true)])]));
      body.appendChild(row);
    });
    moreButton("programs",matches.length,renderPrograms);responsiveTables();
  }
  
  function renderDonations(){
    var body=UI.$("#table-donations"),term=(UI.$("#search-donations").value||"").toLowerCase(),filter=UI.$("#filter-donations").value;UI.clear(body);
    var matches=(data.donations||[]).filter(function(d){return(!filter||d.status===filter)&&(!term||[d.id,d.name,d.email,d.phone,d.programTitle].join(" ").toLowerCase().includes(term));});
    matches.slice(0,visible.donations).forEach(function(d){
      var row=UI.el("tr"),select=UI.el("select",{class:"select"});
      ["creating","pending","awaiting_transfer","paid","gateway_error","failed","expired","cancelled"].forEach(function(s){select.appendChild(UI.el("option",{value:s,text:s,selected:d.status===s?"selected":null}));});
      row.appendChild(UI.el("td",{},[UI.el("strong",{text:d.id}),UI.el("small",{text:(d.name||"Hamba Allah")+" · "+(d.phone||"")})]));
      row.appendChild(UI.el("td",{text:d.packageName||d.programTitle}));
      row.appendChild(UI.el("td",{text:UI.formatRupiah(d.amount)}));
      row.appendChild(UI.el("td",{},[UI.el("span",{text:d.paymentMethod==="manual_bank"?"Transfer bank":"QRIS"}),d.proofStatus?UI.el("small",{text:"Bukti: "+({submitted:"menunggu pemeriksaan",approved:"disetujui",rejected:"ditolak"}[d.proofStatus]||d.proofStatus)}):UI.el("small",{text:""})]));
      row.appendChild(UI.el("td",{},[select]));
      var buttons=[action("Simpan",async function(){await mutate("adminSetDonationStatus",{id:d.id,status:select.value},"Status diperbarui.");})];
      if(d.paymentMethod==="qris")buttons.push(action("Cek gateway",async function(){await mutate("adminRefreshPayment",{id:d.id},"Gateway diperiksa.");}));
      if(d.paymentMethod==="manual_bank"&&d.proofFileId){
        buttons.push(action("Lihat bukti",async function(){var result=await call("adminGetTransferProof",{id:d.id});var dialog=UI.$("#proof-dialog"),img=UI.$("#admin-proof-image");img.src=result.dataUrl;UI.setText("#admin-proof-caption","Bukti transaksi "+d.id+" · "+(d.proofStatus||"menunggu"));dialog.showModal();}));
        if(d.proofStatus==="submitted"&&d.status==="awaiting_transfer"){
          buttons.push(action("Setujui transfer",async function(){if(confirm("Sudah cocokkan bukti dengan mutasi rekening untuk "+d.id+"?"))await mutate("adminReviewTransferProof",{id:d.id,decision:"approve"},"Transfer disetujui.");}));
          buttons.push(action("Tolak bukti",async function(){if(confirm("Tolak bukti "+d.id+"? Donatur dapat mengunggah ulang."))await mutate("adminReviewTransferProof",{id:d.id,decision:"reject"},"Bukti ditolak. Donatur dapat mengunggah ulang.");},true));
        }
      }
      row.appendChild(UI.el("td",{},[UI.el("div",{class:"table-actions"},buttons)]));
      body.appendChild(row);
    });
    moreButton("donations",matches.length,renderDonations);responsiveTables();
  }
  
  function cards(type,key,titleFn,subFn){var parent=UI.$("#cards-"+key);UI.clear(parent);var list=data[key]||[];list.slice(0,visible[key]).forEach(function(item){parent.appendChild(UI.el("article",{class:"surface panel"},[UI.el("h3",{text:titleFn(item)}),UI.el("p",{text:subFn(item)}),UI.el("div",{class:"section-actions"},[action("Edit",function(){openEntity(type,item);}),action("Hapus",function(){remove(type,item.id,titleFn(item));},true)])]));});if(!list.length)empty(parent,"Belum ada data.");moreButton(key,list.length,renderContent);}
  
  function renderContent(){
    cards("package","packages",function(x){return x.name;},function(x){return UI.formatRupiah(x.price)+(x.active?" · aktif":" · nonaktif");});
    cards("gallery","gallery",function(x){return x.title;},function(x){return x.caption||x.status;});
    cards("update","updates",function(x){return x.title;},function(x){return UI.formatDate(x.publishedAt)+" · "+x.status;});
    cards("bank","banks",function(x){return x.bankName;},function(x){return x.accountNumber+" · a.n. "+x.accountHolder+(x.active?" · aktif":" · nonaktif");});
  }
  
  function renderSettings(){var form=UI.$("#settings-form"),s=data.settings||{};Object.keys(s).forEach(function(k){var f=form.elements[k];if(!f)return;if(f.type==="checkbox")f.checked=s[k]===true||String(s[k])==="true";else f.value=s[k]===undefined?"":s[k];});}
  function responsiveTables(){UI.$$(".data-table").forEach(function(table){var labels=Array.prototype.map.call(table.querySelectorAll("thead th"),function(th){return th.textContent.trim();});table.querySelectorAll("tbody tr").forEach(function(row){Array.prototype.forEach.call(row.children,function(cell,index){cell.dataset.label=labels[index]||"Data";});});});}
  function renderAll(){renderStats();renderPrograms();renderDonations();renderContent();renderSettings();responsiveTables();}
  function slugify(value){return String(value||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,120);}
  
  function makeField(def,item){
    var wide=def.t==="textarea"||def.img||def.k==="title"||def.k==="slug",wrap=UI.el("div",{class:"form-group"+(wide?" form-group-wide":"")}),label=UI.el("label",{class:"field-label",text:def.l}),field;
    if(def.img){
      field=UI.el("input",{name:def.k,type:"hidden",required:def.r?"required":null});field.value=item[def.k]||"";
      var preview=UI.el("div",{class:"image-upload-preview"});if(field.value)preview.appendChild(UI.el("img",{src:UI.safeUrl(field.value),alt:"Pratinjau gambar"}));else preview.appendChild(UI.el("span",{text:"Belum ada gambar"}));
      var file=UI.el("input",{class:"image-file-input",type:"file",accept:"image/png,image/jpeg,image/webp"}),button=UI.el("label",{class:"image-upload-button"},[UI.el("span",{text:"Pilih gambar dari perangkat"}),UI.el("small",{class:"upload-progress-copy","aria-live":"polite"}),file]);
      file.addEventListener("change",function(){upload(file,field,preview,button);});wrap.appendChild(label);wrap.appendChild(field);wrap.appendChild(preview);wrap.appendChild(button);wrap.appendChild(UI.el("small",{class:"field-help",text:"PNG, JPG, atau WebP · maksimal 4 MB."}));return wrap;
    }
    if(def.programs){
      field=UI.el("select",{class:"select",name:def.k,required:def.r?"required":null});if(def.optional)field.appendChild(UI.el("option",{value:"",text:"— Tidak terkait —"}));
      (data.programs||[]).forEach(function(p){field.appendChild(UI.el("option",{value:p.id,text:p.title,selected:item[def.k]===p.id?"selected":null}));});
    }
    else if(def.o){field=UI.el("select",{class:"select",name:def.k});def.o.forEach(function(v){field.appendChild(UI.el("option",{value:v,text:v,selected:item[def.k]===v?"selected":null}));});}
    else if(def.t==="textarea")field=UI.el("textarea",{class:"textarea",name:def.k,required:def.r?"required":null});
    else field=UI.el("input",{class:def.t==="checkbox"?"": "field",name:def.k,type:def.t||"text",required:def.r?"required":null});
    
    if(def.t==="checkbox")field.checked=item[def.k]===true||String(item[def.k])==="true";else{var value=item[def.k]===undefined?"":item[def.k];if(def.t==="date"&&value)value=String(value).slice(0,10);field.value=value;}
    if(def.k==="slug"){field.readOnly=true;field.value=item.slug||slugify(item.title||"");wrap.classList.add("slug-field");wrap.appendChild(label);wrap.appendChild(field);wrap.appendChild(UI.el("small",{class:"field-help",text:"Dibuat otomatis dari judul."}));return wrap;}
    wrap.appendChild(label);wrap.appendChild(field);return wrap;
  }
  
  function openEntity(type,item){
    currentType=type;currentItem=item||{};var publishable=["program","update","gallery"].indexOf(type)>=0,labels={program:"program",update:"pembaruan",gallery:"galeri",bank:"rekening",package:"paket"};
    UI.setText("#entity-title",(item?"Edit ":"Tambah ")+(labels[type]||type));var fields=UI.$("#entity-fields");UI.clear(fields);(schemas[type]||[]).filter(function(def){return def.k!=="status";}).forEach(function(def){fields.appendChild(makeField(def,currentItem));});
    var title=fields.querySelector('[name="title"]'),slug=fields.querySelector('[name="slug"]');if(title&&slug)title.addEventListener("input",function(){slug.value=slugify(title.value);});
    UI.$("#entity-save-draft").classList.toggle("hidden",!publishable);UI.$("#entity-publish").classList.toggle("hidden",!publishable);UI.$("#entity-save").classList.toggle("hidden",publishable);UI.$("#entity-dialog").showModal();
  }
  
  async function upload(fileInput,target,preview,button){
    var file=fileInput.files&&fileInput.files[0];if(!file)return;if(file.size>4000000){UI.toast("Ukuran maksimal 4 MB.","error");fileInput.value="";return;}
    var oldValue=target.value,localUrl=URL.createObjectURL(file);pendingUploads++;var progress=button&&button.querySelector(".upload-progress-copy");if(progress)progress.textContent="Menyiapkan gambar…";if(button&&button.id==="setting-logo-progress")button.textContent="Menyiapkan gambar…";if(preview){UI.clear(preview);preview.appendChild(UI.el("img",{src:localUrl,alt:"Pratinjau gambar"}));}if(button)button.classList.add("is-loading");fileInput.disabled=true;
    var reader=new FileReader();reader.onprogress=function(e){if(!e.lengthComputable)return;var label="Membaca gambar "+Math.round(e.loaded/e.total*100)+"%";if(progress)progress.textContent=label;if(button&&button.id==="setting-logo-progress")button.textContent=label;};
    reader.onload=async function(){try{if(progress)progress.textContent="Mengunggah gambar…";if(button&&button.id==="setting-logo-progress")button.textContent="Mengunggah gambar…";var result=await call("adminUploadImage",{dataUrl:reader.result});target.value=result.url;if(preview&&preview.querySelector("img"))preview.querySelector("img").src=result.url;UI.toast("Gambar berhasil diunggah.","success");}catch(e){target.value=oldValue;UI.toast(e.message,"error");}finally{pendingUploads--;URL.revokeObjectURL(localUrl);fileInput.disabled=false;if(button)button.classList.remove("is-loading");if(progress)progress.textContent="";if(button&&button.id==="setting-logo-progress")button.textContent="";}};
    reader.onerror=function(){pendingUploads--;URL.revokeObjectURL(localUrl);fileInput.disabled=false;if(button)button.classList.remove("is-loading");if(progress)progress.textContent="";if(button&&button.id==="setting-logo-progress")button.textContent="";UI.toast("File gambar tidak dapat dibaca.","error");};
    reader.readAsDataURL(file);
  }
  
  function setSubmitLoading(button,on){if(!button)return;buttonBusy(button,on);UI.$$("#entity-form button").forEach(function(item){if(item!==button)item.disabled=on;});}
  
  async function saveEntity(event){
    event.preventDefault();if(pendingUploads){UI.toast("Tunggu sampai gambar selesai diunggah.","error");return;}var form=event.currentTarget,button=event.submitter||UI.$("#entity-save"),intent=button&&button.dataset.submitIntent||"save",values=Object.fromEntries(new FormData(form).entries());values.id=currentItem.id||"";
    (schemas[currentType]||[]).forEach(function(def){if(def.t==="checkbox")values[def.k]=Boolean(form.elements[def.k].checked);if(def.t==="number")values[def.k]=Math.round(Number(values[def.k]||0));});if((schemas[currentType]||[]).some(function(def){return def.img&&def.r&&!values[def.k];})){UI.toast("Pilih dan tunggu gambar selesai diunggah.","error");return;}if(["program","update","gallery"].indexOf(currentType)>=0)values.status=intent==="publish"?"published":"draft";
    var map={program:["adminSaveProgram","program"],update:["adminSaveUpdate","update"],gallery:["adminSaveGallery","item"],bank:["adminSaveBank","bank"],package:["adminSavePackage","package"]},m=map[currentType];setSubmitLoading(button,true);
    try{data=await call(m[0],Object.fromEntries([[m[1],values]]));UI.$("#entity-dialog").close();renderAll();API.clearPublicCache();UI.toast(intent==="publish"?"Data berhasil dipublikasikan.":"Data berhasil disimpan.","success");}catch(e){UI.toast(e.message,"error");}finally{setSubmitLoading(button,false);}
  }
  
  async function remove(type,id,title){if(!confirm("Hapus “"+title+"”?"))return;var map={program:"adminDeleteProgram",update:"adminDeleteUpdate",gallery:"adminDeleteGallery",bank:"adminDeleteBank",package:"adminDeletePackage"};await mutate(map[type],{id:id},"Data dihapus.");}
  async function mutate(actionName,payload,message){loading(true);try{data=await call(actionName,payload);renderAll();API.clearPublicCache();UI.toast(message,"success");}catch(e){UI.toast(e.message,"error");}finally{loading(false);}}
  function csvCell(v){var t=String(v==null?"":v);if(/^[=+\-@]/.test(t))t="'"+t;return'"'+t.replace(/"/g,'""')+'"';}
  
  async function exportCsv(){
    try{
      var result=await call("adminExportDonations"),headers=["ID","Program","Paket","Nominal","Nama","Email","WhatsApp","Doa","Metode","Status","Referensi","Dibuat"],rows=(result.donations||[]).map(function(d){return[d.id,d.programTitle,d.packageName,d.amount,d.name,d.email,d.phone,d.prayer,d.paymentMethod,d.status,d.gatewayReference,d.createdAt];});
      var csv="\uFEFF"+[headers].concat(rows).map(function(r){return r.map(csvCell).join(",");}).join("\r\n"),url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})),a=UI.el("a",{href:url,download:"donasi-"+new Date().toISOString().slice(0,10)+".csv"});
      document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);
    }catch(e){UI.toast(e.message,"error");}
  }
  
  function formButton(form){return form.querySelector('button[type="submit"]');}
  async function login(value){token=value;showApp();try{await load();}catch(e){token="";clearToken();showLogin(e.message);}}
  
  window.handleGoogleCredential=function(response){if(response&&response.credential)login(response.credential);};
  
  function initGoogle(){
    if(!config.googleClientId||config.googleClientId.indexOf("PASTE_")===0){UI.$("#login-config-note").classList.remove("hidden");return;}
    var n=0,t=setInterval(function(){
      n++;
      if(window.google&&google.accounts&&google.accounts.id){
        clearInterval(t);
        google.accounts.id.initialize({client_id:config.googleClientId,callback:window.handleGoogleCredential,auto_select:false});
        google.accounts.id.renderButton(UI.$("#google-signin"),{theme:"outline",size:"large",width:320,locale:"id"});
      }else if(n>60)clearInterval(t);
    },100);
  }
  
  document.addEventListener("DOMContentLoaded",function(){
    initGoogle();
    UI.$$(".admin-nav-button").forEach(function(b){b.addEventListener("click",function(){switchSection(b.dataset.section);});});
    UI.$("#admin-menu-button").addEventListener("click",function(){var open=UI.$("#admin-sidebar").classList.toggle("open");this.setAttribute("aria-expanded",String(open));});
    UI.$("#admin-logout").addEventListener("click",function(){token="";data=null;clearToken();showLogin();});
    UI.$$('[data-add]').forEach(function(b){b.addEventListener("click",function(){openEntity(b.dataset.add);});});
    UI.$("#entity-form").addEventListener("submit",saveEntity);
    UI.$("#entity-close").addEventListener("click",function(){UI.$("#entity-dialog").close();});
    UI.$("#entity-cancel").addEventListener("click",function(){UI.$("#entity-dialog").close();});
    UI.$("#proof-dialog").addEventListener("close",function(){UI.$("#admin-proof-image").removeAttribute("src");});
    UI.$("#proof-close").addEventListener("click",function(){UI.$("#proof-dialog").close();});
    UI.$("#search-programs").addEventListener("input",function(){visible.programs=15;renderPrograms();});
    UI.$("#search-donations").addEventListener("input",function(){visible.donations=15;renderDonations();});
    UI.$("#filter-donations").addEventListener("change",function(){visible.donations=15;renderDonations();});
    UI.$("#recalculate").addEventListener("click",function(){var button=this;withButtonBusy(button,function(){return mutate("adminRecalculateTotals",{},"Total berhasil direkonsiliasi.");});});
    UI.$("#export").addEventListener("click",function(){var button=this;withButtonBusy(button,exportCsv);});
    UI.$("#setting-logo-file").addEventListener("change",function(){upload(this,UI.$("#setting-logoUrl"),null,UI.$("#setting-logo-progress"));});
    UI.$("#settings-form").addEventListener("submit",async function(e){
      e.preventDefault();if(pendingUploads){UI.toast("Tunggu sampai gambar selesai diunggah.","error");return;}
      var submitButton=formButton(e.currentTarget);if(submitButton.disabled)return;buttonBusy(submitButton,true);
      var form=e.currentTarget,values=Object.fromEntries(new FormData(form).entries());
      ["qrisEnabled","manualBankEnabled","showDonorNames"].forEach(function(k){values[k]=form.elements[k].checked;});
      values.minimumDonation=Math.round(Number(values.minimumDonation||10000));
      try{data=await call("adminSaveSettings",{settings:values});renderAll();API.clearPublicCache();UI.toast("Pengaturan disimpan.","success");}catch(err){UI.toast(err.message,"error");}finally{buttonBusy(submitButton,false);}
    });
    var existing=savedToken();if(existing)login(existing);else showLogin();
  });
})();