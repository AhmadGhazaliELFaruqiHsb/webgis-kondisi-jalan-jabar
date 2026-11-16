"use strict";
// Halaman Dashboard: angka kunci, komposisi, tren, peringkat Kab/Kota, ruas terparah, dan ringkasan validasi.
// Semua angka diambil dari REST API (PostGIS); filter Kab/Kota memuat ulang angka yang bergantung wilayah.

const $ = (id) => document.getElementById(id);
const D = { kab: "", tahun: null, peringkat: [], grafik: {} };
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

// ---------------------------------------------------------------- peringkat Kab/Kota (Galura)
async function muatPeringkat() {
  D.peringkat = await api("/api/peringkat", { tahun: D.tahun });
  gambarPeringkat();
}

function gambarPeringkat() {
  const p = D.peringkat;
  const warna = p.map((r) => (r.kab_kota === D.kab ? warnaTema("aksen") : warnaTema("bar-mantap")));
  gantiGrafik("peringkat", "cPeringkat", {
    type: "bar",
    data: { labels: p.map((r) => singkat(r.kab_kota)), datasets: [{ data: p.map((r) => r.persen_mantap), backgroundColor: warna, borderWidth: 0, barPercentage: 0.75 }] },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false,
      scales: {
        x: { min: Math.max(0, Math.floor((Math.min(...p.map((r) => r.persen_mantap)) - 5) / 10) * 10), max: 100, ticks: { callback: (v) => v + "%" } },
        y: { grid: { display: false }, ticks: { autoSkip: false, font: { size: 11.5 } } },
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (it) => `Mantap ${fmt(it.parsed.x, 1)}%, rusak berat ${fmt(p[it.dataIndex].km_rusak_berat, 1)} km` } },
      },
      onClick: (e, el) => { if (el.length) setKab(p[el[0].index].kab_kota === D.kab ? "" : p[el[0].index].kab_kota); },
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
      ${b ? `<div><strong>${b.lulus}<small> / ${b.total}</small></strong><span>sesuai dengan Galura${b.berbeda ? `, ${b.berbeda} berbeda metode survei` : ""}</span></div>` : ""}
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
  try { await Promise.all([muatRingkasan(), muatTren(), muatParah()]); } catch (e) { $("dLingkup").textContent = e.message; }
}

document.addEventListener("temaberubah", () => { if (D.peringkat.length) gambarPeringkat(); });

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const meta = await api("/api/meta");
    $("dKab").insertAdjacentHTML("beforeend",
      meta.kabkota.map((k) => `<option value="${esc(k.nama)}">${esc(judul(k.nama))}</option>`).join(""));
    const tahun = [...meta.tahun].sort((a, b) => b - a);
    D.tahun = tahun[0];
    $("dTahun").innerHTML = tahun.map((t) => `<option value="${t}">${t}</option>`).join("");
    $("dKab").addEventListener("change", (e) => setKab(e.target.value));
    $("dTahun").addEventListener("change", (e) => { D.tahun = Number(e.target.value); muatPeringkat(); });

    const kabAwal = new URLSearchParams(location.search).get("kab");
    D.kab = kabAwal && meta.kabkota.some((k) => k.nama === kabAwal) ? kabAwal : "";
    await Promise.all([muatPeringkat(), muatValidasi()]);
    await setKab(D.kab);
  } catch (e) {
    $("dLingkup").textContent = e.message;
  }
});
