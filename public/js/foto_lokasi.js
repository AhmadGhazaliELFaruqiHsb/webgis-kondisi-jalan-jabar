"use strict";
// Foto lapangan di sekitar titik yang diklik, dari GET /api/foto (Temanjabar: dokumentasi pemeliharaan DBMPR,
// dan Wikimedia Commons), dikelompokkan per tahun 2018-2025 (rentang data Galura).
//  - strip  : deretan foto di bawah peta, seperti Google Maps (Street View + foto), dengan pilihan tahun
//  - jendela: tampilan lengkap per tahun (foto sebelum / saat / sesudah pekerjaan)
//  - titik  : lokasi setiap foto ditandai titik biru di peta
// Tahun tanpa foto ditampilkan apa adanya. Street View Google hanya dibuka lewat tautan (fotonya tidak boleh diambil).

const FotoLokasi = (() => {
  const NAMA_SUMBER = { temanjabar: "Temanjabar (DBMPR)", commons: "Wikimedia Commons" };
  const cache = new Map();
  let map = null, lapTitik = null, strip = null, dlg = null;
  let titik = null, data = null, tahunStrip = "semua", tahunDlg = null;

  const tgl = (s, panjang) => (s ? new Date(s + "T00:00:00").toLocaleDateString("id-ID",
    panjang ? { day: "numeric", month: "short", year: "numeric" } : { month: "short", year: "numeric" }) : "tanpa tanggal");
  const tahunDari = (f) => (f.tanggal || "").slice(0, 4);

  async function ambil(lat, lng, radius) {
    const k = `${lat.toFixed(5)},${lng.toFixed(5)},${radius}`;
    if (!cache.has(k)) cache.set(k, api("/api/foto", { lat: lat.toFixed(6), lng: lng.toFixed(6), radius }));
    try { return await cache.get(k); } catch (e) { cache.delete(k); throw e; }
  }

  // ------------------------------------------------------------ titik foto di peta
  function gambarTitik() {
    if (!lapTitik) return;
    lapTitik.clearLayers();
    if (!data) return;
    pilihanStrip().forEach((f, i) => {
      if (f.lat == null) return;
      L.circleMarker([f.lat, f.lng], { pane: "hasil", radius: 6, color: "#FFFFFF", weight: 2, fillColor: "#1A73E8", fillOpacity: 1 })
        .bindTooltip(`${esc(f.judul)}<br>${tgl(f.tanggal, true)}`, { className: "tip", opacity: 1 })
        .on("click", () => {
          const el = strip.querySelector(`[data-i="${i}"]`);
          if (el) { el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }); el.focus({ preventScroll: true }); }
        })
        .addTo(lapTitik);
    });
  }

  // ------------------------------------------------------------ strip di bawah peta
  const pilihanStrip = () => (data ? data.foto.filter((f) => tahunStrip === "semua" || tahunDari(f) === tahunStrip) : []);

  function siapkanStrip() {
    if (strip) return;
    strip = document.createElement("section");
    strip.className = "strip-foto";
    strip.setAttribute("aria-label", "Foto di sekitar titik terpilih");
    strip.hidden = true;
    document.querySelector(".peta-bungkus").appendChild(strip);
    strip.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.tahun) { tahunStrip = b.dataset.tahun; gambarStrip(); gambarTitik(); }
      else if (b.dataset.aksi === "tutup") tutupStrip();
      else if (b.dataset.aksi === "luas") muatStrip(titik.lat, titik.lng, titik.nama, 1000);
      else if (b.dataset.i !== undefined) {
        const f = pilihanStrip()[b.dataset.i];
        bukaJendela(tahunDari(f) || "lain");
      } else if (b.dataset.aksi === "semua") bukaJendela(tahunStrip === "semua" ? null : tahunStrip);
    });
    strip.addEventListener("mouseover", (e) => {
      const b = e.target.closest("[data-i]");
      lapTitik && lapTitik.eachLayer((l) => l.setStyle({ fillColor: "#1A73E8", radius: 6 }));
      if (b) { const l = lapTitik.getLayers()[b.dataset.i]; if (l) { l.setStyle({ fillColor: "#FBBC04", radius: 9 }); l.bringToFront(); } }
    });
  }

  function gambarStrip(pesan) {
    const sv = titik ? urlStreetView(titik.lat, titik.lng) : "#";
    const kepala = `
      <div class="sf-kepala">
        <div class="sf-judul"><strong>Foto di sekitar titik ini</strong><span>${esc(titik.nama)} · radius ${titik.radius >= 1000 ? "1 km" : titik.radius + " m"}</span></div>
        ${data ? `<div class="sf-tahun" role="group" aria-label="Pilih tahun foto">
          <button type="button" data-tahun="semua" aria-pressed="${tahunStrip === "semua"}">Semua <small>${data.foto.length}</small></button>
          ${data.per_tahun.map((t) => `<button type="button" data-tahun="${t.tahun}" aria-pressed="${String(t.tahun) === tahunStrip}"
              ${t.jumlah ? "" : 'class="kosong"'}>${t.tahun} <small>${t.jumlah || "–"}</small></button>`).join("")}
        </div>` : ""}
        <button type="button" class="sf-tutup" data-aksi="tutup" aria-label="Sembunyikan foto">Sembunyikan ▾</button>
      </div>`;
    const tileSV = `<a class="sf-item sf-sv" href="${sv}" target="_blank" rel="noopener noreferrer" title="Buka Google Street View di titik ini (tab baru)">
        <span class="sf-sv-ikon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2.6"/><path d="M8.5 9.5h7l-1 6h-1.6l-.6 6h-1.6l-.6-6H9.5z"/></svg></span>
        <span class="sf-label">Street View ↗<small>pilih tahun di Google Maps</small></span></a>`;
    let isi;
    if (pesan) isi = `<p class="sf-pesan">${pesan}</p>`;
    else {
      const daftar = pilihanStrip();
      isi = daftar.length
        ? daftar.map((f, i) => `
          <button type="button" class="sf-item" data-i="${i}" title="${esc(f.judul)} · ${tgl(f.tanggal, true)}">
            <img src="${f.foto[0].url}" alt="${esc(f.foto[0].label)}: ${esc(f.judul)}, ${tgl(f.tanggal, true)}" loading="lazy">
            <span class="sf-label">${tgl(f.tanggal)}<small>${f.sumber === "temanjabar" ? `DBMPR · ${f.foto.length > 1 ? "sebelum/sesudah" : "pemeliharaan"}` : "Commons"}</small></span>
          </button>`).join("") +
          `<button type="button" class="sf-item sf-semua" data-aksi="semua"><span>Lihat semua<br>per tahun →</span></button>`
        : `<p class="sf-pesan">Belum ada foto ${tahunStrip === "semua" ? "" : `tahun ${tahunStrip} `}dalam radius ${titik.radius} m.
             ${titik.radius < 1000 ? `<button type="button" class="tombol" data-aksi="luas">Cari sampai 1 km</button>` : ""}
             Untuk tahun lain, buka Street View.</p>`;
    }
    strip.innerHTML = `${kepala}<div class="sf-deret">${tileSV}${isi}</div>
      ${data ? `<p class="sf-sumber">${data.sumber.map((s) => `${NAMA_SUMBER[s.kode] || s.nama}: ${s.ok ? `${s.jumlah} foto` : "tidak dapat diakses"}`).join(" · ")}</p>` : ""}`;
  }

  async function muatStrip(lat, lng, nama, radius = 300) {
    siapkanStrip();
    titik = { lat, lng, nama, radius };
    data = null; tahunStrip = "semua";
    strip.hidden = false;
    document.body.classList.add("strip-buka");
    gambarStrip("Mencari foto dari Temanjabar dan Wikimedia Commons…");
    gambarTitik();
    try {
      const d = await ambil(lat, lng, radius);
      if (!titik || titik.lat !== lat || titik.lng !== lng || titik.radius !== radius) return; // sudah diganti titik lain
      data = d;
      gambarStrip();
      gambarTitik();
    } catch (e) {
      gambarStrip(esc(e.message));
    }
  }

  function tutupStrip() {
    if (!strip) return;
    strip.hidden = true;
    document.body.classList.remove("strip-buka");
    titik = null; data = null;
    lapTitik && lapTitik.clearLayers();
  }

  // ------------------------------------------------------------ jendela lengkap per tahun
  function siapkanJendela() {
    if (dlg) return;
    dlg = document.createElement("dialog");
    dlg.className = "dlg-foto";
    dlg.setAttribute("aria-labelledby", "judulFotoLokasi");
    dlg.innerHTML = `
      <div class="df-kepala">
        <div><h2 id="judulFotoLokasi">Foto di lokasi ini</h2><p class="df-sub" id="subFotoLokasi"></p></div>
        <button type="button" class="df-tutup" aria-label="Tutup">×</button>
      </div>
      <div class="df-isi" id="isiFotoLokasi"></div>`;
    document.body.appendChild(dlg);
    dlg.querySelector(".df-tutup").addEventListener("click", () => dlg.close());
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg) return dlg.close();
      const t = e.target.closest("[data-tahun]");
      if (t) { tahunDlg = t.dataset.tahun; gambarJendela(); }
      const r = e.target.closest("[data-radius]");
      if (r) bukaFoto(titik.lat, titik.lng, titik.nama, Number(r.dataset.radius));
    });
  }

  function gambarJendela() {
    const isi = dlg.querySelector("#isiFotoLokasi"), d = data;
    const ada = d.per_tahun.filter((t) => t.jumlah).map((t) => String(t.tahun));
    if (tahunDlg === null) tahunDlg = ada.length ? ada[ada.length - 1] : "lain";
    const lain = d.foto.filter((f) => !d.per_tahun.some((t) => tahunDari(f) === String(t.tahun)));
    const pilih = tahunDlg === "lain" ? lain : d.foto.filter((f) => tahunDari(f) === tahunDlg);
    isi.innerHTML = `
      <div class="df-tahun" role="group" aria-label="Pilih tahun">
        ${d.per_tahun.map((t) => `<button type="button" data-tahun="${t.tahun}" aria-pressed="${String(t.tahun) === tahunDlg}"
            ${t.jumlah ? "" : 'class="kosong"'}>${t.tahun}<small>${t.jumlah || "–"}</small></button>`).join("")}
        ${lain.length ? `<button type="button" data-tahun="lain" aria-pressed="${tahunDlg === "lain"}">Tahun lain<small>${lain.length}</small></button>` : ""}
      </div>
      ${pilih.length ? `<div class="df-grid">${pilih.map((f) => `
        <article class="df-kartu">
          <div class="df-foto df-foto-${f.foto.length}">${f.foto.map((x) => `
            <a href="${x.url}" target="_blank" rel="noopener" title="Buka foto ukuran penuh">
              <img src="${x.url}" alt="${esc(x.label)}: ${esc(f.judul)}" loading="lazy">${f.foto.length > 1 ? `<span>${esc(x.label)}</span>` : ""}</a>`).join("")}
          </div>
          <div class="df-ket">
            <strong>${esc(f.judul)}</strong>
            <span>${tgl(f.tanggal, true)} · ${f.jarak_m} m dari titik</span>
            ${f.ket ? `<span>${esc(f.ket)}</span>` : ""}
            <small>${f.tautan ? `<a href="${f.tautan}" target="_blank" rel="noopener">${esc(f.kredit)}</a>` : esc(f.kredit)}</small>
          </div>
        </article>`).join("")}</div>`
      : `<p class="df-kosong">Belum ada foto ${tahunDlg === "lain" ? "tahun lain" : `tahun ${tahunDlg}`} dalam radius ${d.radius_m} m dari titik ini.
           ${d.radius_m < 1000 ? `<button type="button" class="tombol" data-radius="1000">Cari sampai 1 km</button>` : ""}</p>`}
      <div class="df-kaki">
        <p>Sumber: ${d.sumber.map((s) => `${NAMA_SUMBER[s.kode] || s.nama} ${s.ok ? `(${s.jumlah} foto)` : "(tidak dapat diakses)"}`).join(" · ")}.
          Foto Temanjabar tersedia untuk 2021–2023. Untuk tahun lain, buka Street View lalu pilih <em>Lihat tanggal lainnya</em> di Google Maps.</p>
        <a class="tombol" href="${urlStreetView(titik.lat, titik.lng)}" target="_blank" rel="noopener noreferrer">Buka Street View ↗</a>
      </div>`;
  }

  function bukaJendela(tahun) {
    siapkanJendela();
    tahunDlg = tahun;
    dlg.querySelector("#subFotoLokasi").textContent = `${titik.nama} · radius ${titik.radius >= 1000 ? "1 km" : titik.radius + " m"}`;
    gambarJendela();
    if (!dlg.open) dlg.showModal();
  }

  // dipakai tombol "Foto per tahun" di pop-up: strip ikut dibuka, lalu jendela lengkap
  async function bukaFoto(lat, lng, nama, radius = 300) {
    siapkanJendela();
    dlg.querySelector("#subFotoLokasi").textContent = `${nama} · radius ${radius >= 1000 ? "1 km" : radius + " m"}`;
    dlg.querySelector("#isiFotoLokasi").innerHTML = `<p class="df-muat">Mencari foto dari Temanjabar dan Wikimedia Commons…</p>`;
    if (!dlg.open) dlg.showModal();
    await muatStrip(lat, lng, nama, radius);
    if (data) bukaJendela(null);
    else dlg.querySelector("#isiFotoLokasi").innerHTML = strip.querySelector(".sf-pesan")?.outerHTML || "";
  }

  return {
    pasang(peta) { map = peta; lapTitik = L.layerGroup().addTo(map); },
    strip: (lat, lng, nama) => muatStrip(lat, lng, nama, 300),
    buka: (lat, lng, nama) => bukaFoto(lat, lng, nama, 300),
    tutup: tutupStrip,
  };
})();
