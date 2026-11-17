"use strict";
// Halaman Dashboard: angka kunci, komposisi, tren, peringkat Kab/Kota, ruas terparah, dan ringkasan validasi.
// Semua angka diambil dari REST API (PostGIS); filter Kab/Kota memuat ulang angka yang bergantung wilayah.

const $ = (id) => document.getElementById(id);
const D = { kab: "", daftarTahun: [], peringkat: [], grafik: {} };
const singkat = (s) => judul(s).replace(/^Kabupaten /, "Kab. ");

function gantiGrafik(nama, kanvas, konfigurasi) {
  if (D.grafik[nama]) D.grafik[nama].destroy();
  D.grafik[nama] = new Chart($(kanvas), konfigurasi);
}

// ---------------------------------------------------------------- angka kunci dan komposisi (Roadroid)
async function muatRingkasan() {
  const r = await api("/api/ringkasan", { kab_kota: D.kab || null });
  $("kMantap").textContent = fmt(r.persen_mantap, 1);
  $("kKm").textContent = fmt(r.km_survei, 0);
  $("kSegmen").textContent = `${fmt(r.jumlah_segmen, 0)} segmen ±1 km`;
  $("kRuas").textContent = fmt(r.jumlah_ruas, 0);
  $("kRuasKet").textContent = `panjang resmi ${fmt(r.panjang_ruas_km, 0)} km`;
  $("kIri").textContent = fmt(r.iri_rata2, 1);
  const kelas = r.iri_rata2 < 4 ? "baik" : r.iri_rata2 < 8 ? "sedang" : r.iri_rata2 < 12 ? "rusak ringan" : "rusak berat";
  $("kIriKet").textContent = `rata-rata berkelas ${kelas}`;

  const km = KONDISI.map((c) => r.km[c.nama] || 0);
  $("dKomposisi").innerHTML = KONDISI.map((c, i) => `<li><span><i class="titik" style="background:${c.warna}"></i>${c.nama}</span>
    <span>${fmt(km[i], 1)} km · ${fmt(r.km_survei ? (km[i] / r.km_survei) * 100 : 0, 1)}%</span></li>`).join("");
  gantiGrafik("komposisi", "cKomposisi", {
    type: "doughnut",
    data: {
      labels: KONDISI.map((c) => c.nama),
      datasets: [{ data: km, backgroundColor: KONDISI.map((c) => c.warna), borderWidth: 2,
                   borderColor: warnaTema("tinta-2"), temaWarna: { borderColor: "tinta-2" } }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "62%",
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (it) => `${it.label}: ${fmt(it.parsed, 1)} km` } },
      },
    },
  });
}

// ---------------------------------------------------------------- tren (Galura)
async function muatTren() {
  const data = await api("/api/tren", { kab_kota: D.kab || null });
  const awal = data[0], akhir = data[data.length - 1];
  $("dTrenKet").textContent = akhir
    ? `${fmt(akhir.persen_mantap, 1)}% jalan mantap pada ${akhir.tahun} (${akhir.persen_mantap >= awal.persen_mantap ? "+" : ""}${fmt(akhir.persen_mantap - awal.persen_mantap, 1)} poin sejak ${awal.tahun}).`
    : "Belum ada data.";
  const min = Math.max(0, Math.floor((Math.min(...data.map((d) => d.persen_mantap)) - 8) / 10) * 10);
  gantiGrafik("tren", "cTrenMantap", {
    type: "line",
    data: {
      labels: data.map((d) => d.tahun),
      datasets: [{ label: "Jalan mantap", data: data.map((d) => d.persen_mantap), tension: 0.25, pointRadius: 4, pointHoverRadius: 6, borderWidth: 2.5,
                   borderColor: warnaTema("aksen"), backgroundColor: warnaTema("aksen"), temaWarna: { borderColor: "aksen", backgroundColor: "aksen" } }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: { grid: { display: false } }, y: { min, max: 100, ticks: { callback: (v) => v + "%" } } },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (it) => {
          const d = data[it.dataIndex];
          return [`Mantap ${fmt(d.persen_mantap, 1)}%`, `Rusak berat ${fmt(d.total_km ? (d.km["Rusak Berat"] / d.total_km) * 100 : 0, 1)}%`];
        } } },
      },
    },
  });
}

// ---------------------------------------------------------------- tren per Kab/Kota (Galura)
// Grafik garis persen jalan mantap tiap Kab/Kota 2018-2025, supaya naik-turunnya terlihat.
// Garis tebal = rata-rata Jawa Barat (tertimbang panjang jalan); garis tipis = Kab/Kota lain.
// Arahkan kursor untuk menyorot satu wilayah, klik untuk menyaring seluruh dashboard ke wilayah itu.
async function muatPeringkat() {
  const hasil = await Promise.all(D.daftarTahun.map((t) => api("/api/peringkat", { tahun: t })));
  D.peringkat = D.daftarTahun.map((t, i) => ({ tahun: t, baris: hasil[i] }));
  gambarPeringkat();
}

// Tabel warna (heatmap): baris = Kab/Kota (urut dari yang paling mantap tahun terakhir), kolom = tahun.
// Warna sel mengikuti persen mantap (merah = banyak rusak, hijau = mantap). Kolom kanan: garis mini naik-turun
// dan perubahan dari tahun pertama ke tahun terakhir. Baris paling atas = rata-rata Jawa Barat.
const SKALA_HEAT = [[70, [214, 58, 47]], [80, [240, 138, 36]], [90, [242, 183, 5]], [100, [46, 158, 79]]];
function warnaHeat(v) {
  if (v == null) return "transparent";
  const x = Math.max(SKALA_HEAT[0][0], Math.min(100, v));
  for (let i = 1; i < SKALA_HEAT.length; i++) {
    const [v0, c0] = SKALA_HEAT[i - 1], [v1, c1] = SKALA_HEAT[i];
    if (x <= v1) { const f = (x - v0) / (v1 - v0); return `rgb(${c0.map((c, j) => Math.round(c + (c1[j] - c) * f)).join(",")})`; }
  }
  return "rgb(46,158,79)";
}
const teksHeat = (v) => (v != null && v >= 76 && v < 97 ? "#1E2329" : "#FFFFFF"); // sel kuning-oranye pakai teks gelap

function garisMini(nilai) {
  const ada = nilai.map((v, i) => [i, v]).filter(([, v]) => v != null);
  if (ada.length < 2) return "";
  const W = 84, H = 26, min = Math.min(...ada.map(([, v]) => v)), maks = Math.max(...ada.map(([, v]) => v));
  const y = (v) => (maks === min ? H / 2 : H - 3 - ((v - min) / (maks - min)) * (H - 6));
  const x = (i) => 3 + (i / (nilai.length - 1)) * (W - 6);
  const d = ada.map(([i, v], k) => `${k ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const [iA, vA] = ada[ada.length - 1];
  return `<svg class="mini" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${d}"/><circle cx="${x(iA).toFixed(1)}" cy="${y(vA).toFixed(1)}" r="2.6"/></svg>`;
}

function gambarPeringkat() {
  const seri = D.peringkat;
  if (!seri.length) return;
  const tahun = seri.map((s) => s.tahun);
  const kabs = [...new Set(seri.flatMap((s) => s.baris.map((r) => r.kab_kota)))];
  const nilai = (kab) => seri.map((s) => s.baris.find((r) => r.kab_kota === kab)?.persen_mantap ?? null);
  const rata = seri.map((s) => {
    const km = s.baris.reduce((a, r) => a + r.total_km, 0);
    return km ? (s.baris.reduce((a, r) => a + r.km_baik + r.km_sedang, 0) / km) * 100 : null;
  });
  const akhir = (v) => [...v].reverse().find((x) => x != null) ?? -1;
  const urut = kabs.map((k) => ({ kab: k, v: nilai(k) })).sort((a, b) => akhir(b.v) - akhir(a.v));
  const ubah = (v) => { const a = v.find((x) => x != null), z = [...v].reverse().find((x) => x != null); return a == null || z == null ? null : z - a; };
  const naik = urut.filter((r) => ubah(r.v) > 0.05).length, turun = urut.filter((r) => ubah(r.v) < -0.05).length;
  $("dRataPeringkat").textContent =
    `Rata-rata Jawa Barat ${fmt(rata[0], 1)}% (${tahun[0]}) → ${fmt(rata[rata.length - 1], 1)}% (${tahun[tahun.length - 1]}) · ${naik} wilayah naik, ${turun} turun`;

  const sel = (v, t) => `<td class="sel" style="background:${warnaHeat(v)};color:${teksHeat(v)}" title="${t}: ${v == null ? "tidak ada data" : fmt(v, 1) + "% mantap"}">${v == null ? "–" : fmt(v, v >= 99.95 ? 0 : 1)}</td>`;
  const panah = (d) => (d == null ? "" : Math.abs(d) < 0.05 ? `<span class="ubah tetap">tetap</span>`
    : `<span class="ubah ${d > 0 ? "naik" : "turun"}">${d > 0 ? "▲" : "▼"} ${fmt(Math.abs(d), 1)}</span>`);
  const baris = (nama, v, kab) => `<tr${kab ? ` data-kab="${esc(kab)}" tabindex="0"` : ' class="rata"'}${kab && kab === D.kab ? ' aria-selected="true"' : ""}>
      <th scope="row">${esc(nama)}</th>${v.map((x, i) => sel(x, tahun[i])).join("")}<td class="tren">${garisMini(v)}${panah(ubah(v))}</td></tr>`;
  $("dHeat").innerHTML = `
    <thead><tr><th scope="col">Kabupaten/Kota</th>${tahun.map((t) => `<th scope="col">${t}</th>`).join("")}<th scope="col" class="tren">Naik-turun</th></tr></thead>
    <tbody>${baris("Rata-rata Jawa Barat", rata, null)}${urut.map((r) => baris(singkat(r.kab), r.v, r.kab)).join("")}</tbody>`;
  $("dHeat").classList.toggle("ada-pilihan", !!D.kab);
}

// ---------------------------------------------------------------- status jalan / kewenangan (BPS 2019)
async function muatStatus() {
  D.status = await api("/api/kewenangan");
  gambarStatus();
}
function gambarStatus() {
  const s = D.status || [];
  if (!s.length) return;
  const JENIS = [["nasional", "Jalan nasional"], ["provinsi", "Jalan provinsi"], ["kabkota", "Jalan kab/kota"]];
  const tot = Object.fromEntries(JENIS.map(([k]) => [k, s.reduce((a, r) => a + r[k], 0)]));
  const semua = tot.nasional + tot.provinsi + tot.kabkota;
  $("dStatusRingkas").innerHTML = JENIS.map(([k, n]) => `<div><i style="background:${STATUS_JALAN[k].warna}"></i>
    <strong>${fmt(tot[k], 0)} km</strong><span>${n} · ${fmt((tot[k] / semua) * 100, 1)}%</span></div>`).join("") +
    `<div class="total"><strong>${fmt(semua, 0)} km</strong><span>total jalan di Jawa Barat</span></div>`;
  const pilih = (r) => !D.kab || r.kab_kota === D.kab;
  gantiGrafik("status", "cStatus", {
    type: "bar",
    data: {
      labels: s.map((r) => singkat(r.kab_kota)),
      datasets: JENIS.map(([k, n]) => ({
        label: n, data: s.map((r) => r[k]), borderWidth: 0, barPercentage: 0.8, categoryPercentage: 0.9,
        backgroundColor: s.map((r) => STATUS_JALAN[k].warna + (pilih(r) ? "" : "40")),
      })),
    },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false,
      scales: { x: { stacked: true, ticks: { callback: (v) => fmt(v, 0) + " km" } }, y: { stacked: true, grid: { display: false }, ticks: { autoSkip: false, font: { size: 11.5 } } } },
      plugins: {
        legend: { position: "top", align: "start", labels: { boxWidth: 12, boxHeight: 12, usePointStyle: true, pointStyle: "rectRounded" } },
        tooltip: { mode: "index", intersect: false, callbacks: {
          label: (it) => `${it.dataset.label}: ${fmt(it.parsed.x, 0)} km`,
          footer: (it) => { const r = s[it[0].dataIndex]; const t = r.nasional + r.provinsi + r.kabkota; return `Total ${fmt(t, 0)} km · provinsi ${fmt((r.provinsi / t) * 100, 1)}%`; },
        } },
      },
      onClick: (e, el) => { if (el.length) setKab(s[el[0].index].kab_kota === D.kab ? "" : s[el[0].index].kab_kota); },
      onHover: (e, el) => { e.native.target.style.cursor = el.length ? "pointer" : "default"; },
    },
  });
}

// ---------------------------------------------------------------- ruas terparah (Roadroid)
async function muatParah() {
  const data = await api("/api/ruas-terparah", { kab_kota: D.kab || null, limit: 10 });
  $("dParah").innerHTML = data.length
    ? data.map((r, i) => `<tr>
        <td>${i + 1}</td>
        <td><span class="nm">${esc(r.nm_ruas)}</span><span class="kab">${esc(judul(r.kab_kota))}</span></td>
        <td class="num"><span class="chip" style="background:${INFO[r.kondisi].warna};color:${INFO[r.kondisi].teks}">${fmt(r.iri_rata2, 2)}</span></td>
        <td><a class="tautan" href="peta.html?ruas=${encodeURIComponent(r.idruas)}">Peta →</a></td>
      </tr>`).join("")
    : '<tr><td colspan="4" class="bantu">Tidak ada data ruas.</td></tr>';
}

// ---------------------------------------------------------------- validasi (ringkas)
async function muatValidasi() {
  try {
    const v = await api("/api/validasi");
    const k = v.ringkasan.kebenaran || v.ringkasan, b = v.ringkasan.pembanding;
    $("dValidasi").innerHTML = `
      <div><strong>${k.lulus}<small> / ${k.total}</small></strong><span>uji kebenaran data lulus${k.perhatian ? `, ${k.perhatian} perlu perhatian` : ""}${k.gagal ? `, ${k.gagal} tidak sesuai` : ""}</span></div>
      <a class="tombol" href="validasi.html">Lihat rincian validasi →</a>`;
  } catch (e) { $("dValidasi").textContent = e.message; }
}

// ---------------------------------------------------------------- filter
async function setKab(nama) {
  D.kab = nama;
  $("dKab").value = nama;
  $("dLingkup").innerHTML = nama
    ? `${esc(judul(nama))} · <a class="tautan" href="peta.html?kab=${encodeURIComponent(nama)}">lihat di peta →</a>`
    : "Seluruh jalan provinsi Jawa Barat";
  gambarPeringkat();
  gambarStatus();
  try { await Promise.all([muatRingkasan(), muatTren(), muatParah()]); } catch (e) { $("dLingkup").textContent = e.message; }
}

document.addEventListener("temaberubah", () => { if (D.peringkat.length) gambarPeringkat(); gambarStatus(); });
document.addEventListener("click", (e) => {
  const tr = e.target.closest("#dHeat tr[data-kab]");
  if (tr) setKab(tr.dataset.kab === D.kab ? "" : tr.dataset.kab);
});
document.addEventListener("keydown", (e) => {
  const tr = e.target.closest && e.target.closest("#dHeat tr[data-kab]");
  if (tr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setKab(tr.dataset.kab === D.kab ? "" : tr.dataset.kab); }
});

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const meta = await api("/api/meta");
    $("dKab").insertAdjacentHTML("beforeend",
      meta.kabkota.map((k) => `<option value="${esc(k.nama)}">${esc(judul(k.nama))}</option>`).join(""));
    D.daftarTahun = [...meta.tahun].sort((a, b) => a - b);
    $("dKab").addEventListener("change", (e) => setKab(e.target.value));

    const kabAwal = new URLSearchParams(location.search).get("kab");
    D.kab = kabAwal && meta.kabkota.some((k) => k.nama === kabAwal) ? kabAwal : "";
    await Promise.all([muatPeringkat(), muatValidasi(), muatStatus()]);
    await setKab(D.kab);
  } catch (e) {
    $("dLingkup").textContent = e.message;
  }
});
