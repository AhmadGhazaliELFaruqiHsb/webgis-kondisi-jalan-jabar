"use strict";
// Modul peta: Leaflet, lapisan, penyorotan, legenda, dan pencarian titik.

const Peta = (() => {
  let map, tilesAktif, labelAktif, ctrlLegenda;
  let lapBatas = null;
  const grupSegmen = L.layerGroup();
  const grupRuas = L.layerGroup();
  const grupSorot = L.layerGroup();
  const grupHasil = L.layerGroup();
  const hasilPerId = new Map();
  let tokenSegmen = 0, tokenRuas = 0;
  let rSegmen = null;
  let aksiKlikTitik = null;
  let kembali = { pilihRuas() {}, detail() {} };
  const visibel = { segmen: true, ruas: false, batas: true };

  const tebal = (z) => (z <= 7 ? 1.8 : z <= 8 ? 2.2 : z <= 9 ? 2.8 : z <= 10 ? 3.4 : z <= 11 ? 4.2 : z <= 12 ? 5 : 6.5);
  const tebalSekarang = () => tebal(map.getZoom());

  const gayaSegmen = (f) => ({ color: INFO[f.properties.kondisi].warna, weight: tebalSekarang(), opacity: 1, lineCap: "round", lineJoin: "round" });
  const gayaBayang = () => ({ color: "#0b0e11", weight: tebalSekarang() + 2.6, opacity: 0.7, lineCap: "round", lineJoin: "round" });
  const gayaRuas = (f) => ({ color: INFO[f.properties.kondisi].warna, weight: Math.max(1.5, tebalSekarang() - 1), opacity: 0.9, lineCap: "round" });
  const gayaSorot = () => ({ color: "#ffffff", weight: tebalSekarang() + 6, opacity: 0.95, lineCap: "round", lineJoin: "round" });

  function isiPopup(p) {
    const k = INFO[p.kondisi];
    return `<div class="pop-nama">${esc(p.nm_ruas)}</div>
      <div class="pop-kab">${esc(judul(p.kab_kota))}</div>
      <div class="pop-baris"><span>Segmen</span><span>Km ${fmt(p.km_awal, 1)} - ${fmt(p.km_akhir, 1)}</span></div>
      <div class="pop-baris"><span>Nilai IRI</span><span>${fmt(p.nilai_iri, 2)} m/km</span></div>
      <div class="pop-baris"><span>Kondisi</span><span class="chip" style="background:${k.warna};color:${k.teks}">${k.nama}</span></div>
      <div class="pop-aksi"><button type="button" class="tombol" data-aksi="detail" data-id="${esc(p.idruas)}">Lihat detail ruas</button></div>`;
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
    ubahDasar("gelap");
    grupSorot.addTo(map);
    grupHasil.addTo(map);
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
      const tombol = e.popup.getElement()?.querySelector('[data-aksi="detail"]');
      if (tombol) tombol.addEventListener("click", () => { kembali.detail(tombol.dataset.id); map.closePopup(); });
    });

    map.on("zoomend", () => {
      grupSegmen.eachLayer((g) => g.setStyle && g.eachLayer && g.setStyle(g.options.style));
      grupRuas.eachLayer((g) => g.setStyle && g.setStyle(g.options.style));
      grupSorot.eachLayer((g) => g.setStyle && g.setStyle(gayaSorot));
      grupHasil.eachLayer((g) => g.options && g.options.dinamis && g.setStyle(g.options.style));
    });
    return map;
  }

  function ubahDasar(kunci) {
    const d = PETA_DASAR[kunci];
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
        L.popup({ maxWidth: 300, className: "pop" }).setLatLng(e.latlng).setContent(isiPopup(p)).openOn(map);
        kembali.pilihRuas(p.idruas, e.latlng);
      }),
    });
    grupSegmen.clearLayers();
    grupSegmen.addLayer(bayang);
    grupSegmen.addLayer(segmen);
    return { data, batas: segmen.getBounds() };
  }

  async function muatRuas(params) {
    const token = ++tokenRuas;
    const data = await api("/api/ruas", params);
    if (token !== tokenRuas) return;
    const lap = L.geoJSON(data, {
      pane: "ruas", style: gayaRuas,
      onEachFeature: (f, layer) => kaitkan(f, layer, (e, p) => kembali.pilihRuas(p.idruas, e.latlng)),
    });
    grupRuas.clearLayers();
    grupRuas.addLayer(lap);
  }

  function atur(nama, nyala) {
    visibel[nama] = nyala;
    const grup = { segmen: grupSegmen, ruas: grupRuas, batas: lapBatas }[nama];
    if (!grup) return;
    if (nyala) grup.addTo(map); else map.removeLayer(grup);
  }

  const bukaPopupSegmen = (latlng, props) => L.popup({ maxWidth: 300 }).setLatLng(latlng).setContent(isiPopup(props)).openOn(map);

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

  function tampilHasil(data) {
    grupHasil.clearLayers();
    hasilPerId.clear();
    const c = [data.pusat.lat, data.pusat.lng];
    grupHasil.addLayer(L.circle(c, { pane: "hasil", radius: data.radius_m, color: "#fff", weight: 1.5, dashArray: "6 6", fillColor: "#fff", fillOpacity: 0.05, interactive: false }));
    grupHasil.addLayer(L.circleMarker(c, { pane: "hasil", radius: 6, color: "#1E2329", weight: 2, fillColor: "#fff", fillOpacity: 1, interactive: false }));
    for (const f of data.features) {
      const gayaHalo = () => ({ color: "#fff", weight: tebalSekarang() + 6, opacity: 0.9, lineCap: "round" });
      const gayaGaris = () => ({ color: INFO[f.properties.kondisi].warna, weight: tebalSekarang() + 1, opacity: 1, lineCap: "round" });
      const halo = L.geoJSON(f, { pane: "sorot", interactive: false, style: gayaHalo });
      const garis = L.geoJSON(f, { pane: "hasil", style: gayaGaris });
      halo.options.dinamis = true;
      garis.options.dinamis = true;
      garis.on("click", (e) => {
        if (aksiKlikTitik) return;
        L.DomEvent.stopPropagation(e);
        bukaPopupSegmen(e.latlng, f.properties);
      });
      grupHasil.addLayer(halo); grupHasil.addLayer(garis);
      hasilPerId.set(f.id, garis);
    }
    map.fitBounds(L.latLng(c).toBounds(data.radius_m * 2), { padding: [30, 30] });
  }
  function bersihHasil() { grupHasil.clearLayers(); hasilPerId.clear(); }
  function fokusHasil(id) {
    const g = hasilPerId.get(id);
    if (!g) return;
    map.fitBounds(g.getBounds(), { padding: [80, 80], maxZoom: 15 });
    const f = g.getLayers()[0].feature;
    bukaPopupSegmen(g.getBounds().getCenter(), f.properties);
  }

  const ukuran = () => map && map.invalidateSize();

  return { init, ubahDasar, muatBatas, muatSegmen, muatRuas, atur, sorotRuas, zoomKe, zoomBatas, bukaPopupSegmen,
           pilihTitik, batalPilihTitik, tampilHasil, bersihHasil, fokusHasil, ukuran,
           get peta() { return map; } };
})();
