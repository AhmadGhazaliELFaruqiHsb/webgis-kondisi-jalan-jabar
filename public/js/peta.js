"use strict";
// Modul peta: Leaflet, lapisan, penyorotan, legenda, dan pencarian titik.

const Peta = (() => {
  let map, tilesAktif, labelAktif, ctrlLegenda;
  let warnaPilih = "#00E5FF";
  let ref = { lingkaran: null, akurasi: null, titik: null, halo: [] };
  let lapBatas = null;
  const grupSegmen = L.layerGroup();
  const grupRuas = L.layerGroup();
  const grupSorot = L.layerGroup();
  const grupHasil = L.layerGroup();
  const grupLokasi = L.layerGroup();
  const hasilPerId = new Map();
  let tokenSegmen = 0, tokenRuas = 0;
  let rSegmen = null;
  let aksiKlikTitik = null;
  let kembali = { pilihRuas() {}, detail() {} };
  const visibel = { segmen: true, ruas: false, batas: true, nasional: true, kabkota: true };
  // jalan nasional dan kab/kota: kondisi dari Temanjabar (bukan survei IRI SIKOJAB), dimuat dari berkas GeoJSON statis
  const grupLain = { nasional: L.layerGroup(), kabkota: L.layerGroup() };
  const sudahMuat = { nasional: false, kabkota: false };
  let kondisiLain = new Set(KONDISI.map((k) => k.nama));
  // jalan non-provinsi (abu-abu, tanpa data kondisi): dimuat dari berkas statis public/data saat pertama dinyalakan

  const tebal = (z) => (z <= 7 ? 1.8 : z <= 8 ? 2.2 : z <= 9 ? 2.8 : z <= 10 ? 3.4 : z <= 11 ? 4.2 : z <= 12 ? 5 : 6.5);
  const tebalSekarang = () => tebal(map.getZoom());

  // mode warna garis: "kondisi" (baik..rusak berat) atau "status" (kewenangan: nasional / provinsi / kab-kota)
  let modeWarna = "kondisi";
  const warnaGaris = (kondisi, status = "provinsi") => (modeWarna === "status" ? STATUS_JALAN[status].warna : INFO[kondisi].warna);
  const gayaSegmen = (f) => ({ color: warnaGaris(f.properties.kondisi), weight: tebalSekarang(), opacity: 1, lineCap: "round", lineJoin: "round" });
  const gayaBayang = () => ({ color: warnaTema("bayang-jalan"), weight: tebalSekarang() + 2.6, opacity: 0.7, lineCap: "round", lineJoin: "round" });
  const gayaRuas = (f) => ({ color: warnaGaris(f.properties.kondisi), weight: Math.max(1.5, tebalSekarang() - 1), opacity: 0.9, lineCap: "round" });
  const gayaSorot = () => ({ color: warnaTema("aksen"), weight: tebalSekarang() + 6, opacity: 0.95, lineCap: "round", lineJoin: "round" });

  // arah segmen (titik awal ke titik akhir garis), agar kamera Street View menghadap sepanjang jalan
  const arahSegmen = (g) => {
    const c = g && g.type === "LineString" ? g.coordinates : null;
    return c && c.length > 1 ? arahKe({ lat: c[0][1], lng: c[0][0] }, { lat: c[c.length - 1][1], lng: c[c.length - 1][0] }) : 0;
  };

  // Pop-up segmen: Street View asli di titik yang diklik (ilustrasi hanya dipakai bila titik tidak diketahui)
  function isiPopup(p, latlng, arah = 0) {
    const k = INFO[p.kondisi];
    const sv = latlng
      ? `<a class="tombol" href="${urlStreetView(latlng.lat, latlng.lng)}" target="_blank" rel="noopener noreferrer" title="Buka Street View di tab baru">Layar penuh</a>
         <a class="tombol" href="${urlGoogleMaps(latlng.lat, latlng.lng)}" target="_blank" rel="noopener noreferrer" title="Buka lokasi ini di Google Maps (tab baru)">Google Maps ↗</a>`
      : "";
    const foto = latlng
      ? `<div class="pop-sv"><iframe src="${urlStreetViewSemat(latlng.lat, latlng.lng, arah)}" title="Google Street View ${esc(p.nm_ruas)}"
           referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe></div>
         <div class="pop-cap">Google Street View, tanggal foto berbeda dengan survei 2021</div>`
      : `<img class="pop-foto" src="${k.gambar}" alt="Ilustrasi jalan kondisi ${k.nama.toLowerCase()}">
         <div class="pop-cap">Ilustrasi umum kondisi ${k.nama.toLowerCase()}, bukan foto ruas ini</div>`;
    return `${foto}
      <div class="pop-nama">${esc(p.nm_ruas)}</div>
      <div class="pop-kab">${esc(judul(p.kab_kota))}</div>
      <div class="pop-baris"><span>Segmen</span><span>Km ${fmt(p.km_awal, 1)} - ${fmt(p.km_akhir, 1)}</span></div>
      <div class="pop-baris"><span>Status jalan</span><span>Jalan provinsi</span></div>
      <div class="pop-baris"><span>Nilai IRI</span><span>${fmt(p.nilai_iri, 2)} m/km</span></div>
      <div class="pop-baris"><span>Kondisi</span><span class="chip" style="background:${k.warna};color:${k.teks}">${k.nama}</span></div>
      <div class="pop-aksi"><button type="button" class="tombol" data-aksi="detail" data-id="${esc(p.idruas)}">Lihat detail ruas</button>${latlng
        ? `<button type="button" class="tombol tombol-isi" data-aksi="foto" data-lat="${latlng.lat}" data-lng="${latlng.lng}" data-nama="${esc(p.nm_ruas)}"
             title="Foto lapangan di sekitar titik ini, per tahun">Foto per tahun</button>` : ""}${sv}</div>`;
  }

  function kaitkan(feature, layer, aksiKlik) {
    const p = feature.properties;
    layer.bindTooltip(`<strong>${esc(p.nm_ruas)}</strong><br>${p.kondisi}, IRI ${fmt(p.nilai_iri ?? p.iri_rata2, 2)}`, { sticky: true, className: "tip", opacity: 1 });
    layer.on("mouseover", () => layer.setStyle({ weight: layer.options.weight + 2 }));
    layer.on("mouseout", () => layer.setStyle({ weight: layer.options.weight - 2 }));
    layer.on("click", (e) => {
      if (aksiKlikTitik) return; // mode "pilih titik": biarkan klik diteruskan ke peta
      L.DomEvent.stopPropagation(e);
      aksiKlik(e, p);
    });
  }

  function init(opsi) {
    kembali = opsi;
    map = L.map("peta", { zoomControl: false, preferCanvas: true, minZoom: 6, maxZoom: 18, center: [-6.9, 107.6], zoom: 8 });
    FotoLokasi.pasang(map);
    // tata letak ala Google Maps: zoom dan "lokasi saya" di kanan bawah, pilihan lapisan di kiri bawah
    L.control.zoom({ position: "bottomright" }).addTo(map);
    const ctrlLokasi = L.control({ position: "bottomright" });
    ctrlLokasi.onAdd = () => {
      const b = L.DomUtil.create("button", "tombol-peta");
      b.type = "button"; b.title = "Lokasi saya"; b.setAttribute("aria-label", "Tampilkan jalan rusak di sekitar lokasi saya");
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8"/></svg>';
      L.DomEvent.disableClickPropagation(b);
      b.addEventListener("click", () => kembali.lokasi && kembali.lokasi());
      return b;
    };
    ctrlLokasi.addTo(map);

    // Panel "Lapisan peta" (pola tata letak seperti aplikasi peta umumnya; gambar pratinjau diambil dari ubin
    // peta dasar milik aplikasi ini sendiri, ikon digambar sendiri; tidak memakai aset atau ubin Google)
    // gelap/terang tidak ditampilkan sebagai pilihan: "Standar" otomatis memakai salah satunya sesuai tema
    const pratinjau = (k) => PETA_DASAR[k === "standar" ? "jalan" : k].url.replace("{z}", 10).replace("{x}", 818).replace("{y}", 531); // Bandung
    const ikonDetail = {
      lapSegmen: '<svg viewBox="0 0 48 32"><rect width="48" height="32" fill="#eef1f4"/><path d="M4 26 L16 18 L28 20 L44 6" stroke="#2E9E4F" stroke-width="4" fill="none"/><path d="M16 18 L28 20" stroke="#F2B705" stroke-width="4"/><path d="M28 20 L36 13" stroke="#F08A24" stroke-width="4"/><path d="M36 13 L44 6" stroke="#D63A2F" stroke-width="4"/></svg>',
      lapRuas: '<svg viewBox="0 0 48 32"><rect width="48" height="32" fill="#eef1f4"/><path d="M4 8 C14 10 18 24 28 22 S40 10 44 12" stroke="#F08A24" stroke-width="5" fill="none" stroke-linecap="round"/></svg>',
      lapNasional: '<svg viewBox="0 0 48 32"><rect width="48" height="32" fill="#eef1f4"/><path d="M2 26 C14 22 22 10 46 6" stroke="#2E9E4F" stroke-width="4.5" fill="none"/><path d="M30 12 C36 10 40 8 46 6" stroke="#F2B705" stroke-width="4.5" fill="none"/></svg>',
      lapKabkota: '<svg viewBox="0 0 48 32"><rect width="48" height="32" fill="#eef1f4"/><path d="M4 6 L20 14 L18 28" stroke="#F08A24" stroke-width="2" fill="none"/><path d="M20 14 L44 10" stroke="#2E9E4F" stroke-width="2" fill="none"/><path d="M30 12 L34 30" stroke="#D63A2F" stroke-width="2" fill="none"/><path d="M8 22 L18 20" stroke="#F2B705" stroke-width="2" fill="none"/></svg>',
      lapBatas: '<svg viewBox="0 0 48 32"><rect width="48" height="32" fill="#eef1f4"/><path d="M6 6 L30 4 L42 14 L38 28 L12 26 Z" stroke="#5F6B78" stroke-width="2" stroke-dasharray="4 3" fill="none"/></svg>',
    };
    const NAMA_DETAIL = { lapSegmen: "Jalan provinsi", lapRuas: "Ruas rata-rata", lapNasional: "Jalan nasional", lapKabkota: "Jalan kab/kota", lapBatas: "Batas provinsi" };
    const ctrlLapisan = L.control({ position: "bottomleft" });
    ctrlLapisan.onAdd = () => {
      const d = L.DomUtil.create("div", "kontrol-lapisan");
      d.innerHTML = `<button type="button" class="tombol-lapisan" aria-expanded="false" aria-controls="menuLapisan" title="Lapisan peta">
          <img src="${pratinjau("satelit")}" alt=""><span>Lapisan</span></button>
        <div class="panel-lapisan" id="menuLapisan" role="dialog" aria-label="Lapisan peta" hidden>
          <div class="pl-kepala"><strong>Lapisan peta</strong>
            <button type="button" class="pl-tutup" aria-label="Tutup">×</button></div>
          <p class="pl-judul">Jenis peta</p>
          <div class="pl-grid">${JENIS_PETA.map((k) => `<button type="button" class="pl-ubin" data-k="${k}" aria-pressed="false">
              <img src="${pratinjau(k)}" alt="" loading="lazy" class="${k === "standar" ? "dasar-redup" : ""}"><span>${namaJenisPeta(k)}</span></button>`).join("")}</div>
          <p class="pl-judul">Warnai jalan menurut</p>
          <div class="pl-mode">
            <button type="button" data-mode-warna="kondisi" aria-pressed="true">Kondisi</button>
            <button type="button" data-mode-warna="status" aria-pressed="false">Status jalan</button>
          </div>
          <p class="pl-judul">Detail peta</p>
          <div class="pl-grid">${Object.keys(ikonDetail).map((id) => `<button type="button" class="pl-ubin" data-lap="${id}" aria-pressed="false">
              ${ikonDetail[id]}<span>${NAMA_DETAIL[id]}</span></button>`).join("")}</div>
          <p class="pl-judul">Alat peta</p>
          <div class="pl-grid">
            <button type="button" class="pl-ubin" data-alat="titik"><svg viewBox="0 0 48 32"><rect width="48" height="32" fill="#eef1f4"/><circle cx="24" cy="16" r="11" fill="rgba(45,59,255,.12)" stroke="#2D3BFF" stroke-width="1.5"/><circle cx="24" cy="16" r="3" fill="#2D3BFF"/></svg><span>Jalan rusak di sekitar titik</span></button>
            <button type="button" class="pl-ubin" data-alat="lokasi"><svg viewBox="0 0 48 32"><rect width="48" height="32" fill="#eef1f4"/><circle cx="24" cy="16" r="5" fill="#2D3BFF" stroke="#fff" stroke-width="2"/><circle cx="24" cy="16" r="10" fill="none" stroke="#2D3BFF" stroke-opacity=".35" stroke-width="3"/></svg><span>Lokasi saya</span></button>
          </div>
        </div>`;
      L.DomEvent.disableClickPropagation(d);
      L.DomEvent.disableScrollPropagation(d);
      const tombol = d.querySelector(".tombol-lapisan"), menu = d.querySelector(".panel-lapisan");
      const segarDetail = () => {
        for (const b of menu.querySelectorAll("[data-lap]")) {
          const c = document.getElementById(b.dataset.lap);
          b.setAttribute("aria-pressed", String(!!(c && c.checked)));
        }
      };
      const buka = (b) => { menu.hidden = !b; tombol.setAttribute("aria-expanded", String(b)); if (b) segarDetail(); };
      tombol.addEventListener("click", () => buka(menu.hidden));
      menu.querySelector(".pl-tutup").addEventListener("click", () => buka(false));
      menu.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        if (b.dataset.k) kembali.pilihDasar && kembali.pilihDasar(b.dataset.k);
        if (b.dataset.modeWarna) ubahModeWarna(b.dataset.modeWarna);
        if (b.dataset.lap) { // menyalakan/mematikan lapisan lewat kotak centang yang sama di panel samping
          const c = document.getElementById(b.dataset.lap);
          if (c) { c.checked = !c.checked; c.dispatchEvent(new Event("change", { bubbles: true })); segarDetail(); }
        }
        if (b.dataset.alat) {
          buka(false);
          if (b.dataset.alat === "lokasi") kembali.lokasi && kembali.lokasi();
          else document.getElementById("btnTitik")?.click();
        }
      });
      document.addEventListener("change", (e) => { if (e.target.id in ikonDetail) segarDetail(); });
      document.addEventListener("click", (e) => { if (!d.contains(e.target)) buka(false); });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) buka(false); });
      return d;
    };
    ctrlLapisan.addTo(map);
    L.control.scale({ metric: true, imperial: false, position: "bottomleft" }).addTo(map);

    // urutan tumpukan: batas < ruas < bayangan < sorotan < segmen < hasil pencarian titik
    [["batas", 350], ["lain", 370], ["ruas", 380], ["bayang", 400], ["sorot", 405], ["segmen", 410], ["hasil", 420]].forEach(([n, z]) => {
      map.createPane(n).style.zIndex = z;
    });

    rSegmen = L.canvas({ pane: "segmen", padding: 0.4, tolerance: 6 });
    ubahDasar(JENIS_BAWAAN === "standar" ? dasarAwal() : JENIS_BAWAAN);
    grupSorot.addTo(map);
    grupHasil.addTo(map);
    grupLokasi.addTo(map);
    grupSegmen.addTo(map);

    // legenda
    ctrlLegenda = L.control({ position: "topright" });
    ctrlLegenda.onAdd = () => {
      const d = L.DomUtil.create("div", "legenda");
      d.innerHTML = `<h4 role="button" tabindex="0" aria-expanded="true" title="Klik untuk menyembunyikan atau menampilkan">Kondisi jalan</h4><ul>${KONDISI.map((k) =>
        `<li><i style="background:${k.warna}"></i>${k.nama}<span>${k.rentang.replace("IRI ", "")}</span></li>`).join("")}</ul>
        <ul class="leg-status" hidden>${Object.values(STATUS_JALAN).map((s) =>
        `<li><i style="background:${s.warna}"></i>${s.nama}<span>${fmt(s.km_bps, 0)} km</span></li>`).join("")}</ul>
        <p class="leg-status" hidden>Panjang menurut BPS 2019 (Jawa Barat). Jalan nasional dikelola Kementerian PU, provinsi oleh DBMPR Jawa Barat, kab/kota oleh pemerintah kab/kota.</p>
        <p><b>Garis tebal</b>: jalan provinsi, IRI Roadroid Jan 2021.<br><b>Garis tipis</b>: jalan nasional (Feb 2024) dan kab/kota, warna = kondisi terpanjang.</p>`;
      L.DomEvent.disableClickPropagation(d);
      const judulLegenda = d.querySelector("h4");
      const alih = (tutup) => { d.classList.toggle("tutup", tutup); judulLegenda.setAttribute("aria-expanded", String(!tutup)); };
      judulLegenda.addEventListener("click", () => alih(!d.classList.contains("tutup")));
      judulLegenda.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alih(!d.classList.contains("tutup")); } });
      if (window.matchMedia("(max-width: 860px)").matches) alih(true); // di ponsel, legenda mulai terlipat
      return d;
    };
    ctrlLegenda.addTo(map);

    // koordinat kursor
    const koor = L.control({ position: "bottomleft" });
    koor.onAdd = () => { const d = L.DomUtil.create("div", "koordinat"); d.id = "koordinat"; d.textContent = "Arahkan kursor ke peta"; return d; };
    koor.addTo(map);
    map.on("mousemove", (e) => {
      const d = document.getElementById("koordinat");
      if (d) d.textContent = `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}  zoom ${map.getZoom()}`;
    });

    // klik peta: dipakai alat "titik di peta"
    map.on("click", (e) => {
      if (aksiKlikTitik) { const f = aksiKlikTitik; aksiKlikTitik = null; map.getContainer().classList.remove("mode-titik"); f(e.latlng); }
    });

    // tombol "Lihat detail ruas" di pop-up
    map.on("popupopen", (e) => {
      map.eachLayer((l) => l.closeTooltip && l.closeTooltip()); // tooltip hover tidak menimpa pop-up
      const tombol = e.popup.getElement()?.querySelector('[data-aksi="detail"]');
      if (tombol) tombol.addEventListener("click", () => { kembali.detail(tombol.dataset.id); map.closePopup(); });
      const tFoto = e.popup.getElement()?.querySelector('[data-aksi="foto"]');
      if (tFoto) tFoto.addEventListener("click", () =>
        FotoLokasi.buka(Number(tFoto.dataset.lat), Number(tFoto.dataset.lng), tFoto.dataset.nama));
    });

    map.on("zoomend", segarkanGaya);
    return map;
  }

  // gambar ulang gaya garis (dipakai saat zoom berubah dan saat tema berganti)
  function ubahModeWarna(mode) {
    modeWarna = mode;
    segarkanGaya();
    for (const j of Object.keys(grupLain)) grupLain[j].eachLayer((g) => g.setStyle && g.setStyle(gayaLain(j)));
    const leg = ctrlLegenda && ctrlLegenda.getContainer();
    if (leg) {
      leg.querySelector("h4").textContent = mode === "status" ? "Status jalan (kewenangan)" : "Kondisi jalan";
      leg.querySelectorAll(":scope > ul:not(.leg-status), :scope > p:not(.leg-status)").forEach((e) => (e.hidden = mode === "status"));
      leg.querySelectorAll(".leg-status").forEach((e) => (e.hidden = mode !== "status"));
    }
    document.querySelectorAll("[data-mode-warna]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.modeWarna === mode));
  }

  function segarkanGaya() {
    grupSegmen.eachLayer((g) => g.setStyle && g.eachLayer && g.setStyle(g.options.style));
    grupRuas.eachLayer((g) => g.setStyle && g.setStyle(g.options.style));
    grupSorot.eachLayer((g) => g.setStyle && g.setStyle(gayaSorot));
    grupHasil.eachLayer((g) => g.options && g.options.dinamis && g.setStyle(g.options.style));
    ref.halo.forEach((h) => h.setStyle(h.options.style));
  }

  function ubahDasar(kunci) {
    const d = PETA_DASAR[kunci];
    warnaPilih = d.pilih;
    document.documentElement.style.setProperty("--pilih", warnaPilih);
    document.documentElement.style.setProperty("--pilih-teks", d.teksPilih);
    terapkanWarnaPilih();
    if (tilesAktif) map.removeLayer(tilesAktif);
    if (labelAktif) { map.removeLayer(labelAktif); labelAktif = null; }
    tilesAktif = L.tileLayer(d.url, d.opsi).addTo(map);
    tilesAktif.bringToBack();
    if (d.label) labelAktif = L.tileLayer(d.label, d.opsi).addTo(map); // tulisan di atas peta dasar, di bawah garis jalan
    const menu = document.getElementById("menuLapisan");
    if (menu) for (const b of menu.querySelectorAll("[data-k]")) b.setAttribute("aria-pressed", String(b.dataset.k === jenisDariDasar(kunci)));
  }

  // Ruang peta yang tertutup panel melayang (desktop), agar zoom ke ruas tidak jatuh di belakang panel
  function ruangPanel() {
    const sisi = document.getElementById("sisi");
    const melayang = window.matchMedia("(min-width: 861px)").matches && !document.body.classList.contains("sisi-tutup");
    return melayang && sisi ? sisi.getBoundingClientRect().right - map.getContainer().getBoundingClientRect().left : 0;
  }
  const isi = (p) => ({ paddingTopLeft: [p + ruangPanel(), p + 56], paddingBottomRight: [p, p] });

  async function muatBatas() {
    const data = await api("/api/batas");
    if (lapBatas) map.removeLayer(lapBatas);
    lapBatas = L.geoJSON(data, { pane: "batas", interactive: false, style: { color: "#8c98a6", weight: 1.4, dashArray: "5 5", fill: false, opacity: 0.9 } });
    if (visibel.batas) lapBatas.addTo(map);
    return lapBatas.getBounds();
  }

  async function muatSegmen(params) {
    const token = ++tokenSegmen;
    const data = await api("/api/segmen", params);
    if (token !== tokenSegmen) return null; // ada permintaan yang lebih baru
    const bayang = L.geoJSON(data, { pane: "bayang", interactive: false, style: gayaBayang });
    const segmen = L.geoJSON(data, {
      pane: "segmen", renderer: rSegmen, style: gayaSegmen,
      onEachFeature: (f, layer) => kaitkan(f, layer, (e, p) => {
        L.popup({ maxWidth: 300, className: "pop" }).setLatLng(e.latlng).setContent(isiPopup(p, e.latlng, arahSegmen(f.geometry))).openOn(map);
        kembali.pilihRuas(p.idruas, e.latlng);
        FotoLokasi.strip(e.latlng.lat, e.latlng.lng, p.nm_ruas, arahSegmen(f.geometry)); // deretan foto di bawah peta, seperti Google Maps
      }),
    });
    grupSegmen.clearLayers();
    grupSegmen.addLayer(bayang);
    grupSegmen.addLayer(segmen);
    grupHasil.eachLayer((l) => l.options && l.options.dinamis && l.bringToFront());
    return { data, batas: segmen.getBounds() };
  }

  async function muatRuas(params) {
    const token = ++tokenRuas;
    const data = await api("/api/ruas", params);
    if (token !== tokenRuas) return;
    const lap = L.geoJSON(data, {
      pane: "segmen", renderer: rSegmen, style: gayaRuas,
      onEachFeature: (f, layer) => kaitkan(f, layer, (e, p) => kembali.pilihRuas(p.idruas, e.latlng)),
    });
    grupRuas.clearLayers();
    grupRuas.addLayer(lap);
    lap.bringToBack(); // ruas digambar di bawah segmen
  }

  function atur(nama, nyala) {
    visibel[nama] = nyala;
    if (nama in grupLain) return aturLain(nama, nyala);
    const grup = { segmen: grupSegmen, ruas: grupRuas, batas: lapBatas }[nama];
    if (!grup) return;
    if (nyala) grup.addTo(map); else map.removeLayer(grup);
    if (nama === "ruas" && nyala) grupRuas.eachLayer((l) => l.bringToBack && l.bringToBack());
  }

  // ---------------------------------------------------------------- jalan nasional dan kab/kota
  const GAYA_LAIN = { nasional: { weight: 3.2, opacity: 0.95 }, kabkota: { weight: 1.5, opacity: 0.85 } };
  const NAMA_LAIN = { nasional: "Jalan nasional", kabkota: "Jalan kabupaten/kota" };
  const gayaLain = (jenis) => (f) => ({ ...GAYA_LAIN[jenis], color: warnaGaris(f.properties.kelas, jenis),
    opacity: kondisiLain.has(f.properties.kelas) ? GAYA_LAIN[jenis].opacity : 0, interactive: kondisiLain.has(f.properties.kelas) });
  async function muatLain(jenis) {
    const r = await fetch(`data/kondisi_${jenis}.geojson`);
    if (!r.ok) throw new Error(`Data ${NAMA_LAIN[jenis].toLowerCase()} belum tersedia.`);
    const data = await r.json();
    const rLain = L.canvas({ pane: "lain", padding: 0.4, tolerance: 4 });
    grupLain[jenis].addLayer(L.geoJSON(data, {
      pane: "lain", renderer: rLain, style: gayaLain(jenis),
      onEachFeature: (f, l) => {
        const p = f.properties;
        l.bindTooltip(() => `<strong>${esc(p.nama)}</strong><br>Status: <b>${NAMA_LAIN[jenis]}</b>${p.kab ? `, ${esc(p.kab)}` : ""}<br>
          <span class="chip" style="background:${INFO[p.kelas].warna};color:${INFO[p.kelas].teks}">${p.kelas}</span> mantap ${fmt(p.mantap, 1)}%<br>
          <small>Baik ${fmt(p.persen[0], 0)}% · Sedang ${fmt(p.persen[1], 0)}% · R. ringan ${fmt(p.persen[2], 0)}% · R. berat ${fmt(p.persen[3], 0)}%<br>Sumber: ${esc(p.sumber)}</small>`,
          { sticky: true, className: "tip", opacity: 1 });
      },
    }));
    sudahMuat[jenis] = true;
  }
  async function aturLain(jenis, nyala) {
    visibel[jenis] = nyala;
    if (!nyala) { map.removeLayer(grupLain[jenis]); return; }
    if (!sudahMuat[jenis]) await muatLain(jenis);
    if (visibel[jenis]) grupLain[jenis].addTo(map);
  }
  // filter kondisi juga berlaku untuk jalan nasional dan kab/kota
  function saringLain(kondisi) {
    kondisiLain = new Set(kondisi);
    for (const j of Object.keys(grupLain)) grupLain[j].eachLayer((g) => g.setStyle && g.setStyle(gayaLain(j)));
  }

  const bukaPopupSegmen = (latlng, props, arah = 0) => {
    FotoLokasi.strip(latlng.lat, latlng.lng, props.nm_ruas, arah);
    return L.popup({ maxWidth: 300, className: "pop" }).setLatLng(latlng).setContent(isiPopup(props, latlng, arah)).openOn(map);
  };

  function sorotRuas(geometri) {
    grupSorot.clearLayers();
    if (!geometri) return;
    grupSorot.addLayer(L.geoJSON(geometri, { pane: "sorot", interactive: false, style: gayaSorot }));
  }

  const zoomKe = (bbox, maxZoom = 15) => map.fitBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]], { ...isi(40), maxZoom });
  const zoomBatas = (b) => b && b.isValid() && map.fitBounds(b, isi(20));

  // ---------- alat: jalan rusak di sekitar titik ----------
  function pilihTitik(aksi) { aksiKlikTitik = aksi; map.getContainer().classList.add("mode-titik"); }
  function batalPilihTitik() { aksiKlikTitik = null; map.getContainer().classList.remove("mode-titik"); }

  // gaya seleksi: semuanya memakai warna "berlawanan" (warnaPilih)
  const gayaLingkaran = () => ({ color: warnaPilih, weight: 2.5, opacity: 1, dashArray: "8 6", fillColor: warnaPilih, fillOpacity: 0.1 });
  const gayaAkurasi = () => ({ color: warnaPilih, weight: 1, opacity: 0.55, fillColor: warnaPilih, fillOpacity: 0.07 });
  const gayaTitik = () => ({ color: "#ffffff", weight: 2.5, fillColor: warnaPilih, fillOpacity: 1, radius: 7 });
  const gayaHalo = () => ({ color: warnaPilih, weight: tebalSekarang() + 7, opacity: 0.85, lineCap: "round", lineJoin: "round" });

  function terapkanWarnaPilih() {
    if (ref.lingkaran) ref.lingkaran.setStyle(gayaLingkaran());
    if (ref.akurasi) ref.akurasi.setStyle(gayaAkurasi());
    if (ref.titik) ref.titik.setStyle(gayaTitik());
    ref.halo.forEach((h) => h.setStyle(h.options.style));
  }

  // opsi.akurasi (meter) = lingkaran ketidakpastian lokasi GPS; opsi.fit = geser peta ke area hasil
  function tampilHasil(data, { akurasi = null, fit = true } = {}) {
    grupHasil.clearLayers();
    grupLokasi.clearLayers();
    hasilPerId.clear();
    ref = { lingkaran: null, akurasi: null, titik: null, halo: [] };
    const c = [data.pusat.lat, data.pusat.lng];
    ref.lingkaran = L.circle(c, { pane: "hasil", radius: data.radius_m, interactive: false, ...gayaLingkaran() });
    grupHasil.addLayer(ref.lingkaran);
    if (akurasi && akurasi > 1) {
      ref.akurasi = L.circle(c, { pane: "hasil", radius: akurasi, interactive: false, ...gayaAkurasi() });
      grupLokasi.addLayer(ref.akurasi);
    }
    ref.titik = L.circleMarker(c, { pane: "hasil", interactive: false, ...gayaTitik() });
    grupLokasi.addLayer(ref.titik);
    for (const f of data.features) {
      const gayaGaris = () => ({ color: INFO[f.properties.kondisi].warna, weight: tebalSekarang() + 1, opacity: 1, lineCap: "round" });
      const halo = L.geoJSON(f, { pane: "sorot", interactive: false, style: gayaHalo });
      const garis = L.geoJSON(f, { pane: "segmen", renderer: rSegmen, style: gayaGaris });
      garis.options.dinamis = true;
      garis.on("click", (e) => {
        if (aksiKlikTitik) return;
        L.DomEvent.stopPropagation(e);
        bukaPopupSegmen(e.latlng, f.properties, arahSegmen(f.geometry));
      });
      grupHasil.addLayer(halo); grupHasil.addLayer(garis);
      garis.bringToFront();
      ref.halo.push(halo);
      hasilPerId.set(f.id, garis);
    }
    if (fit) map.fitBounds(L.latLng(c).toBounds(data.radius_m * 2), isi(30));
  }
  function bersihHasil() {
    grupHasil.clearLayers(); grupLokasi.clearLayers(); hasilPerId.clear();
    ref = { lingkaran: null, akurasi: null, titik: null, halo: [] };
  }
  function fokusHasil(id) {
    const g = hasilPerId.get(id);
    if (!g) return;
    const garis = g.getLayers()[0];
    const titik = garis.getLatLngs();
    // pop-up dibuka setelah peta selesai bergeser, agar geser-otomatisnya tidak bentrok dengan animasi zoom
    map.once("moveend", () =>
      bukaPopupSegmen(titik[Math.floor(titik.length / 2)], garis.feature.properties, arahSegmen(garis.feature.geometry))); // titik di jalan
    map.fitBounds(g.getBounds(), { ...isi(70), maxZoom: 15 });
  }
  const jarakMeter = (a, b) => map.distance([a.lat, a.lng], [b.lat, b.lng]);

  const ukuran = () => map && map.invalidateSize();

  return { init, ubahDasar, ubahModeWarna, segarkanGaya, muatBatas, muatSegmen, muatRuas, atur, saringLain, sorotRuas, zoomKe, zoomBatas, bukaPopupSegmen,
           pilihTitik, batalPilihTitik, tampilHasil, bersihHasil, fokusHasil, jarakMeter, ukuran,
           get peta() { return map; } };
})();
