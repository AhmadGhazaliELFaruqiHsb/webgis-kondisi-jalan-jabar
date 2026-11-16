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
  const visibel = { segmen: true, ruas: false, batas: true };

  const tebal = (z) => (z <= 7 ? 1.8 : z <= 8 ? 2.2 : z <= 9 ? 2.8 : z <= 10 ? 3.4 : z <= 11 ? 4.2 : z <= 12 ? 5 : 6.5);
  const tebalSekarang = () => tebal(map.getZoom());

  const gayaSegmen = (f) => ({ color: INFO[f.properties.kondisi].warna, weight: tebalSekarang(), opacity: 1, lineCap: "round", lineJoin: "round" });
  const gayaBayang = () => ({ color: warnaTema("bayang-jalan"), weight: tebalSekarang() + 2.6, opacity: 0.7, lineCap: "round", lineJoin: "round" });
  const gayaRuas = (f) => ({ color: INFO[f.properties.kondisi].warna, weight: Math.max(1.5, tebalSekarang() - 1), opacity: 0.9, lineCap: "round" });
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
      ? `<a class="tombol" href="${urlStreetView(latlng.lat, latlng.lng)}" target="_blank" rel="noopener noreferrer" title="Buka Street View di tab baru">Layar penuh</a>`
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
      <div class="pop-baris"><span>Nilai IRI</span><span>${fmt(p.nilai_iri, 2)} m/km</span></div>
      <div class="pop-baris"><span>Kondisi</span><span class="chip" style="background:${k.warna};color:${k.teks}">${k.nama}</span></div>
      <div class="pop-aksi"><button type="button" class="tombol" data-aksi="detail" data-id="${esc(p.idruas)}">Lihat detail ruas</button>${sv}</div>`;
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
    L.control.zoom({ position: "topright" }).addTo(map);
    L.control.scale({ metric: true, imperial: false, position: "bottomleft" }).addTo(map);

    // urutan tumpukan: batas < ruas < bayangan < sorotan < segmen < hasil pencarian titik
    [["batas", 350], ["ruas", 380], ["bayang", 400], ["sorot", 405], ["segmen", 410], ["hasil", 420]].forEach(([n, z]) => {
      map.createPane(n).style.zIndex = z;
    });

    rSegmen = L.canvas({ pane: "segmen", padding: 0.4, tolerance: 6 });
    ubahDasar(temaTerang() ? "terang" : "gelap");
    grupSorot.addTo(map);
    grupHasil.addTo(map);
    grupLokasi.addTo(map);
    grupSegmen.addTo(map);

    // legenda
    ctrlLegenda = L.control({ position: "bottomright" });
    ctrlLegenda.onAdd = () => {
      const d = L.DomUtil.create("div", "legenda");
      d.innerHTML = `<h4 role="button" tabindex="0" aria-expanded="true" title="Klik untuk menyembunyikan atau menampilkan">Kondisi jalan</h4><ul>${KONDISI.map((k) =>
        `<li><i style="background:${k.warna}"></i>${k.nama}<span>${k.rentang.replace("IRI ", "")}</span></li>`).join("")}</ul>
        <p>IRI dalam m/km. Survei Roadroid, Jan 2021</p>`;
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
    });

    map.on("zoomend", segarkanGaya);
    return map;
  }

  // gambar ulang gaya garis (dipakai saat zoom berubah dan saat tema berganti)
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
  }

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
    const grup = { segmen: grupSegmen, ruas: grupRuas, batas: lapBatas }[nama];
    if (!grup) return;
    if (nyala) grup.addTo(map); else map.removeLayer(grup);
    if (nama === "ruas" && nyala) grupRuas.eachLayer((l) => l.bringToBack && l.bringToBack());
  }

  const bukaPopupSegmen = (latlng, props, arah = 0) =>
    L.popup({ maxWidth: 300, className: "pop" }).setLatLng(latlng).setContent(isiPopup(props, latlng, arah)).openOn(map);

  function sorotRuas(geometri) {
    grupSorot.clearLayers();
    if (!geometri) return;
    grupSorot.addLayer(L.geoJSON(geometri, { pane: "sorot", interactive: false, style: gayaSorot }));
  }

  const zoomKe = (bbox, maxZoom = 15) => map.fitBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]], { padding: [40, 40], maxZoom });
  const zoomBatas = (b) => b && b.isValid() && map.fitBounds(b, { padding: [30, 30] });

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
    if (fit) map.fitBounds(L.latLng(c).toBounds(data.radius_m * 2), { padding: [30, 30] });
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
    map.fitBounds(g.getBounds(), { padding: [80, 80], maxZoom: 15 });
  }
  const jarakMeter = (a, b) => map.distance([a.lat, a.lng], [b.lat, b.lng]);

  const ukuran = () => map && map.invalidateSize();

  return { init, ubahDasar, segarkanGaya, muatBatas, muatSegmen, muatRuas, atur, sorotRuas, zoomKe, zoomBatas, bukaPopupSegmen,
           pilihTitik, batalPilihTitik, tampilHasil, bersihHasil, fokusHasil, jarakMeter, ukuran,
           get peta() { return map; } };
})();
