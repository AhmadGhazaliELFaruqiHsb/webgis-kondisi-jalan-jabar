"use strict";
// Halaman Validasi: hasil pemeriksaan otomatis dari GET /api/validasi (database/validasi_data.js), dikelompokkan.
// Yang ditampilkan hanya uji kebenaran data. Perbandingan dengan Galura (metode survei berbeda) tetap dihitung
// oleh server dan muncul di laporan terminal (npm run validasi), tetapi tidak ditampilkan di halaman ini.

const $ = (id) => document.getElementById(id);

const LABEL_STATUS = { lulus: "Lulus", perhatian: "Perhatian", gagal: "Tidak sesuai", berbeda: "Berbeda metode", info: "Catatan metode" };
const WARNA_STATUS = { lulus: ["#2E9E4F", "#1E2329"], perhatian: ["#F2B705", "#1E2329"], gagal: ["#D63A2F", "#FFFFFF"],
  berbeda: ["#2F6FDE", "#FFFFFF"], info: ["#BFD7F5", "#1E2329"] };

function gambarValidasi(v) {
  const r = v.ringkasan;
  const uji = v.pemeriksaan.filter((p) => (p.jenis || "kebenaran") === "kebenaran");
  const kelompok = [...new Set(uji.map((p) => p.kelompok))];
  const chip = (s) => `<span class="chip" style="background:${WARNA_STATUS[s][0]};color:${WARNA_STATUS[s][1]}">${LABEL_STATUS[s]}</span>`;
  const k = r.kebenaran || r;
  $("isiValidasi").innerHTML = `
    <section class="kartu ringkas-jenis">
      <h2>Uji kebenaran data</h2>
      <p class="bantu">Apakah data di aplikasi benar, lengkap, dan konsisten, termasuk dicek silang dengan olahan resmi DBMPR dari survei yang sama dan dengan statistik panjang jalan BPS.</p>
      <div class="ringkas-validasi">
        <div><strong>${k.lulus}</strong><span>lulus</span></div>
        <div><strong>${k.perhatian}</strong><span>perlu perhatian</span></div>
        <div><strong>${k.gagal}</strong><span>tidak sesuai</span></div>
        <p>dari ${k.total} pemeriksaan.${k.info ? ` Ditambah ${k.info} catatan metode yang tidak dihitung sebagai uji.` : ""}</p>
      </div>
    </section>
    ${kelompok.map((g) => `
      <h3>${esc(g)}</h3>
      <ul class="daftar-cek">
        ${uji.filter((p) => p.kelompok === g).map((p) => `
          <li>
            <div class="baris-cek">${chip(p.status)}<span class="nama-cek">${esc(p.nama)}</span></div>
            <div class="hasil-cek">${esc(p.hasil)}</div>
            ${p.keterangan ? `<div class="ket-cek">${esc(p.keterangan)}</div>` : ""}
          </li>`).join("")}
      </ul>`).join("")}
    <p class="sumber">Pemeriksaan dijalankan oleh server pada ${new Date(v.dibuat).toLocaleString("id-ID")}. Laporan yang sama dapat dibuat dengan perintah npm run validasi.</p>`;
}

document.addEventListener("DOMContentLoaded", async () => {
  try { gambarValidasi(await api("/api/validasi")); }
  catch (e) { $("isiValidasi").textContent = e.message; }
});
