"use strict";
// Halaman Validasi: hasil 19 pemeriksaan otomatis dari GET /api/validasi (database/validasi_data.js),
// dikelompokkan, ditambah grafik sebar Roadroid vs Galura per Kabupaten/Kota.

const $ = (id) => document.getElementById(id);

const LABEL_STATUS = { lulus: "Lulus", perhatian: "Perhatian", gagal: "Tidak sesuai" };
const WARNA_STATUS = { lulus: ["#2E9E4F", "#1E2329"], perhatian: ["#F2B705", "#1E2329"], gagal: ["#D63A2F", "#FFFFFF"] };

function gambarValidasi(v) {
  const r = v.ringkasan;
  const kelompok = [...new Set(v.pemeriksaan.map((p) => p.kelompok))];
  const chip = (s) => `<span class="chip" style="background:${WARNA_STATUS[s][0]};color:${WARNA_STATUS[s][1]}">${LABEL_STATUS[s]}</span>`;
  $("isiValidasi").innerHTML = `
    <div class="ringkas-validasi">
      <div><strong>${r.lulus}</strong><span>lulus</span></div>
      <div><strong>${r.perhatian}</strong><span>perlu perhatian</span></div>
      <div><strong>${r.gagal}</strong><span>tidak sesuai</span></div>
      <p>dari ${r.total} pemeriksaan otomatis pada data di PostGIS.</p>
    </div>
    ${kelompok.map((g) => `
      <h3>${esc(g)}</h3>
      <ul class="daftar-cek">
        ${v.pemeriksaan.filter((p) => p.kelompok === g).map((p) => `
          <li>
            <div class="baris-cek">${chip(p.status)}<span class="nama-cek">${esc(p.nama)}</span></div>
            <div class="hasil-cek">${esc(p.hasil)}</div>
            ${p.keterangan ? `<div class="ket-cek">${esc(p.keterangan)}</div>` : ""}
          </li>`).join("")}
      </ul>`).join("")}
    <h3>Roadroid dibandingkan Galura ${v.banding.tahun}, per Kabupaten/Kota</h3>
    <p class="bantu">Setiap titik adalah satu Kabupaten/Kota (persen jalan mantap). Jika kedua sumber sejalan, titik-titik akan berada di sekitar garis putus-putus. Korelasi r = ${fmt(v.banding.korelasi, 2)}.</p>
    <div class="kotak-grafik tinggi"><canvas id="cValidasi" role="img" aria-label="Grafik sebar persen jalan mantap Roadroid terhadap Galura per Kabupaten/Kota"></canvas></div>
    <details class="rincian">
      <summary>Lihat tabel per Kabupaten/Kota</summary>
      <div class="tabel-bungkus"><table class="tabel">
        <thead><tr><th scope="col">Kabupaten/Kota</th><th scope="col" class="num">Roadroid</th><th scope="col" class="num">Galura</th><th scope="col" class="num">Selisih</th></tr></thead>
        <tbody>${v.banding.per_kabkota.map((b) => `<tr><td>${esc(judul(b.kab_kota))}</td><td class="num">${fmt(b.roadroid, 1)}%</td><td class="num">${fmt(b.galura, 1)}%</td><td class="num">${fmt(b.selisih, 1)}</td></tr>`).join("")}</tbody>
      </table></div>
    </details>
    <p class="sumber">Pemeriksaan dijalankan oleh server pada ${new Date(v.dibuat).toLocaleString("id-ID")}. Laporan yang sama dapat dibuat dengan perintah npm run validasi.</p>`;

  new Chart($("cValidasi"), {
    type: "scatter",
    data: {
      datasets: [
        { label: "Kabupaten/Kota", data: v.banding.per_kabkota.map((b) => ({ x: b.galura, y: b.roadroid, nama: b.kab_kota })),
          backgroundColor: warnaTema("aksen"), borderColor: warnaTema("tinta"), temaWarna: { backgroundColor: "aksen", borderColor: "tinta" }, pointRadius: 5, pointHoverRadius: 7 },
        { type: "line", label: "Sejalan (y = x)", data: [{ x: 30, y: 30 }, { x: 100, y: 100 }], borderColor: warnaTema("garis-ambang"), temaWarna: { borderColor: "garis-ambang" }, borderDash: [6, 5], borderWidth: 1.5, pointRadius: 0 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { min: 30, max: 100, title: { display: true, text: "Galura (persen jalan mantap)" } },
        y: { min: 30, max: 100, title: { display: true, text: "Roadroid (persen jalan mantap)" } },
      },
      plugins: {
        legend: { display: false },
        tooltip: { filter: (it) => it.datasetIndex === 0, callbacks: {
          title: (it) => judul(it[0].raw.nama),
          label: (it) => `Roadroid ${fmt(it.raw.y, 1)}%, Galura ${fmt(it.raw.x, 1)}%`,
        } },
      },
    },
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  try { gambarValidasi(await api("/api/validasi")); }
  catch (e) { $("isiValidasi").textContent = e.message; }
});
