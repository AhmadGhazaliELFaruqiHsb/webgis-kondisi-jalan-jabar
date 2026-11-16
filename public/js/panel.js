"use strict";
// Panel samping: filter, ringkasan, grafik (Chart.js), pencarian ruas, detail ruas, dan alat titik.

Chart.defaults.font.family = '"Barlow", system-ui, sans-serif';
Chart.defaults.font.size = 12;

const S = {
  dasar: JENIS_BAWAAN, // peta dasar terpilih: standar (ikut tema) | osm | satelit
  kondisi: new Set(KONDISI.map((k) => k.nama)),
  kab: "",
  tab: "peta",
  ruas: null,
  tahun: null,
  peringkat: [],
  urutNaik: false,
  analisisKotor: true,
  lapisanRuas: false,
  modeTitik: false,
  titik: null,
  lokasi: null,
  batasJabar: null,
};
const $ = (id) => document.getElementById(id);
const mobile = () => window.matchMedia("(max-width: 860px)").matches;
const grafik = { tren: null, profil: null };

// ---------------------------------------------------------------- pesan & galat
let timerPesan;
function pesan(teks, ms = 4500) {
  const e = $("pesanPeta");
  clearTimeout(timerPesan);
  if (!teks) { e.hidden = true; return; }
  e.textContent = teks; e.hidden = false;
  if (ms) timerPesan = setTimeout(() => { e.hidden = true; }, ms);
}
function galatFatal(teks) { $("teksGalat").textContent = teks; $("galat").hidden = false; }

// ---------------------------------------------------------------- peta & ringkasan
const paramPeta = () => ({ kondisi: [...S.kondisi].join(","), kab_kota: S.kab || null });

let timerPeta;
function jadwalMuatPeta(opsi) { clearTimeout(timerPeta); timerPeta = setTimeout(() => muatPeta(opsi), 120); }

async function muatPeta({ fit = false } = {}) {
  pesan(S.kondisi.size === 0 ? "Pilih minimal satu kondisi untuk menampilkan jalan." : null, 0);
  try {
    const hasil = await Peta.muatSegmen(paramPeta());
    if (S.lapisanRuas) await Peta.muatRuas(paramPeta());
    if (fit && hasil) {
      if (!S.kab) Peta.zoomBatas(S.batasJabar);
      else if (hasil.batas.isValid()) Peta.zoomBatas(hasil.batas);
    }
  } catch (e) { pesan(e.message, 7000); }
}

function bangunKondisi() {
  const centang = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5l3 3 5-6" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  $("komposisi").innerHTML = KONDISI.map((k) =>
    `<button type="button" data-k="${k.nama}" style="background:${k.warna}" aria-pressed="true"></button>`).join("");
  $("filterKondisi").innerHTML = KONDISI.map((k) =>
    `<label class="kondisi">
       <input type="checkbox" data-k="${k.nama}" checked>
       <span class="petak" style="background:${k.warna}"><svg style="stroke:${k.teks}" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5l3 3 5-6" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
       <span class="nama">${k.nama}<small>${k.rentang}</small></span>
       <img class="mini-foto" src="${k.gambar}" alt="" width="64" height="40" loading="lazy">
       <span class="nilai"><span data-km>–</span><small data-pct>–</small></span>
     </label>`).join("");
  // tombol "pil" di atas peta: alih kondisi + lokasi saya
  $("chipKondisi").innerHTML = KONDISI.map((k) =>
    `<button type="button" class="chip-k" data-k="${k.nama}" aria-pressed="true"><i style="background:${k.warna}"></i>${k.nama}</button>`).join("") +
    `<button type="button" class="chip-k" data-aksi="lokasi"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>Sekitar saya</button>`;
  $("chipKondisi").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.aksi === "lokasi") lokasiSaya();
    else alihKondisi(b.dataset.k);
  });
  $("komposisi").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-k]");
    if (b) alihKondisi(b.dataset.k);
  });
  $("filterKondisi").addEventListener("change", (e) => {
    if (e.target.dataset.k) alihKondisi(e.target.dataset.k, e.target.checked);
  });
}

function alihKondisi(nama, nyala) {
  if (nyala === undefined) nyala = !S.kondisi.has(nama);
  if (nyala) S.kondisi.add(nama); else S.kondisi.delete(nama);
  sinkronKondisi();
  jadwalMuatPeta();
}

function sinkronKondisi() {
  for (const b of $("komposisi").children) b.setAttribute("aria-pressed", S.kondisi.has(b.dataset.k));
  for (const c of $("filterKondisi").querySelectorAll("input")) c.checked = S.kondisi.has(c.dataset.k);
  for (const b of $("chipKondisi").querySelectorAll("[data-k]")) b.setAttribute("aria-pressed", S.kondisi.has(b.dataset.k));
}

function gambarRingkasan(r) {
  $("angkaMantap").textContent = fmt(r.persen_mantap, 1);
  $("lingkup").textContent = r.kab_kota ? judul(r.kab_kota) : "seluruh ruas provinsi";
  $("stRuas").textContent = fmt(r.jumlah_ruas, 0);
  $("stKm").textContent = fmt(r.km_survei, 0);
  $("stIri").textContent = fmt(r.iri_rata2, 1);
  const total = r.km_survei || 0;
  const barisKm = $("filterKondisi").querySelectorAll(".kondisi");
  KONDISI.forEach((k, i) => {
    const km = r.km[k.nama] || 0;
    const persen = total ? (km / total) * 100 : 0;
    const b = $("komposisi").children[i];
    b.style.flex = `${Math.max(km, 0) * 1000} 1 0`;
    const ket = `${k.nama}: ${fmt(km, 1)} km (${fmt(persen, 1)}%)`;
    b.title = ket;
    b.setAttribute("aria-label", ket);
    barisKm[i].querySelector("[data-km]").textContent = `${fmt(km, 1)} km`;
    barisKm[i].querySelector("[data-pct]").textContent = `${fmt(persen, 1)}%`;
  });
}

async function muatRingkasan() {
  try { gambarRingkasan(await api("/api/ringkasan", { kab_kota: S.kab || null })); }
  catch (e) { pesan(e.message, 7000); }
}

function setKab(nama) {
  S.kab = nama;
  $("selKab").value = nama;
  S.analisisKotor = true;
  muatRingkasan();
  jadwalMuatPeta({ fit: true });
  if (S.tab === "analisis") muatAnalisis();
}

// ---------------------------------------------------------------- tab
function aktifkanTab(nama) {
  S.tab = nama;
  document.querySelectorAll(".tab-daftar [role=tab]").forEach((b) => {
    const on = b.dataset.tab === nama;
    b.setAttribute("aria-selected", on);
    b.tabIndex = on ? 0 : -1;
  });
  for (const n of ["peta", "analisis", "ruas"]) $("panel" + n[0].toUpperCase() + n.slice(1)).hidden = n !== nama;
  if (nama === "analisis") muatAnalisis();
  if (nama === "ruas" && grafik.profil) grafik.profil.resize();
}

function bukaSheet(buka) {
  document.body.classList.toggle("sisi-tutup", !buka);
  $("btnPanel").setAttribute("aria-expanded", String(buka));
  $("btnLipat").setAttribute("aria-expanded", String(buka));
  Peta.ukuran();
  setTimeout(() => Peta.ukuran(), 100);
}

// ---------------------------------------------------------------- pencarian ruas
function pasangCari() {
  const inp = $("cari"), daftar = $("saran");
  let timer, idx = -1, hasil = [];
  const tutup = () => { daftar.hidden = true; inp.setAttribute("aria-expanded", "false"); inp.removeAttribute("aria-activedescendant"); idx = -1; };
  const sorot = () => {
    daftar.querySelectorAll("li[data-i]").forEach((li, i) => li.setAttribute("aria-selected", i === idx));
    if (idx >= 0) inp.setAttribute("aria-activedescendant", "saran" + idx);
  };
  const render = () => {
    daftar.innerHTML = hasil.length
      ? hasil.map((r, i) => `<li role="option" id="saran${i}" data-i="${i}" aria-selected="false">${esc(r.nm_ruas)}<small>${esc(judul(r.kab_kota))}, ${r.kondisi}</small></li>`).join("")
      : '<li class="tak-ada">Tidak ada ruas yang cocok</li>';
    daftar.hidden = false;
    inp.setAttribute("aria-expanded", "true");
  };
  const pilih = (i) => {
    const r = hasil[i];
    if (!r) return;
    inp.value = r.nm_ruas;
    tutup();
    pilihRuas(r.idruas, { zoom: true, buka: !mobile() });
    if (mobile()) bukaSheet(false);
  };
  inp.addEventListener("input", () => {
    clearTimeout(timer);
    const q = inp.value.trim();
    if (q.length < 2) { tutup(); return; }
    timer = setTimeout(async () => {
      try { hasil = await api("/api/cari", { q }); idx = -1; render(); } catch (e) { pesan(e.message, 6000); }
    }, 250);
  });
  inp.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && hasil.length) { e.preventDefault(); idx = (idx + 1) % hasil.length; sorot(); }
    else if (e.key === "ArrowUp" && hasil.length) { e.preventDefault(); idx = (idx - 1 + hasil.length) % hasil.length; sorot(); }
    else if (e.key === "Enter" && !daftar.hidden) { e.preventDefault(); pilih(idx >= 0 ? idx : 0); }
    else if (e.key === "Escape") tutup();
  });
  daftar.addEventListener("mousedown", (e) => {
    const li = e.target.closest("li[data-i]");
    if (li) { e.preventDefault(); pilih(Number(li.dataset.i)); }
  });
  document.addEventListener("click", (e) => { if (!e.target.closest(".pencarian")) tutup(); });
}

// ---------------------------------------------------------------- detail ruas
async function pilihRuas(id, { zoom = false, buka = !mobile() } = {}) {
  try {
    const d = await api("/api/ruas/" + encodeURIComponent(id));
    S.ruas = d;
    Peta.sorotRuas(d.geometri);
    if (zoom) Peta.zoomKe(d.bbox);
    gambarDetail(d);
    if (buka) aktifkanTab("ruas");
  } catch (e) { pesan(e.message, 6000); }
}

const garisAmbang = {
  id: "ambang",
  afterDraw(chart) {
    const { ctx, chartArea: { left, right }, scales: { y } } = chart;
    ctx.save();
    ctx.setLineDash([4, 4]); ctx.lineWidth = 1; ctx.strokeStyle = warnaTema("garis-ambang");
    [4, 8, 12].forEach((v) => {
      if (v > y.max) return;
      const py = y.getPixelForValue(v);
      ctx.beginPath(); ctx.moveTo(left, py); ctx.lineTo(right, py); ctx.stroke();
    });
    ctx.restore();
  },
};

function gambarDetail(d) {
  if (grafik.profil) { grafik.profil.destroy(); grafik.profil = null; }
  const k = INFO[d.kondisi];
  const km = [d.km_baik, d.km_sedang, d.km_rusak_ringan, d.km_rusak_berat];
  $("detailRuas").innerHTML = `
    <article class="detail">
      <figure class="foto-kondisi sv">
        <div class="sv-bingkai"><iframe id="svRuas" title="Google Street View ruas ${esc(d.nm_ruas)}" loading="lazy"
          referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe></div>
        <figcaption id="svKet"></figcaption>
      </figure>
      <span class="chip" style="background:${k.warna};color:${k.teks}">${k.nama}</span>
      <h2>${esc(d.nm_ruas)}</h2>
      <p class="meta">Kode ${esc(d.idruas)}, ${esc(judul(d.kab_kota))}${d.uptd ? `, UPTD ${esc(d.uptd)}` : ""}</p>
      <dl class="tiga empat">
        <div><dt>Panjang resmi</dt><dd>${fmt(d.panjang_km, 2)} km</dd></div>
        <div><dt>Panjang tersurvei</dt><dd>${fmt(d.km_survei, 2)} km</dd></div>
        <div><dt>IRI rata-rata</dt><dd>${fmt(d.iri_rata2, 2)}</dd></div>
        <div><dt>Jalan mantap</dt><dd>${fmt(d.persen_mantap, 0)}%</dd></div>
      </dl>
      <h3>Panjang tersurvei menurut kondisi</h3>
      <div class="km-bar" role="img" aria-label="Komposisi kondisi ruas">
        ${KONDISI.map((c, i) => (km[i] > 0 ? `<i style="flex:${km[i] * 1000} 1 0;background:${c.warna}"></i>` : "")).join("")}
      </div>
      <ul class="km-daftar">
        ${KONDISI.map((c, i) => `<li><span><i class="titik" style="background:${c.warna}"></i>${c.nama}</span><span>${fmt(km[i], 2)} km</span></li>`).join("")}
      </ul>
      <h3>Profil IRI sepanjang ruas</h3>
      <div class="kotak-grafik"><canvas id="cProfil" role="img" aria-label="Nilai IRI tiap segmen sepanjang ruas"></canvas></div>
      <p class="sumber">Setiap batang adalah satu segmen. Garis putus-putus menandai batas kelas pada IRI 4, 8, dan 12. Panjang per kondisi dan persen mantap dihitung dari segmen 1 km, sama seperti di peta.</p>
      <div class="aksi-detail">
        <button type="button" class="tombol tombol-isi" id="btnZoomRuas">Zoom ke ruas</button>
        <button type="button" class="tombol" id="btnLepas">Hapus sorotan</button>
      </div>
    </article>`;
  $("btnZoomRuas").addEventListener("click", () => { if (mobile()) bukaSheet(false); Peta.zoomKe(d.bbox); });
  $("btnLepas").addEventListener("click", () => {
    Peta.sorotRuas(null); S.ruas = null;
    $("detailRuas").innerHTML = '<div class="kosong"><p><strong>Belum ada ruas dipilih.</strong></p><p>Klik garis jalan di peta, atau cari namanya di tab Peta.</p></div>';
    if (grafik.profil) { grafik.profil.destroy(); grafik.profil = null; }
  });

  const iriMaks = Math.max(14, Math.ceil(Math.max(...d.segmen.map((s) => s.nilai_iri)) + 1));
  grafik.profil = new Chart($("cProfil"), {
    type: "bar",
    data: {
      labels: d.segmen.map((s) => `${fmt(s.km_awal, 1)}`),
      datasets: [{ data: d.segmen.map((s) => s.nilai_iri), backgroundColor: d.segmen.map((s) => INFO[s.kondisi].warna), borderWidth: 0, categoryPercentage: 0.96, barPercentage: 0.9 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, title: { display: true, text: "Jarak dari awal ruas (km)" }, ticks: { maxTicksLimit: 10, maxRotation: 0 } },
        y: { min: 0, max: iriMaks, title: { display: true, text: "IRI (m/km)" } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (it) => { const s = d.segmen[it[0].dataIndex]; return `Km ${fmt(s.km_awal, 1)} - ${fmt(s.km_akhir, 1)}`; },
            label: (it) => { const s = d.segmen[it.dataIndex]; return `IRI ${fmt(s.nilai_iri, 2)}, ${s.kondisi}`; },
            footer: () => "Klik untuk melihat Street View",
          },
        },
      },
      onClick: (e, el) => { if (el.length) tampilStreetView(d, el[0].index); },
      onHover: (e, el) => { e.native.target.style.cursor = el.length ? "pointer" : "default"; },
    },
    plugins: [garisAmbang],
  });
  // awalnya tampilkan segmen dengan IRI tertinggi (bagian paling rusak)
  const terparah = d.segmen.reduce((m, s, i, a) => (s.nilai_iri > a[m].nilai_iri ? i : m), 0);
  tampilStreetView(d, terparah, "Segmen paling rusak:");
}

// Street View segmen ke-i di panel Ruas, dan tandai batangnya di grafik profil
function tampilStreetView(d, i, judulSegmen = "Segmen:") {
  const s = d.segmen[i];
  if (!s || s.lat == null) return;
  const tetangga = d.segmen[i + 1] || d.segmen[i - 1];
  const arah = tetangga ? (d.segmen[i + 1] ? arahKe(s, tetangga) : arahKe(tetangga, s)) : 0;
  $("svRuas").src = urlStreetViewSemat(s.lat, s.lng, arah);
  const k = INFO[s.kondisi];
  $("svKet").innerHTML =
    `<b>${judulSegmen}</b> Km ${fmt(s.km_awal, 1)} - ${fmt(s.km_akhir, 1)}, IRI ${fmt(s.nilai_iri, 2)}
     <span class="titik" style="background:${k.warna}"></span> ${k.nama}.
     <a href="${urlStreetView(s.lat, s.lng)}" target="_blank" rel="noopener noreferrer">Buka layar penuh</a><br>
     Foto dari Google Street View, tanggalnya berbeda dengan survei 2021. Bila kosong, lokasi ini belum dipotret Google.
     Klik batang pada grafik profil untuk melihat segmen lain.`;
  if (grafik.profil) {
    const ds = grafik.profil.data.datasets[0];
    ds.borderWidth = d.segmen.map((_, j) => (j === i ? 2 : 0));
    ds.borderColor = warnaTema("aksen");
    grafik.profil.update("none");
  }
}

// ---------------------------------------------------------------- analisis
async function muatAnalisis() {
  if (!S.analisisKotor) return;
  S.analisisKotor = false;
  $("lingkupAnalisis").textContent = S.kab ? judul(S.kab) : "Seluruh Jawa Barat";
  try {
    const kab = S.kab || null;
    const [tren, parah] = await Promise.all([
      api("/api/tren", { kab_kota: kab }),
      api("/api/ruas-terparah", { kab_kota: kab, limit: 8 }),
    ]);
    gambarTren(tren);
    gambarParah(parah);
    await muatPeringkat();
  } catch (e) { S.analisisKotor = true; pesan(e.message, 7000); }
}

// Tren dipecah menjadi satu grafik per kondisi (bukan batang bertumpuk), masing-masing dengan skala sumbu Y
// sendiri, agar perubahan kelas yang kecil (rusak ringan, rusak berat) tetap terlihat.
function gambarTren(data) {
  (grafik.tren || []).forEach((g) => g.destroy());
  const terakhir = data[data.length - 1];
  $("ketTren").textContent = terakhir
    ? `Pada ${terakhir.tahun}, ${fmt(terakhir.persen_mantap, 1)}% jalan berkondisi mantap (baik dan sedang). Skala tiap grafik berbeda.`
    : "Belum ada data.";
  const persen = (d, nama) => (d.total_km ? (d.km[nama] / d.total_km) * 100 : 0);
  $("trenGrid").innerHTML = KONDISI.map((k, i) => {
    const nilai = data.map((d) => persen(d, k.nama));
    const ubah = nilai.length > 1 ? nilai[nilai.length - 1] - nilai[0] : 0;
    return `<figure class="tren-kartu">
      <figcaption><span><i class="titik" style="background:${k.warna}"></i>${k.nama}</span>
        <b>${fmt(nilai[nilai.length - 1] ?? 0, 1)}%</b></figcaption>
      <p class="tren-ubah">${data.length > 1 ? `${ubah > 0 ? "+" : ""}${fmt(ubah, 1)} poin sejak ${data[0].tahun}` : ""}</p>
      <div class="kotak-grafik kecil"><canvas id="cTren${i}" role="img" aria-label="Grafik persentase jalan ${k.nama.toLowerCase()} tiap tahun"></canvas></div>
    </figure>`;
  }).join("");
  grafik.tren = KONDISI.map((k, i) => {
    const nilai = data.map((d) => persen(d, k.nama));
    const maks = Math.min(100, Math.max(5, Math.ceil((Math.max(...nilai, 0) * 1.15) / 5) * 5));
    return new Chart($(`cTren${i}`), {
      type: "bar",
      data: { labels: data.map((d) => d.tahun), datasets: [{ label: k.nama, data: nilai, backgroundColor: k.warna, borderWidth: 0 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 0, padding: 0, font: { size: 9 }, callback: (v, j) => `'${String(data[j].tahun).slice(2)}` } },
          y: { min: 0, max: maks, ticks: { maxTicksLimit: 4, font: { size: 10 }, callback: (v) => v + "%" } },
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { title: (its) => String(data[its[0].dataIndex].tahun), label: (it) => `${k.nama}: ${fmt(it.parsed.y, 1)}% (${fmt(data[it.dataIndex].km[k.nama], 1)} km)` } },
        },
      },
    });
  });
}

function gambarParah(data) {
  $("daftarParah").innerHTML = data.length
    ? data.map((r, i) => {
        const k = INFO[r.kondisi];
        return `<li><button type="button" data-id="${esc(r.idruas)}">
          <span class="no">${i + 1}</span>
          <span class="nm">${esc(r.nm_ruas)}</span>
          <span class="kab">${esc(judul(r.kab_kota))}</span>
          <span class="iri">${fmt(r.iri_rata2, 2)}<i style="width:${Math.min(100, (r.iri_rata2 / 16) * 100)}%;background:${k.warna}"></i></span>
        </button></li>`;
      }).join("")
    : '<li class="bantu">Tidak ada data ruas.</li>';
}

async function muatPeringkat() {
  S.peringkat = await api("/api/peringkat", { tahun: S.tahun });
  gambarPeringkat();
}

function gambarPeringkat() {
  const urut = [...S.peringkat].sort((a, b) =>
    (S.urutNaik ? 1 : -1) * ((a.persen_mantap ?? -1) - (b.persen_mantap ?? -1)) || a.kab_kota.localeCompare(b.kab_kota));
  $("tabelPeringkat").querySelector("tbody").innerHTML = urut.map((r, i) => `
    <tr tabindex="0" data-kab="${esc(r.kab_kota)}" ${r.kab_kota === S.kab ? 'aria-current="true" style="background:var(--tinta-3)"' : ""}>
      <td class="no">${i + 1}</td>
      <td>${esc(judul(r.kab_kota).replace(/^Kabupaten /, "Kab. "))}</td>
      <td class="num"><span class="sel-mantap"><i><b style="width:${r.persen_mantap ?? 0}%"></b></i>${fmt(r.persen_mantap, 1)}%</span></td>
      <td class="num">${fmt(r.km_rusak_berat, 1)}</td>
    </tr>`).join("");
  $("btnUrut").textContent = S.urutNaik ? "Urutkan dari yang tertinggi" : "Urutkan dari yang terendah";
}

// ---------------------------------------------------------------- alat: jalan rusak di sekitar titik
function infoTerdekat(teks, { hapus = false, catatan = "" } = {}) {
  const e = $("infoTerdekat");
  e.textContent = teks;
  if (hapus) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "tombol tombol-kecil"; b.textContent = "Hapus hasil"; b.style.marginLeft = "8px";
    b.addEventListener("click", () => {
      Peta.bersihHasil(); hentikanPantau();
      $("hasilTerdekat").innerHTML = ""; e.textContent = ""; S.titik = null;
    });
    e.appendChild(b);
  }
  if (catatan) {
    const c = document.createElement("span");
    c.className = "catatan-lokasi"; c.textContent = catatan;
    e.appendChild(c);
  }
}

function selesaiPilihTitik() {
  S.modeTitik = false;
  Peta.batalPilihTitik();
  const b = $("btnTitik");
  b.setAttribute("aria-pressed", "false");
  b.textContent = "Pilih titik di peta";
}

// opsi.akurasi: ketidakpastian lokasi (m); opsi.catatan: teks tambahan; opsi.fit: geser peta ke hasil
async function cariTerdekat(lat, lng, { akurasi = null, catatan = "", fit = true } = {}) {
  S.titik = { lat, lng, akurasi };
  if (!catatan) infoTerdekat("Mencari...");
  try {
    const radius = Number($("radius").value);
    const d = await api("/api/terdekat", { lat, lng, radius, limit: 30 });
    Peta.tampilHasil(d, { akurasi, fit });
    const n = d.features.length;
    let cat = catatan;
    if (akurasi && akurasi > radius) cat += `${cat ? " " : ""}Akurasi lokasi lebih besar dari radius, jadi hasil kurang tepat. Tunggu perbaikan lokasi atau pilih titik langsung di peta.`;
    infoTerdekat(
      n === 0
        ? `Tidak ada segmen rusak dalam radius ${fmt(radius / 1000, 0)} km dari titik ini. Coba perbesar radius.`
        : `${n} segmen rusak${n === 30 ? " (30 yang terdekat)" : ""} dalam radius ${fmt(radius / 1000, 0)} km.`,
      { hapus: true, catatan: cat }
    );
    $("hasilTerdekat").innerHTML = d.features.map((f) => {
      const p = f.properties, k = INFO[p.kondisi];
      return `<li><button type="button" data-id="${p.id}" data-ruas="${esc(p.idruas)}">
        <span class="chip" style="background:${k.warna};color:${k.teks}">${k.nama}</span>
        <span class="nm">${esc(p.nm_ruas)}</span>
        <span class="ket">Km ${fmt(p.km_awal, 1)} - ${fmt(p.km_akhir, 1)}, IRI ${fmt(p.nilai_iri, 2)}, ${jarak(p.jarak_m)} dari titik</span>
      </button></li>`;
    }).join("");
    if (mobile()) bukaSheet(true);
  } catch (e) { infoTerdekat(e.message); }
}

// ---------- lokasi saya
// Penyebab "delay": peramban butuh beberapa detik menentukan posisi (Wi-Fi/IP/GPS), bukan kueri database (sekitar 15 ms).
// Strategi: (1) umpan balik seketika, (2) pakai posisi tersimpan bila masih segar, (3) tampilkan hasil dari
// posisi kasar lebih dulu, lalu (4) diperbaiki di latar belakang saat GPS/Wi-Fi memberi posisi lebih akurat.
const UMUR_LOKASI = 5 * 60 * 1000;
const OPSI_CEPAT = { enableHighAccuracy: false, maximumAge: UMUR_LOKASI, timeout: 8000 };
const OPSI_AKURAT = { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 };
let idPantau = null, timerPantau = null;

function sibukLokasi(sibuk) {
  const b = $("btnLokasi");
  b.disabled = sibuk;
  b.setAttribute("aria-busy", String(sibuk));
  b.classList.toggle("memuat", sibuk);
  b.textContent = sibuk ? "Mencari lokasi" : "Lokasi saya";
}

function simpanLokasi(pos) {
  S.lokasi = { lat: pos.coords.latitude, lng: pos.coords.longitude, akurasi: pos.coords.accuracy, waktu: Date.now() };
  return S.lokasi;
}

function hentikanPantau() {
  if (idPantau !== null) { navigator.geolocation.clearWatch(idPantau); idPantau = null; }
  clearTimeout(timerPantau);
}

function galatLokasi(err) {
  const pesanGalat = {
    1: "Izin lokasi ditolak. Aktifkan izin lokasi untuk situs ini (ikon di kolom alamat), lalu coba lagi.",
    2: "Posisi tidak dapat ditentukan. Pastikan layanan lokasi perangkat aktif, atau pilih titik langsung di peta.",
    3: "Penentuan lokasi terlalu lama. Coba lagi, atau pilih titik langsung di peta.",
  };
  infoTerdekat(pesanGalat[err.code] || "Lokasi tidak dapat diakses. Pilih titik langsung di peta.");
}

async function tampilkanLokasi(lok, ket, { fit = true } = {}) {
  await cariTerdekat(lok.lat, lok.lng, { akurasi: lok.akurasi, fit, catatan: `Lokasi Anda ${ket}; akurasi sekitar ${jarak(Math.round(lok.akurasi))}.` });
}

// perbaiki posisi di latar belakang bila akurasi awal masih kasar
function perbaikiLokasi() {
  if (!S.lokasi || S.lokasi.akurasi <= 100 || idPantau !== null) return;
  let terbaik = S.lokasi.akurasi;
  timerPantau = setTimeout(hentikanPantau, 20000);
  idPantau = navigator.geolocation.watchPosition(
    (pos) => {
      if (pos.coords.accuracy < terbaik * 0.7) {
        const lama = S.lokasi;
        terbaik = pos.coords.accuracy;
        const baru = simpanLokasi(pos);
        const geser = Peta.jarakMeter(lama, baru) > Number($("radius").value) * 0.25; // pindah jauh: geser peta juga
        tampilkanLokasi(baru, "diperbarui", { fit: geser });
      }
      if (pos.coords.accuracy <= 50) hentikanPantau();
    },
    () => hentikanPantau(),
    OPSI_AKURAT
  );
}

function lokasiSaya() {
  if (!window.isSecureContext) {
    infoTerdekat("Lokasi hanya dapat dipakai lewat https atau alamat http://localhost:3000. Buka web ini dari localhost.");
    return;
  }
  if (!navigator.geolocation) { infoTerdekat("Peramban ini tidak mendukung geolokasi."); return; }

  // posisi tersimpan masih segar: tampil seketika
  if (S.lokasi && Date.now() - S.lokasi.waktu < UMUR_LOKASI) {
    tampilkanLokasi(S.lokasi, "(posisi terakhir)");
    perbaikiLokasi();
    return;
  }

  sibukLokasi(true);
  infoTerdekat("Mencari lokasi Anda. Peramban sedang menentukan posisi, ini bisa memakan beberapa detik.");
  const mulai = performance.now();
  const berhasil = (pos) => {
    sibukLokasi(false);
    const dtk = fmt((performance.now() - mulai) / 1000, 1);
    tampilkanLokasi(simpanLokasi(pos), `ditemukan dalam ${dtk} detik`);
    perbaikiLokasi();
  };
  navigator.geolocation.getCurrentPosition(berhasil, (err) => {
    if (err.code === 3) { // terlalu lama: coba dengan GPS
      infoTerdekat("Penentuan cepat terlalu lama, mencoba dengan GPS...");
      navigator.geolocation.getCurrentPosition(berhasil, (e2) => { sibukLokasi(false); galatLokasi(e2); }, OPSI_AKURAT);
    } else { sibukLokasi(false); galatLokasi(err); }
  }, OPSI_CEPAT);
}

// bila izin lokasi sudah pernah diberikan, hangatkan cache posisi agar klik pertama langsung cepat
async function panaskanLokasi() {
  try {
    if (!navigator.permissions || !navigator.geolocation || !window.isSecureContext) return;
    const izin = await navigator.permissions.query({ name: "geolocation" });
    if (izin.state === "granted") navigator.geolocation.getCurrentPosition(simpanLokasi, () => {}, { ...OPSI_CEPAT, timeout: 15000 });
  } catch { /* tidak masalah: hanya optimasi */ }
}

function pasangTerdekat() {
  const btn = $("btnTitik");
  btn.addEventListener("click", () => {
    if (S.modeTitik) { selesaiPilihTitik(); infoTerdekat(""); return; }
    S.modeTitik = true;
    btn.setAttribute("aria-pressed", "true");
    btn.textContent = "Klik titik di peta (batalkan)";
    infoTerdekat("Klik di mana saja pada peta.");
    hentikanPantau();
    Peta.pilihTitik((ll) => { selesaiPilihTitik(); cariTerdekat(ll.lat, ll.lng); });
    if (mobile()) bukaSheet(false);
  });
  $("btnLokasi").addEventListener("click", lokasiSaya);
  $("radius").addEventListener("change", () => { if (S.titik) cariTerdekat(S.titik.lat, S.titik.lng, { akurasi: S.titik.akurasi }); });
  $("hasilTerdekat").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-id]");
    if (!b) return;
    if (mobile()) bukaSheet(false);
    Peta.fokusHasil(Number(b.dataset.id));
    pilihRuas(b.dataset.ruas, { buka: false });
  });
}

// ---------------------------------------------------------------- peta dasar
function gantiDasar(k) {
  S.dasar = k;
  Peta.ubahDasar(k === "standar" ? dasarAwal() : k);
  for (const x of $("pilihDasar").children) x.setAttribute("aria-pressed", String(x.dataset.k === k));
}

// ---------------------------------------------------------------- tema (tombolnya diatur situs.js)
// Bagian khusus peta: peta dasar Gelap/Terang ikut tema, gaya garis dan sorotan grafik profil diperbarui
document.addEventListener("temaberubah", (e) => {
  // peta "Standar" ikut tema (jalan di tema terang, gelap di tema gelap); pilihan OSM atau satelit dibiarkan
  if (S.dasar === "standar") Peta.ubahDasar(dasarAwal());
  Peta.segarkanGaya();
  if (S.ruas && grafik.profil) {
    const ds = grafik.profil.data.datasets[0];
    if (ds.borderColor) { ds.borderColor = warnaTema("aksen"); grafik.profil.update("none"); }
  }
});

// ---------------------------------------------------------------- pemasangan UI
function pasangUI() {
  bangunKondisi();
  pasangCari();
  pasangTerdekat();

  // tab (dengan navigasi panah)
  const tabs = [...document.querySelectorAll(".tab-daftar [role=tab]")];
  tabs.forEach((b, i) => {
    b.addEventListener("click", () => aktifkanTab(b.dataset.tab));
    b.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      n.focus(); aktifkanTab(n.dataset.tab);
    });
  });

  $("selKab").addEventListener("change", (e) => setKab(e.target.value));

  // lapisan
  $("lapSegmen").addEventListener("change", (e) => Peta.atur("segmen", e.target.checked));
  $("lapBatas").addEventListener("change", (e) => Peta.atur("batas", e.target.checked));
  $("lapRuas").addEventListener("change", (e) => {
    S.lapisanRuas = e.target.checked;
    Peta.atur("ruas", e.target.checked);
    if (e.target.checked) Peta.muatRuas(paramPeta()).catch((err) => pesan(err.message, 6000));
  });

  // peta dasar
  // peta dasar: Standar (ikut tema), OSM, Satelit. Pilihan Gelap/Terang tidak ditampilkan karena sudah diatur tema.
  $("pilihDasar").innerHTML = JENIS_PETA.map((k) =>
    `<button type="button" data-k="${k}" aria-pressed="${k === S.dasar}">${namaJenisPeta(k)}</button>`).join("");
  $("pilihDasar").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-k]");
    if (b) gantiDasar(b.dataset.k);
  });

  // analisis
  $("daftarParah").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-id]");
    if (b) pilihRuas(b.dataset.id, { zoom: true, buka: true });
  });
  const barisPeringkat = (e) => {
    const tr = e.target.closest("tr[data-kab]");
    if (tr) setKab(tr.dataset.kab);
  };
  $("tabelPeringkat").addEventListener("click", barisPeringkat);
  $("tabelPeringkat").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); barisPeringkat(e); } });
  $("btnUrut").addEventListener("click", () => { S.urutNaik = !S.urutNaik; gambarPeringkat(); });
  $("selTahun").addEventListener("change", async (e) => {
    S.tahun = Number(e.target.value);
    try { await muatPeringkat(); } catch (err) { pesan(err.message, 6000); }
  });

  // kepala
  $("btnPanel").addEventListener("click", () => bukaSheet(document.body.classList.contains("sisi-tutup")));
  $("btnLipat").addEventListener("click", () => bukaSheet(document.body.classList.contains("sisi-tutup")));
  window.addEventListener("resize", () => Peta.ukuran());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && S.modeTitik) { selesaiPilihTitik(); infoTerdekat(""); }
  });
}

// ---------------------------------------------------------------- mulai
document.addEventListener("DOMContentLoaded", async () => {
  try {
    Peta.init({
      pilihRuas: (id) => pilihRuas(id),
      detail: (id) => { pilihRuas(id, { buka: true }); if (document.body.classList.contains("sisi-tutup")) bukaSheet(true); },
      lokasi: () => lokasiSaya(),
      pilihDasar: (k) => gantiDasar(k),
    });
    pasangUI();
    const meta = await api("/api/meta");
    $("selKab").insertAdjacentHTML("beforeend",
      meta.kabkota.map((k) => `<option value="${esc(k.nama)}">${esc(judul(k.nama))} (${k.jumlah_ruas} ruas)</option>`).join(""));
    const tahun = [...meta.tahun].sort((a, b) => b - a);
    S.tahun = tahun[0];
    $("selTahun").innerHTML = tahun.map((t) => `<option value="${t}">${t}</option>`).join("");

    S.batasJabar = await Peta.muatBatas();
    Peta.zoomBatas(S.batasJabar);
    await Promise.all([muatRingkasan(), muatPeta()]);
    panaskanLokasi();

    // tautan dari halaman lain: peta.html?kab=KOTA%20BANDUNG atau peta.html?ruas=348000
    const q = new URLSearchParams(location.search);
    if (q.get("kab") && meta.kabkota.some((k) => k.nama === q.get("kab"))) await setKab(q.get("kab"));
    if (q.get("ruas")) await pilihRuas(q.get("ruas"), { zoom: true, buka: true });
  } catch (e) {
    galatFatal(e.message);
  }
});
