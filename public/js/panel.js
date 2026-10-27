"use strict";
// Panel samping: filter, ringkasan, grafik (Chart.js), pencarian ruas, detail ruas, dan alat titik.

Chart.defaults.color = "#A9B2BC";
Chart.defaults.font.family = '"Barlow", system-ui, sans-serif';
Chart.defaults.font.size = 12;
Chart.defaults.borderColor = "#3A434E";

const S = {
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
       <span class="nilai"><span data-km>–</span><small data-pct>–</small></span>
     </label>`).join("");
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
    ctx.setLineDash([4, 4]); ctx.lineWidth = 1; ctx.strokeStyle = "rgba(255,255,255,.4)";
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
      <span class="chip" style="background:${k.warna};color:${k.teks}">${k.nama}</span>
      <h2>${esc(d.nm_ruas)}</h2>
      <p class="meta">Kode ${esc(d.idruas)}, ${esc(judul(d.kab_kota))}${d.uptd ? `, UPTD ${esc(d.uptd)}` : ""}</p>
      <dl class="tiga">
        <div><dt>Panjang</dt><dd>${fmt(d.panjang_km, 2)} km</dd></div>
        <div><dt>IRI rata-rata</dt><dd>${fmt(d.iri_rata2, 2)}</dd></div>
        <div><dt>Mantap</dt><dd>${fmt(d.persen_mantap, 0)}%</dd></div>
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
      <p class="sumber">Setiap batang adalah satu segmen. Garis putus-putus menandai batas kelas pada IRI 4, 8, dan 12.</p>
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
          },
        },
      },
    },
    plugins: [garisAmbang],
  });
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

function gambarTren(data) {
  if (grafik.tren) grafik.tren.destroy();
  const terakhir = data[data.length - 1];
  $("ketTren").textContent = terakhir
    ? `Pada ${terakhir.tahun}, ${fmt(terakhir.persen_mantap, 1)}% jalan berkondisi mantap (baik dan sedang).`
    : "Belum ada data.";
  grafik.tren = new Chart($("cTren"), {
    type: "bar",
    data: {
      labels: data.map((d) => d.tahun),
      datasets: KONDISI.map((k) => ({
        label: k.nama, backgroundColor: k.warna, borderWidth: 0,
        data: data.map((d) => (d.total_km ? (d.km[k.nama] / d.total_km) * 100 : 0)),
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, max: 100, ticks: { callback: (v) => v + "%" } } },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (it) => `${it.dataset.label}: ${fmt(it.parsed.y, 1)}% (${fmt(data[it.dataIndex].km[it.dataset.label], 1)} km)` } },
      },
    },
  });
}

function gambarParah(data) {
  $("daftarParah").innerHTML = data.length
    ? data.map((r) => {
        const k = INFO[r.kondisi];
        return `<li><button type="button" data-id="${esc(r.idruas)}">
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
  $("tabelPeringkat").querySelector("tbody").innerHTML = urut.map((r) => `
    <tr tabindex="0" data-kab="${esc(r.kab_kota)}" ${r.kab_kota === S.kab ? 'aria-current="true" style="background:var(--tinta-3)"' : ""}>
      <td>${esc(judul(r.kab_kota))}</td>
      <td class="num"><span class="sel-mantap"><i><b style="width:${r.persen_mantap ?? 0}%"></b></i>${fmt(r.persen_mantap, 1)}%</span></td>
      <td class="num">${fmt(r.km_rusak_berat, 1)} km</td>
    </tr>`).join("");
  $("btnUrut").textContent = S.urutNaik ? "Urutkan dari yang tertinggi" : "Urutkan dari yang terendah";
}

// ---------------------------------------------------------------- alat: jalan rusak di sekitar titik
function infoTerdekat(teks, bisaHapus = false) {
  const e = $("infoTerdekat");
  e.textContent = teks;
  if (bisaHapus) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "tombol tombol-kecil"; b.textContent = "Hapus hasil"; b.style.marginLeft = "8px";
    b.addEventListener("click", () => { Peta.bersihHasil(); $("hasilTerdekat").innerHTML = ""; e.textContent = ""; S.titik = null; });
    e.appendChild(b);
  }
}

function selesaiPilihTitik() {
  S.modeTitik = false;
  Peta.batalPilihTitik();
  const b = $("btnTitik");
  b.setAttribute("aria-pressed", "false");
  b.textContent = "Pilih titik di peta";
}

async function cariTerdekat(lat, lng) {
  S.titik = { lat, lng };
  infoTerdekat("Mencari...");
  try {
    const radius = Number($("radius").value);
    const d = await api("/api/terdekat", { lat, lng, radius, limit: 30 });
    Peta.tampilHasil(d);
    const n = d.features.length;
    infoTerdekat(
      n === 0
        ? `Tidak ada segmen rusak dalam radius ${fmt(radius / 1000, 0)} km dari titik ini. Coba perbesar radius.`
        : `${n} segmen rusak${n === 30 ? " (30 yang terdekat)" : ""} dalam radius ${fmt(radius / 1000, 0)} km.`,
      true
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

function pasangTerdekat() {
  const btn = $("btnTitik");
  btn.addEventListener("click", () => {
    if (S.modeTitik) { selesaiPilihTitik(); infoTerdekat(""); return; }
    S.modeTitik = true;
    btn.setAttribute("aria-pressed", "true");
    btn.textContent = "Klik titik di peta (batalkan)";
    infoTerdekat("Klik di mana saja pada peta.");
    Peta.pilihTitik((ll) => { selesaiPilihTitik(); cariTerdekat(ll.lat, ll.lng); });
    if (mobile()) bukaSheet(false);
  });
  $("btnLokasi").addEventListener("click", () => {
    if (!navigator.geolocation) { infoTerdekat("Peramban ini tidak mendukung geolokasi."); return; }
    infoTerdekat("Mencari lokasi Anda...");
    navigator.geolocation.getCurrentPosition(
      (p) => cariTerdekat(p.coords.latitude, p.coords.longitude),
      () => infoTerdekat("Lokasi tidak dapat diakses. Izinkan akses lokasi di peramban, atau pilih titik di peta."),
      { timeout: 10000 }
    );
  });
  $("radius").addEventListener("change", () => { if (S.titik) cariTerdekat(S.titik.lat, S.titik.lng); });
  $("hasilTerdekat").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-id]");
    if (!b) return;
    if (mobile()) bukaSheet(false);
    Peta.fokusHasil(Number(b.dataset.id));
    pilihRuas(b.dataset.ruas, { buka: false });
  });
}

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
  $("pilihDasar").innerHTML = Object.entries(PETA_DASAR).map(([k, d]) =>
    `<button type="button" data-k="${k}" aria-pressed="${k === "gelap"}">${d.nama}</button>`).join("");
  $("pilihDasar").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-k]");
    if (!b) return;
    Peta.ubahDasar(b.dataset.k);
    for (const x of $("pilihDasar").children) x.setAttribute("aria-pressed", x === b);
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
  $("btnTentang").addEventListener("click", () => $("dlgTentang").showModal());
  $("btnPanel").addEventListener("click", () => bukaSheet(document.body.classList.contains("sisi-tutup")));
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
      detail: (id) => { pilihRuas(id, { buka: true }); if (mobile()) bukaSheet(true); },
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
  } catch (e) {
    galatFatal(e.message);
  }
});
