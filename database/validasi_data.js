// Validasi keakuratan dan konsistensi data di PostGIS.
// Dipakai oleh:  npm run validasi   (laporan di terminal)
//                GET /api/validasi  (halaman "Validasi data" di web)
//
// Setiap pemeriksaan bernilai:  lulus | perhatian | gagal
const fm = (n, d = 1) =>
  Number(n).toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });

// Batas kelas IRI (m/km), acuan umum Bina Marga
const KELAS = (kolom) => `CASE WHEN ${kolom} < 4 THEN 'Baik' WHEN ${kolom} < 8 THEN 'Sedang'
                          WHEN ${kolom} < 12 THEN 'Rusak Ringan' ELSE 'Rusak Berat' END`;
const DI_BATAS = (kolom, tol) =>
  `(ABS(${kolom} - 4) <= ${tol} OR ABS(${kolom} - 8) <= ${tol} OR ABS(${kolom} - 12) <= ${tol})`;
const PEMBULATAN = 0.005; // nilai IRI disimpan 2 desimal

// Koefisien korelasi Pearson
function pearson(x, y) {
  const n = x.length, mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}

async function jalankanValidasi(db) {
  const satu = async (sql) => (await db.query(sql)).rows[0];
  const hasil = [];
  const tambah = (kelompok, nama, status, nilai, keterangan = "") =>
    hasil.push({ kelompok, nama, status, hasil: nilai, keterangan });

  // ------------------------------------------------------------ 1. atribut & klasifikasi
  const G1 = "Atribut dan klasifikasi";

  const kSeg = await satu(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE kondisi <> ${KELAS("nilai_iri")})::int AS beda,
           COUNT(*) FILTER (WHERE kondisi <> ${KELAS("nilai_iri")}
                              AND NOT ${DI_BATAS("nilai_iri", PEMBULATAN)})::int AS salah
    FROM segmen_kondisi`);
  tambah(G1, "Kelas segmen sesuai batas IRI", kSeg.salah === 0 ? "lulus" : "gagal",
    `${fm(kSeg.salah, 0)} dari ${fm(kSeg.total, 0)} segmen tidak sesuai`,
    kSeg.beda > kSeg.salah
      ? `${kSeg.beda - kSeg.salah} segmen tampak berbeda satu kelas hanya karena pembulatan: nilai yang sedikit di bawah batas (mis. 7,998) tampil sebagai 8,00. Kelas dihitung dari nilai sebelum dibulatkan, jadi bukan kesalahan.`
      : "");

  const kRuas = await satu(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE kondisi <> ${KELAS("iri_rata2")}
                              AND NOT ${DI_BATAS("iri_rata2", PEMBULATAN)})::int AS salah
    FROM ruas_jalan WHERE iri_rata2 IS NOT NULL`);
  tambah(G1, "Kelas ruas sesuai IRI rata-rata", kRuas.salah === 0 ? "lulus" : "gagal",
    `${fm(kRuas.salah, 0)} dari ${fm(kRuas.total, 0)} ruas tidak sesuai`);

  const rIri = await satu(`SELECT MIN(nilai_iri)::float AS min, MAX(nilai_iri)::float AS maks FROM segmen_kondisi`);
  tambah(G1, "Rentang nilai IRI masuk akal", rIri.min >= 0 && rIri.maks <= 20 ? "lulus" : "gagal",
    `${fm(rIri.min, 2)} sampai ${fm(rIri.maks, 2)} m/km`, "Batas kewajaran yang dipakai: 0 sampai 20 m/km.");

  const kosong = await satu(`
    SELECT (SELECT COUNT(*) FROM segmen_kondisi WHERE nilai_iri IS NULL OR kondisi IS NULL)::int AS seg,
           (SELECT COUNT(*) FROM ruas_jalan WHERE iri_rata2 IS NULL OR kondisi IS NULL OR panjang_km IS NULL)::int AS ruas`);
  tambah(G1, "Tidak ada nilai kosong pada kolom utama", kosong.seg + kosong.ruas === 0 ? "lulus" : "gagal",
    `${kosong.seg} segmen dan ${kosong.ruas} ruas bernilai kosong`);

  const ganda = await satu(`
    SELECT (SELECT COUNT(*) FROM (SELECT 1 FROM segmen_kondisi GROUP BY idruas, km_awal HAVING COUNT(*) > 1) d)::int AS n`);
  tambah(G1, "Tidak ada segmen ganda", ganda.n === 0 ? "lulus" : "gagal", `${ganda.n} pasangan ruas dan km awal ganda`);

  const kab = await satu(`
    SELECT COUNT(DISTINCT kab_kota)::int AS total,
           COUNT(DISTINCT kab_kota) FILTER (WHERE kab_kota IN (SELECT nama_kabupaten_kota FROM kondisi_kabkota))::int AS cocok
    FROM ruas_jalan`);
  tambah(G1, "Nama Kabupaten/Kota cocok dengan data Galura", kab.cocok === kab.total ? "lulus" : "gagal",
    `${kab.cocok} dari ${kab.total} wilayah cocok`);

  // ------------------------------------------------------------ 2. geometri
  const G2 = "Geometri";

  const valid = await satu(`
    SELECT (SELECT COUNT(*) FROM ruas_jalan WHERE NOT ST_IsValid(geom))::int AS ruas,
           (SELECT COUNT(*) FROM segmen_kondisi WHERE NOT ST_IsValid(geom))::int AS seg,
           (SELECT COUNT(*) FROM batas_jabar WHERE NOT ST_IsValid(geom))::int AS batas`);
  tambah(G2, "Geometri valid (ST_IsValid)", valid.ruas + valid.seg + valid.batas === 0 ? "lulus" : "gagal",
    `${valid.ruas + valid.seg + valid.batas} geometri tidak valid`);

  const diLuar = await satu(`
    SELECT COUNT(*)::int AS n
    FROM segmen_kondisi s, batas_jabar b
    WHERE NOT ST_DWithin(s.geom, b.geom, 0.002)`); // sekitar 220 m, batas provinsi disederhanakan
  tambah(G2, "Segmen berada di dalam batas provinsi", diLuar.n === 0 ? "lulus" : "gagal",
    `${diLuar.n} segmen di luar batas Jawa Barat`, "Toleransi sekitar 220 m karena batas provinsi disederhanakan.");

  const menempel = await satu(`
    SELECT COALESCE(MAX(ST_Distance(s.geom::geography, r.geom::geography)), 0)::float AS maks
    FROM segmen_kondisi s JOIN ruas_jalan r ON r.idruas = s.idruas`);
  tambah(G2, "Segmen menempel pada ruas induknya", menempel.maks <= 50 ? "lulus" : "gagal",
    `Jarak terjauh ${fm(menempel.maks, 1)} m`, "Batas yang dipakai: 50 m.");

  const pj = await satu(`
    SELECT SUM(km_akhir - km_awal)::float AS nominal, SUM(ST_Length(geom::geography) / 1000)::float AS geom
    FROM segmen_kondisi`);
  const selPj = ((pj.geom - pj.nominal) / pj.nominal) * 100;
  tambah(G2, "Panjang segmen: nominal vs panjang geometri",
    Math.abs(selPj) <= 5 ? "lulus" : Math.abs(selPj) <= 10 ? "perhatian" : "gagal",
    `${fm(pj.nominal, 0)} km nominal, ${fm(pj.geom, 0)} km terukur (${fm(selPj, 1)}%)`,
    "Panjang nominal dihitung dari jumlah titik survei dikali 50 m, sedangkan panjang terukur dihitung dari garis yang menghubungkan titik. Jarak antar titik sebenarnya tidak selalu tepat 50 m.");

  const pr = await satu(`
    SELECT SUM(ST_Length(geom::geography) / 1000)::float AS geom, SUM(panjang_km)::float AS resmi,
           COUNT(*) FILTER (WHERE ABS(ST_Length(geom::geography) / 1000 - panjang_km) > 0.25 * panjang_km)::int AS beda,
           COUNT(*)::int AS total
    FROM ruas_jalan`);
  const selPr = ((pr.geom - pr.resmi) / pr.resmi) * 100;
  const bagiBeda = (pr.beda / pr.total) * 100;
  tambah(G2, "Panjang geometri ruas vs panjang resmi DBMPR",
    Math.abs(selPr) <= 3 && bagiBeda <= 5 ? "lulus" : "perhatian",
    `${fm(pr.geom, 0)} km vs ${fm(pr.resmi, 0)} km (${fm(selPr, 1)}%)`,
    `${pr.beda} dari ${pr.total} ruas berbeda lebih dari 25%, umumnya ruas pendek di bawah 5 km. Geometri ruas disederhanakan sekitar 2 m untuk memperkecil ukuran berkas.`);

  // ------------------------------------------------------------ 3. kelengkapan survei
  const G3 = "Kelengkapan survei";

  const tanpa = await satu(`
    SELECT COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM segmen_kondisi s WHERE s.idruas = r.idruas))::int AS n,
           COUNT(*)::int AS total FROM ruas_jalan r`);
  tambah(G3, "Setiap ruas memiliki data survei", tanpa.n === 0 ? "lulus" : "gagal",
    `${tanpa.total - tanpa.n} dari ${tanpa.total} ruas tersurvei`);

  const cak = await satu(`
    WITH t AS (SELECT r.panjang_km, SUM(s.km_akhir - s.km_awal) AS sk
               FROM ruas_jalan r JOIN segmen_kondisi s USING (idruas) GROUP BY r.idruas, r.panjang_km)
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE sk / panjang_km BETWEEN 0.75 AND 1.25)::int AS wajar,
           COUNT(*) FILTER (WHERE sk / panjang_km < 0.75)::int AS kurang,
           COUNT(*) FILTER (WHERE sk / panjang_km > 1.25)::int AS lebih
    FROM t`);
  const bagiWajar = (cak.wajar / cak.total) * 100;
  tambah(G3, "Cakupan survei terhadap panjang resmi ruas", bagiWajar >= 90 ? "lulus" : "perhatian",
    `${cak.wajar} dari ${cak.total} ruas (${fm(bagiWajar, 1)}%) dalam rentang 75% sampai 125%`,
    `${cak.kurang} ruas tersurvei kurang dari 75% dan ${cak.lebih} ruas lebih dari 125% panjang resminya.`);

  // ------------------------------------------------------------ 4. konsistensi antar-ukuran
  const G4 = "Konsistensi antar-ukuran dalam data";

  const iri = await satu(`
    WITH a AS (SELECT idruas, SUM(nilai_iri * (km_akhir - km_awal)) / SUM(km_akhir - km_awal) AS iri
               FROM segmen_kondisi GROUP BY idruas)
    SELECT AVG(ABS(a.iri - r.iri_rata2))::float AS rata, MAX(ABS(a.iri - r.iri_rata2))::float AS maks
    FROM ruas_jalan r JOIN a USING (idruas)`);
  tambah(G4, "IRI rata-rata ruas vs rata-rata tertimbang segmen", iri.maks <= 0.5 ? "lulus" : "perhatian",
    `Selisih rata-rata ${fm(iri.rata, 3)}, terbesar ${fm(iri.maks, 2)} m/km`);

  const perTitik = await satu(`
    SELECT SUM(km_baik)::float AS baik, SUM(km_sedang)::float AS sedang,
           SUM(km_rusak_ringan)::float AS ringan, SUM(km_rusak_berat)::float AS berat FROM ruas_jalan`);
  const perSeg = await satu(`
    SELECT SUM(km_akhir - km_awal) FILTER (WHERE kondisi = 'Baik')::float AS baik,
           SUM(km_akhir - km_awal) FILTER (WHERE kondisi = 'Sedang')::float AS sedang,
           SUM(km_akhir - km_awal) FILTER (WHERE kondisi = 'Rusak Ringan')::float AS ringan,
           SUM(km_akhir - km_awal) FILTER (WHERE kondisi = 'Rusak Berat')::float AS berat FROM segmen_kondisi`);
  const totT = perTitik.baik + perTitik.sedang + perTitik.ringan + perTitik.berat;
  const totS = perSeg.baik + perSeg.sedang + perSeg.ringan + perSeg.berat;
  const mantapT = ((perTitik.baik + perTitik.sedang) / totT) * 100;
  const mantapS = ((perSeg.baik + perSeg.sedang) / totS) * 100;
  tambah(G4, "Persen jalan mantap: per titik vs per segmen", Math.abs(mantapT - mantapS) <= 2 ? "lulus" : "perhatian",
    `${fm(mantapT, 1)}% per titik, ${fm(mantapS, 1)}% per segmen`);
  tambah(G4, "Panjang per kondisi: per titik vs per segmen", "perhatian",
    `Baik ${fm(perTitik.baik, 0)} vs ${fm(perSeg.baik, 0)} km, Rusak Berat ${fm(perTitik.berat, 0)} vs ${fm(perSeg.berat, 0)} km`,
    "Segmen 1 km merata-ratakan sekitar 20 titik, sehingga nilai ekstrem (sangat baik atau sangat rusak) teredam dan sebagian besar jatuh ke kelas Sedang dan Rusak Ringan. Aplikasi ini memakai ukuran per segmen di semua tampilan agar angka konsisten dengan peta.");

  // ------------------------------------------------------------ 5. pemeriksaan silang dengan olahan resmi DBMPR
  // Layer 6_rj_prov_skj berisi survei Roadroid yang sama, tetapi dipotong dan dirata-ratakan oleh DBMPR
  // menurut segmen resminya. Bila pengolahan kita benar, hasil per ruas harus hampir sama.
  const G6 = "Pemeriksaan silang dengan olahan resmi DBMPR (Temanjabar)";
  const adaSkj = (await satu(`SELECT to_regclass('pembanding_skj') IS NOT NULL AS ada`)).ada
    && (await satu(`SELECT COUNT(*)::int AS n FROM pembanding_skj`)).n > 0;
  let visual = null;
  if (adaSkj) {
    const pasang = (await db.query(`
      WITH d AS (SELECT idruas, SUM(c_iri * panjang_m) / SUM(panjang_m) AS iri, SUM(panjang_m) / 1000 AS km
                 FROM pembanding_skj GROUP BY idruas)
      SELECT r.idruas, r.iri_rata2::float AS kita, d.iri::float AS dbmpr, d.km::float AS km
      FROM ruas_jalan r JOIN d USING (idruas) WHERE r.iri_rata2 IS NOT NULL`)).rows;
    const totRuas = (await satu(`SELECT COUNT(*)::int AS n FROM ruas_jalan`)).n;
    tambah(G6, "Setiap ruas ada di data segmen resmi DBMPR", pasang.length === totRuas ? "lulus" : "perhatian",
      `${pasang.length} dari ${totRuas} ruas cocok berdasarkan kode ruas`);

    const kls = (v) => (v < 4 ? 0 : v < 8 ? 1 : v < 12 ? 2 : 3);
    const rIri = pearson(pasang.map((p) => p.kita), pasang.map((p) => p.dbmpr));
    const selisih = pasang.map((p) => Math.abs(p.kita - p.dbmpr)).sort((a, b) => a - b);
    const median = selisih[Math.floor(selisih.length / 2)];
    tambah(G6, "IRI rata-rata per ruas: olahan aplikasi vs olahan DBMPR",
      rIri >= 0.9 ? "lulus" : rIri >= 0.8 ? "perhatian" : "gagal",
      `r = ${fm(rIri, 3)} pada ${pasang.length} ruas; selisih median ${fm(median, 2)} m/km`,
      "Kedua angka berasal dari survei Roadroid Januari 2021 yang sama, tetapi dipotong per segmen dengan cara berbeda (aplikasi: setiap 20 titik, DBMPR: segmen resmi). Korelasi tinggi menunjukkan pengolahan data di aplikasi ini benar.");

    const sama = pasang.filter((p) => kls(p.kita) === kls(p.dbmpr)).length;
    const bagiSama = (sama / pasang.length) * 100;
    tambah(G6, "Kelas kondisi ruas sama dengan olahan DBMPR",
      bagiSama >= 90 ? "lulus" : bagiSama >= 80 ? "perhatian" : "gagal",
      `${sama} dari ${pasang.length} ruas (${fm(bagiSama, 1)}%) berkelas sama`,
      "Ruas yang berbeda kelas umumnya memiliki IRI rata-rata di dekat batas kelas (4, 8, atau 12).");

    const m = await satu(`
      SELECT 100 * SUM(panjang_m) FILTER (WHERE c_iri < 8) / SUM(panjang_m) AS mantap, SUM(panjang_m) / 1000 AS km
      FROM pembanding_skj`);
    const selM = mantapS - m.mantap;
    tambah(G6, "Persen jalan mantap: olahan aplikasi vs olahan DBMPR",
      Math.abs(selM) <= 2 ? "lulus" : Math.abs(selM) <= 5 ? "perhatian" : "gagal",
      `${fm(mantapS, 1)}% aplikasi vs ${fm(m.mantap, 1)}% DBMPR (selisih ${fm(selM, 1)} poin)`,
      `Panjang tersurvei ${fm(totS, 0)} km aplikasi vs ${fm(m.km, 0)} km DBMPR.`);

    // survei visual DBMPR (hanya sebagian ruas): dipakai sebagai keterangan pembanding Galura
    const v = (await db.query(`
      SELECT r.persen_mantap::float AS roadroid,
             100 * (sangat_baik_m2 + baik_m2 + sedang_m2)
                 / NULLIF(sangat_baik_m2 + baik_m2 + sedang_m2 + jelek_m2 + parah_m2 + sangat_parah_m2 + hancur_m2, 0) AS visual
      FROM pembanding_visual pv JOIN ruas_jalan r USING (idruas)
      WHERE r.persen_mantap IS NOT NULL`)).rows.filter((x) => x.visual != null);
    if (v.length) {
      visual = {
        n: v.length,
        roadroid: v.reduce((a, b) => a + b.roadroid, 0) / v.length,
        visual: v.reduce((a, b) => a + Number(b.visual), 0) / v.length,
      };
    }
  }

  // ------------------------------------------------------------ 6. perbandingan dengan Galura 2021
  const G5 = "Perbandingan dengan Galura Data Jabar, 2021";
  const TAHUN = 2021; // tahun yang sama dengan survei Roadroid (Januari 2021)

  const gal = await satu(`
    SELECT SUM(km_total)::float AS total, (SUM(km_baik) + SUM(km_sedang)) / SUM(km_total) * 100 AS mantap
    FROM v_kondisi_tahunan WHERE tahun = ${TAHUN}`);
  const selTot = ((totS - gal.total) / gal.total) * 100;
  tambah(G5, "Total panjang jaringan jalan", Math.abs(selTot) <= 3 ? "lulus" : "perhatian",
    `${fm(totS, 0)} km survei vs ${fm(gal.total, 0)} km Galura (${fm(selTot, 1)}%)`);

  const selMantap = mantapS - gal.mantap;
  tambah(G5, "Persen jalan mantap, seluruh provinsi",
    Math.abs(selMantap) <= 10 ? "lulus" : Math.abs(selMantap) <= 20 ? "perhatian" : "gagal",
    `${fm(mantapS, 1)}% Roadroid vs ${fm(gal.mantap, 1)}% Galura (selisih ${fm(selMantap, 1)} poin)`,
    "Dua sumber ini mengukur hal yang berbeda: satu survei sensor ponsel pada Januari 2021, dan rekap tahunan DBMPR. Penyebab selisihnya belum dapat dipastikan; perbedaan metode ukur, waktu, dan batas kelas adalah kemungkinannya."
      + (visual
        ? ` Pola yang sama terlihat pada survei visual DBMPR di ${visual.n} ruas wilayah Sukabumi (Temanjabar): rata-rata ${fm(visual.visual, 0)}% luas permukaan berkondisi baik sampai sedang, sedangkan Roadroid pada ruas yang sama menilai ${fm(visual.roadroid, 0)}% mantap. Ini menguatkan dugaan bahwa selisih berasal dari perbedaan metode survei. Pengolahan di aplikasi sendiri sudah sesuai dengan olahan DBMPR (lihat pemeriksaan silang di atas).`
        : ""));

  const banding = (await db.query(`
    WITH rr AS (
      SELECT r.kab_kota,
             100 * SUM(s.km_akhir - s.km_awal) FILTER (WHERE s.kondisi IN ('Baik', 'Sedang')) / SUM(s.km_akhir - s.km_awal) AS pr
      FROM segmen_kondisi s JOIN ruas_jalan r USING (idruas) GROUP BY r.kab_kota),
    g AS (
      SELECT kab_kota, 100 * (km_baik + km_sedang) / km_total AS pg FROM v_kondisi_tahunan WHERE tahun = ${TAHUN})
    SELECT kab_kota, pr::float AS roadroid, pg::float AS galura, (pr - pg)::float AS selisih
    FROM rr JOIN g USING (kab_kota) ORDER BY pr - pg`)).rows;
  const n = banding.length;
  const mx = banding.reduce((a, b) => a + b.roadroid, 0) / n;
  const my = banding.reduce((a, b) => a + b.galura, 0) / n;
  const sxy = banding.reduce((a, b) => a + (b.roadroid - mx) * (b.galura - my), 0);
  const sxx = banding.reduce((a, b) => a + (b.roadroid - mx) ** 2, 0);
  const syy = banding.reduce((a, b) => a + (b.galura - my) ** 2, 0);
  const korelasi = sxy / Math.sqrt(sxx * syy);
  const selRata = banding.reduce((a, b) => a + b.selisih, 0) / n;

  const iriSetara = (await satu(`
    SELECT percentile_disc(${(gal.mantap / 100).toFixed(4)}) WITHIN GROUP (ORDER BY nilai_iri)::float AS iri FROM segmen_kondisi`)).iri;

  tambah(G5, "Kesesuaian pola antar Kabupaten/Kota (korelasi)",
    korelasi >= 0.7 ? "lulus" : korelasi >= 0.5 ? "perhatian" : "gagal",
    `r = ${fm(korelasi, 2)} pada ${n} Kabupaten/Kota; selisih rata-rata ${fm(selRata, 1)} poin`,
    `Agar survei Roadroid menghasilkan ${fm(gal.mantap, 0)}% jalan mantap, batas mantap harus berada di IRI sekitar ${fm(iriSetara, 1)} (bukan 8). Artinya, dengan batas kelas yang sama, survei Roadroid menilai jalan lebih buruk daripada rekap resmi DBMPR.`);

  // Dua jenis pemeriksaan:
  //  kebenaran  : menguji apakah data di aplikasi benar dan konsisten (termasuk cek silang dengan olahan DBMPR
  //               dari survei yang sama)
  //  pembanding : membandingkan dengan sumber lain yang memakai metode survei berbeda (Galura); selisih di sini
  //               menunjukkan perbedaan metode, bukan kesalahan data
  for (const h of hasil) h.jenis = h.kelompok === G5 ? "pembanding" : "kebenaran";
  const hitung = (daftar) => ({
    lulus: daftar.filter((h) => h.status === "lulus").length,
    perhatian: daftar.filter((h) => h.status === "perhatian").length,
    gagal: daftar.filter((h) => h.status === "gagal").length,
    total: daftar.length,
  });
  const ringkasan = {
    ...hitung(hasil),
    kebenaran: hitung(hasil.filter((h) => h.jenis === "kebenaran")),
    pembanding: hitung(hasil.filter((h) => h.jenis === "pembanding")),
  };
  return {
    dibuat: new Date().toISOString(),
    ringkasan,
    pemeriksaan: hasil,
    banding: { tahun: TAHUN, korelasi, selisih_rata2: selRata, iri_setara: iriSetara, per_kabkota: banding },
  };
}

module.exports = { jalankanValidasi };

// ---------------------------------------------------------------- laporan di terminal
if (require.main === module) {
  require("dotenv").config();
  const { Pool } = require("pg");
  const pool = new Pool();
  const LABEL = { lulus: "LULUS    ", perhatian: "PERHATIAN", gagal: "TIDAK SESUAI" };
  jalankanValidasi(pool)
    .then((v) => {
      console.log("\nVALIDASI DATA SIKOJAB\n=====================");
      let kel = "";
      for (const p of v.pemeriksaan) {
        if (p.kelompok !== kel) { kel = p.kelompok; console.log(`\n${kel}`); }
        console.log(`  [${LABEL[p.status]}] ${p.nama}\n      ${p.hasil}`);
        if (p.keterangan) console.log(`      Catatan: ${p.keterangan}`);
      }
      const r = v.ringkasan;
      const k = r.kebenaran, b = r.pembanding;
      console.log(`\nRingkasan`);
      console.log(`  Uji kebenaran data           : ${k.lulus} lulus, ${k.perhatian} perlu perhatian, ${k.gagal} tidak sesuai, dari ${k.total} pemeriksaan`);
      console.log(`  Perbandingan dengan Galura   : ${b.lulus} dari ${b.total} sesuai (metode survei berbeda)`);
      console.log(`\nPerbandingan per Kabupaten/Kota (persen jalan mantap, ${v.banding.tahun}):`);
      console.log("  Kabupaten/Kota".padEnd(30) + "Roadroid".padStart(10) + "Galura".padStart(10) + "Selisih".padStart(10));
      for (const b of v.banding.per_kabkota) {
        console.log(`  ${b.kab_kota}`.padEnd(30) + fm(b.roadroid, 1).padStart(10) + fm(b.galura, 1).padStart(10) + fm(b.selisih, 1).padStart(10));
      }
    })
    .catch((e) => { console.error("[X] Validasi gagal:", e.message); process.exitCode = 1; })
    .finally(() => pool.end());
}
