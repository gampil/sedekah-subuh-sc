(function () {
  "use strict";
  var config = window.SEDEKAH_CONFIG || {}, CACHE_KEY = "ssh_public_v5", bootstrapPromise = null;
  
  // Memori cache global agar tidak perlu ambil ulang dari RTDB jika baru saja dibuka
  var memoryCache = null;
  var cacheTime = 0;
  var CACHE_DURATION = 5 * 60 * 1000; // Cache berlaku 5 menit di memori browser

  function timeoutFetch(url, options, timeoutMs) { 
    var controller = new AbortController(), timer = setTimeout(function(){ controller.abort(); }, timeoutMs || config.requestTimeoutMs || 12000); 
    return fetch(url, Object.assign({ credentials:"same-origin" }, options || {}, { signal:controller.signal })).finally(function(){clearTimeout(timer);}); 
  }

  async function request(action, payload, token, method) {
    var useGet = method === "GET", url = new URL(config.apiUrl || "/api/index.php", location.origin), options = { method:useGet?"GET":"POST", cache:"no-store" };
    if (useGet) { url.searchParams.set("action", action); Object.keys(payload||{}).forEach(function(key){ if(payload[key]!==undefined&&payload[key]!==null)url.searchParams.set(key,String(payload[key])); }); }
    else { options.headers={"Content-Type":"application/json"}; options.body=JSON.stringify({action:action,payload:payload||{},adminToken:token||""}); }
    var response=await timeoutFetch(url.href,options,action==="adminUploadImage"||action==="submitTransferProof"||action==="adminGetTransferProof"?(config.uploadTimeoutMs||60000):undefined), result; try{result=await response.json();}catch(error){throw new Error("Respons layanan tidak valid.");}
    if(!response.ok||!result||result.ok!==true)throw new Error(result&&result.error&&result.error.message||"Permintaan gagal diproses."); return result.data;
  }

  function readCache(){try{return JSON.parse(localStorage.getItem(CACHE_KEY)||"null");}catch(error){return null;}}
  function writeCache(data){try{localStorage.setItem(CACHE_KEY,JSON.stringify({savedAt:Date.now(),data:data}));}catch(error){}}

  // Helper untuk mengambil data publik secara kilat langsung dari Firebase RTDB
  async function fetchRTDB(path) {
    var dbUrl = config.firebaseDatabaseUrl;
    if (!dbUrl) return null;
    try {
      var response = await fetch(dbUrl + "/" + path + ".json");
      return await response.json();
    } catch (e) {
      console.error("Gagal mengambil data RTDB:", e);
      return null;
    }
  }

  // Mengambil Bootstrap dengan dukungan Memory Cache & RTDB
  async function fetchBootstrap() {
    var dbUrl = config.firebaseDatabaseUrl;
    if (!dbUrl) return await request("bootstrap", {}, "", "GET");

    // Hanya mengambil data umum yang benar-benar diperlukan global
    var [settingsObj] = await Promise.all([
      fetchRTDB("settings")
    ]);

    if (settingsObj === null) throw new Error("Firebase RTDB tidak dapat diakses.");

    return {
      settings: settingsObj || {},
      programs: [],
      banks: [],
      packages: [],
      gallery: [],
      updates: []
    };
  }

  async function getCollection(path, limit, startKey) {
    var dbUrl = config.firebaseDatabaseUrl;
    if (!dbUrl) throw new Error("Firebase belum dikonfigurasi.");
    var url = dbUrl + "/" + path + ".json?orderBy=%22$key%22&limitToFirst=" + (limit || 7);
    if (startKey) url += "&startAt=%22" + encodeURIComponent(startKey) + "%22";
    var response = await fetch(url);
    if (!response.ok) throw new Error("Gagal mengambil data Firebase.");
    var obj = await response.json();
    if (obj === null) return {items:[], hasMore:false};
    var keys = Object.keys(obj);
    return {
      items: keys.map(function(k){ return Object.assign({id:k}, obj[k]); }),
      hasMore: keys.length >= (limit || 7)
    };
  }

  async function getBootstrap(){
    return await fetchBootstrap();
  }

  async function getProgram(slug){
    var data = await getBootstrap(),
        program = (data.programs || []).find(function(p){
          return p.slug === slug && p.status === "published";
        });
    if (!program) return null;
    program.updates = (data.updates || []).filter(function(u){
      return u.programId === program.id;
    });
    return { program: program, settings: data.settings || {} };
  }

  // Pengambilan Doa & Donasi Publik secara instan langsung dari RTDB
  async function getPublicDonations(page, limit, programId) {
    page = page || 1;
    limit = limit || 50;
    
    var dbUrl = config.firebaseDatabaseUrl;
    if (!dbUrl) {
      return request("publicDonations", { page: page, limit: limit, programId: programId || "" }, "", "GET");
    }

    var donationsObj = await fetchRTDB("donations");
    if (!donationsObj) return { items: [], hasMore: false };

    var boot = await getBootstrap();
    var targetProgram = (boot.programs || []).find(function(p) {
      return p.id === programId || p.slug === programId;
    });
    var targetId = targetProgram ? targetProgram.id : programId;
    var targetSlug = targetProgram ? targetProgram.slug : programId;

    var items = Object.keys(donationsObj).map(function (k) {
      return Object.assign({ id: k }, donationsObj[k]);
    }).filter(function (d) {
      var isPaid = d.status === "paid";
      var matchProgram = !programId || 
                         d.programId === targetId || 
                         d.programId === targetSlug || 
                         d.programSlug === targetSlug;
      return isPaid && matchProgram;
    });

    items.sort(function (a, b) {
      return new Date(b.paidAt || b.createdAt || 0) - new Date(a.paidAt || a.createdAt || 0);
    });

    var start = (page - 1) * limit;
    var paginatedItems = items.slice(start, start + limit);

    return {
      items: paginatedItems,
      hasMore: (start + limit) < items.length
    };
  }

  window.SedekahAPI = {
    isConfigured: function(){ return Boolean(config.apiUrl || config.firebaseDatabaseUrl); },
    isLocalPreview: function(){ return location.protocol==="file:"||["localhost","127.0.0.1","terminal.local"].indexOf(location.hostname)>=0; },
    getBootstrap: getBootstrap,
    getProgram: getProgram,
    getPublicDonations: getPublicDonations,
    getCollection: getCollection,
    getDonationStatus: function(id){ return request("donationStatus",{id:id},"","POST"); },
    createDonation: function(payload){ return request("createDonation",payload,"","POST"); },
    submitTransferProof: function(payload){ return request("submitTransferProof",payload,"","POST"); },
    addAamiin: function(payload){ return request("aamiin",payload,"","POST"); },
    admin: function(action,payload,token){ return request(action,payload||{},token,"POST"); },
    clearPublicCache: function(){ 
      memoryCache = null;
      cacheTime = 0;
      try{localStorage.removeItem(CACHE_KEY);}catch(error){} 
    }
  };
})();