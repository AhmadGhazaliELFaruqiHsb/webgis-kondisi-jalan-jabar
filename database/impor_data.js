// Tahap 3 - Membuat database, menjalankan skema, dan mengimpor data ke PostGIS.
// Jalankan dengan: npm run impor-db
// Aman dijalankan berulang kali: tabel dibuat ulang lalu diisi dari folder data/.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const DB = process.env.PGDATABASE || "webgis_jalan";
const DATA = path.join(__dirname, "..", "data");

function bacaGeoJSON(nama) {
  return JSON.parse(fs.readFileSync(path.join(DATA, nama), "utf8")).features;
}

// Pembaca CSV sederhana (mendukung tanda kutip ganda, BOM, dan CRLF)
function bacaCSV(nama) {
  const teks = fs.readFileSync(path.join(DATA, nama), "utf8").replace(/^\uFEFF/, "");
  const baris = [];
  let sel = "", rec = [], kutip = false;
  for (let i = 0; i < teks.length; i++) {
    const c = teks[i];
    if (kutip) {
      if (c === '"' && teks[i + 1] === '"') { sel += '"'; i++; }
      else if (c === '"') kutip = false;
      else sel += c;
    } else if (c === '"') kutip = true;
    else if (c === ",") { rec.push(sel); sel = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && teks[i + 1] === "\n") i++;
      rec.push(sel); sel = "";
      if (rec.length > 1 || rec[0] !== "") baris.push(rec);
      rec = [];
    } else sel += c;
  }
  if (sel !== "" || rec.length) { rec.push(sel); baris.push(rec); }
  const [kepala, ...isi] = baris;
  return isi.map((r) => Object.fromEntries(kepala.map((k, i) => [k.trim(), (r[i] ?? "").trim()])));
}

async function pastikanDatabase() {
  if (!/^[A-Za-z0-9_]+$/.test(DB)) throw new Error(`Nama database tidak valid: ${DB}`);
  const admin = new Client({ database: "postgres" });
  await admin.connect();
  try {
    const ada = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [DB]);
    if (ada.rowCount === 0) {
      await admin.query(`CREATE DATABASE ${DB}`);
      console.log(`[OK] Database "${DB}" dibuat`);
    } else {
      console.log(`[OK] Database "${DB}" sudah ada`);
    }
  } finally {
    await admin.end();
  }
}

async function main() {
  await pastikanDatabase();

  const db = new Client({ database: DB });
  await db.connect();
  try {
    await db.query(fs.readFileSync(path.join(__dirname, "skema.sql"), "utf8"));
    console.log("[OK] Skema dan indeks dibuat (PostGIS aktif)");

    await db.query("BEGIN");

    // 1. ruas jalan
    const ruas = bacaGeoJSON("ruas_jalan.geojson");
    for (const f of ruas) {
      const p = f.properties;
      await db.query(
        `INSERT INTO ruas_jalan (idruas, nm_ruas, kab_kota, wil_uptd, uptd, panjang_km, iri_rata2, kondisi,
                                 persen_mantap, km_baik, km_sedang, km_rusak_ringan, km_rusak_berat, geom)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
                 ST_SetSRID(ST_Multi(ST_GeomFromGeoJSON($14)), 4326))`,
        [p.idruas, p.nm_ruas, p.kab_kota, p.wil_uptd, p.uptd, p.panjang_km, p.iri_rata2, p.kondisi,
         p.persen_mantap, p.km_baik, p.km_sedang, p.km_rusak_ringan, p.km_rusak_berat,
         JSON.stringify(f.geometry)]
      );
    }
    console.log(`[OK] ruas_jalan       : ${ruas.length} baris`);

    // 2. segmen kondisi
    const segmen = bacaGeoJSON("segmen_kondisi.geojson");
    for (const f of segmen) {
      const p = f.properties;
      await db.query(
        `INSERT INTO segmen_kondisi (idruas, km_awal, km_akhir, nilai_iri, kondisi, geom)
         VALUES ($1,$2,$3,$4,$5, ST_SetSRID(ST_GeomFromGeoJSON($6), 4326))`,
        [p.idruas, p.km_awal, p.km_akhir, p.nilai_iri, p.kondisi, JSON.stringify(f.geometry)]
      );
    }
    console.log(`[OK] segmen_kondisi   : ${segmen.length} baris`);

    // 3. batas provinsi
    const batas = bacaGeoJSON("batas_jabar.geojson");
    for (const f of batas) {
      await db.query(
        `INSERT INTO batas_jabar (nama, geom) VALUES ($1, ST_SetSRID(ST_Multi(ST_GeomFromGeoJSON($2)), 4326))`,
        [f.properties.nama, JSON.stringify(f.geometry)]
      );
    }
    console.log(`[OK] batas_jabar      : ${batas.length} baris`);

    // 4. rekap Galura
    const galura = bacaCSV("kondisi_kabkota_galura.csv");
    for (const r of galura) {
      await db.query(
        `INSERT INTO kondisi_kabkota (id, kode_kabupaten_kota, nama_kabupaten_kota, wilayah_uptd,
                                      kategori_jalan, kondisi_jalan, panjang_km, tahun)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [r.id, r.kode_kabupaten_kota, r.nama_kabupaten_kota.toUpperCase(), r.wilayah_uptd,
         r.kategori_jalan.toUpperCase(), r.kondisi_jalan.toUpperCase(), r.panjang_ruas_jalan, r.tahun]
      );
    }
    console.log(`[OK] kondisi_kabkota  : ${galura.length} baris`);

    await db.query("COMMIT");

    // pemeriksaan hasil impor
    const cek = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM ruas_jalan     WHERE NOT ST_IsValid(geom)) AS ruas_tidak_valid,
        (SELECT COUNT(*) FROM segmen_kondisi WHERE NOT ST_IsValid(geom)) AS segmen_tidak_valid,
        (SELECT ROUND(SUM(km_akhir - km_awal), 1) FROM segmen_kondisi)   AS km_survei,
        (SELECT PostGIS_Version())                                       AS versi_postgis`);
    const c = cek.rows[0];
    console.log(`[OK] Geometri tidak valid: ruas ${c.ruas_tidak_valid}, segmen ${c.segmen_tidak_valid}`);
    console.log(`[OK] Total panjang tersurvei: ${c.km_survei} km | PostGIS ${c.versi_postgis}`);
    console.log("\nSelesai. Jalankan server dengan: npm start");
  } catch (err) {
    await db.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error("[X] Impor gagal:", err.message);
  console.error("    Cek PGPASSWORD di file .env dan pastikan PostgreSQL + PostGIS sudah terpasang (npm run cek-db).");
  process.exit(1);
});
