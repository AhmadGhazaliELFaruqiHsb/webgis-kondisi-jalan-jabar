// Tahap 4 - Back end: REST API (Node.js + Express + PostgreSQL/PostGIS)
// Semua endpoint bersifat baca-saja (GET) dan memakai kueri berparameter.
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const compression = require("compression");
const path = require("path");
const { Pool } = require("pg");
const { jalankanValidasi } = require("./database/validasi_data");

const app = express();
const pool = new Pool({ max: 10 }); // PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE dibaca dari .env

// Klasifikasi kondisi berdasarkan IRI (m/km), acuan umum Bina Marga
const KONDISI = [
  { nama: "Baik",         warna: "#2E9E4F", iri_min: 0,  iri_maks: 4 },
  { nama: "Sedang",       warna: "#F2B705", iri_min: 4,  iri_maks: 8 },
  { nama: "Rusak Ringan", warna: "#F08A24", iri_min: 8,  iri_maks: 12 },
  { nama: "Rusak Berat",  warna: "#D63A2F", iri_min: 12, iri_maks: null },
];
const NAMA_KONDISI = KONDISI.map((k) => k.nama);

app.use(cors());
app.use(compression());

// ---------------------------------------------------------------- pembantu
const rute = (fn) => (req, res, next) => fn(req, res, next).catch(next);

class GalatPermintaan extends Error {
  constructor(pesan) { super(pesan); this.status = 400; }
}

// ?kondisi=Baik,Sedang  -> daftar valid. Tanpa parameter = semua kondisi; kosong = tidak ada.
function ambilKondisi(q) {
  if (q === undefined) return NAMA_KONDISI;
  return String(q).split(",").map((s) => s.trim()).filter((s) => NAMA_KONDISI.includes(s));
}
const ambilTeks = (q) => (q === undefined || String(q).trim() === "" ? null : String(q).trim().slice(0, 100));

function ambilAngka(q, nama, { min = -Infinity, maks = Infinity, wajib = false, bawaan = null } = {}) {
  if (q === undefined || q === "") {
    if (wajib) throw new GalatPermintaan(`Parameter "${nama}" wajib diisi.`);
    return bawaan;
  }
  const n = Number(q);
  if (!Number.isFinite(n) || n < min || n > maks) {
    throw new GalatPermintaan(`Parameter "${nama}" harus berupa angka antara ${min} dan ${maks}.`);
  }
  return n;
}

// Membungkus baris hasil kueri (kolom `geom` dalam GeoJSON) menjadi FeatureCollection
function keFeatureCollection(rows, idKolom) {
  return {
    type: "FeatureCollection",
    features: rows.map(({ geom, ...properti }) => ({
      type: "Feature",
      id: idKolom ? properti[idKolom] : undefined,
      geometry: JSON.parse(geom),
      properties: properti,
    })),
  };
}

// Ringkasan per ruas yang dihitung dari SEGMEN 1 km, supaya angka di semua tampilan konsisten dengan peta.
// (Kolom km_* dan persen_mantap di tabel ruas_jalan dihitung per titik survei dan tidak dipakai di tampilan.)
const AGREGAT_SEGMEN = `(
  SELECT idruas,
         SUM(km_akhir - km_awal)::float AS km_survei,
         COALESCE(SUM(km_akhir - km_awal) FILTER (WHERE kondisi = 'Baik'), 0)::float AS km_baik,
         COALESCE(SUM(km_akhir - km_awal) FILTER (WHERE kondisi = 'Sedang'), 0)::float AS km_sedang,
         COALESCE(SUM(km_akhir - km_awal) FILTER (WHERE kondisi = 'Rusak Ringan'), 0)::float AS km_rusak_ringan,
         COALESCE(SUM(km_akhir - km_awal) FILTER (WHERE kondisi = 'Rusak Berat'), 0)::float AS km_rusak_berat,
         ROUND((100 * COALESCE(SUM(km_akhir - km_awal) FILTER (WHERE kondisi IN ('Baik', 'Sedang')), 0)
                / NULLIF(SUM(km_akhir - km_awal), 0))::numeric, 1)::float AS persen_mantap
  FROM segmen_kondisi GROUP BY idruas
)`;

const bulat = (n, d = 2) => Math.round(Number(n) * 10 ** d) / 10 ** d;

// ---------------------------------------------------------------- endpoint
// Cek server dan database
app.get("/api/health", rute(async (req, res) => {
  const r = await pool.query("SELECT PostGIS_Version() AS postgis, NOW() AS waktu");
  res.json({ status: "ok", ...r.rows[0] });
}));

// Metadata untuk membangun filter di front end
app.get("/api/meta", rute(async (req, res) => {
  const [kab, thn] = await Promise.all([
    pool.query(`SELECT kab_kota AS nama, COUNT(*)::int AS jumlah_ruas
                FROM ruas_jalan GROUP BY kab_kota ORDER BY kab_kota`),
    pool.query(`SELECT DISTINCT tahun FROM kondisi_kabkota ORDER BY tahun`),
  ]);
  res.json({ kondisi: KONDISI, kabkota: kab.rows, tahun: thn.rows.map((r) => r.tahun) });
}));

// Batas provinsi (GeoJSON)
app.get("/api/batas", rute(async (req, res) => {
  const r = await pool.query("SELECT nama, ST_AsGeoJSON(geom, 5) AS geom FROM batas_jabar");
  res.json(keFeatureCollection(r.rows));
}));

// Ruas jalan (GeoJSON) - filter: kondisi, kab_kota, q (nama ruas)
app.get("/api/ruas", rute(async (req, res) => {
  const r = await pool.query(
    `SELECT r.idruas, r.nm_ruas, r.kab_kota, r.wil_uptd, r.panjang_km::float AS panjang_km, r.iri_rata2::float AS iri_rata2,
            r.kondisi, a.persen_mantap, ST_AsGeoJSON(r.geom, 6) AS geom
     FROM ruas_jalan r
     LEFT JOIN ${AGREGAT_SEGMEN} a ON a.idruas = r.idruas
     WHERE r.kondisi = ANY($1)
       AND ($2::text IS NULL OR r.kab_kota = $2)
       AND ($3::text IS NULL OR r.nm_ruas ILIKE '%' || $3 || '%')
     ORDER BY r.idruas`,
    [ambilKondisi(req.query.kondisi), ambilTeks(req.query.kab_kota), ambilTeks(req.query.q)]
  );
  res.json(keFeatureCollection(r.rows, "idruas"));
}));
// Segmen kondisi (GeoJSON) - filter: kondisi, kab_kota, idruas
app.get("/api/segmen", rute(async (req, res) => {
  const r = await pool.query(
    `SELECT s.id, s.idruas, r.nm_ruas, r.kab_kota, s.km_awal::float AS km_awal, s.km_akhir::float AS km_akhir,
            s.nilai_iri::float AS nilai_iri, s.kondisi, ST_AsGeoJSON(s.geom, 6) AS geom
     FROM segmen_kondisi s
     JOIN ruas_jalan r ON r.idruas = s.idruas
     WHERE s.kondisi = ANY($1)
       AND ($2::text IS NULL OR r.kab_kota = $2)
       AND ($3::text IS NULL OR s.idruas = $3)
     ORDER BY s.id`,
    [ambilKondisi(req.query.kondisi), ambilTeks(req.query.kab_kota), ambilTeks(req.query.idruas)]
  );
  res.json(keFeatureCollection(r.rows, "id"));
}));

// Pencarian ruas berdasarkan nama atau kode (untuk kolom cari)
app.get("/api/cari", rute(async (req, res) => {
  const q = ambilTeks(req.query.q);
  if (!q || q.length < 2) return res.json([]);
  const r = await pool.query(
    `SELECT idruas, nm_ruas, kab_kota, kondisi,
            ST_XMin(geom) AS x_min, ST_YMin(geom) AS y_min, ST_XMax(geom) AS x_maks, ST_YMax(geom) AS y_maks
     FROM ruas_jalan
     WHERE nm_ruas ILIKE '%' || $1 || '%' OR idruas ILIKE $1 || '%'
     ORDER BY (nm_ruas ILIKE $1 || '%') DESC, nm_ruas
     LIMIT 8`,
    [q]
  );
  res.json(r.rows);
}));

// Detail satu ruas: atribut, batas peta, geometri, dan seluruh segmennya.
// Panjang per kondisi dan persen mantap dihitung dari segmen (konsisten dengan peta).
app.get("/api/ruas/:id", rute(async (req, res) => {
  const id = ambilTeks(req.params.id);
  const [ruas, segmen] = await Promise.all([
    pool.query(
      `SELECT r.idruas, r.nm_ruas, r.kab_kota, r.wil_uptd, r.uptd, r.panjang_km::float AS panjang_km,
              r.iri_rata2::float AS iri_rata2, r.kondisi,
              a.persen_mantap, a.km_survei, a.km_baik, a.km_sedang, a.km_rusak_ringan, a.km_rusak_berat,
              ST_XMin(r.geom) AS x_min, ST_YMin(r.geom) AS y_min, ST_XMax(r.geom) AS x_maks, ST_YMax(r.geom) AS y_maks,
              ST_AsGeoJSON(r.geom, 6) AS geom
       FROM ruas_jalan r
       LEFT JOIN ${AGREGAT_SEGMEN} a ON a.idruas = r.idruas
       WHERE r.idruas = $1`, [id]),
    pool.query(
      // lat/lng = titik tengah segmen (pasti di badan jalan), dipakai untuk Street View di panel Ruas
      `SELECT km_awal::float AS km_awal, km_akhir::float AS km_akhir, nilai_iri::float AS nilai_iri, kondisi,
              ROUND(ST_Y(ST_LineInterpolatePoint(geom, 0.5))::numeric, 6)::float AS lat,
              ROUND(ST_X(ST_LineInterpolatePoint(geom, 0.5))::numeric, 6)::float AS lng
       FROM segmen_kondisi WHERE idruas = $1 ORDER BY km_awal, id`, [id]),
  ]);
  if (ruas.rowCount === 0) return res.status(404).json({ galat: `Ruas "${id}" tidak ditemukan.` });
  const { geom, x_min, y_min, x_maks, y_maks, ...atribut } = ruas.rows[0];
  res.json({ ...atribut, bbox: [x_min, y_min, x_maks, y_maks], geometri: JSON.parse(geom), segmen: segmen.rows });
}));
// Peringkat ruas dengan IRI rata-rata tertinggi (terburuk)
app.get("/api/ruas-terparah", rute(async (req, res) => {
  const batas = ambilAngka(req.query.limit, "limit", { min: 1, maks: 50, bawaan: 10 });
  const r = await pool.query(
    `SELECT r.idruas, r.nm_ruas, r.kab_kota, r.iri_rata2::float AS iri_rata2, r.kondisi,
            a.km_rusak_berat, r.panjang_km::float AS panjang_km
     FROM ruas_jalan r
     LEFT JOIN ${AGREGAT_SEGMEN} a ON a.idruas = r.idruas
     WHERE ($1::text IS NULL OR r.kab_kota = $1)
     ORDER BY r.iri_rata2 DESC NULLS LAST, a.km_rusak_berat DESC
     LIMIT $2`,
    [ambilTeks(req.query.kab_kota), batas]
  );
  res.json(r.rows);
}));
// Ringkasan hasil survei (angka utama di panel) - filter: kab_kota
app.get("/api/ringkasan", rute(async (req, res) => {
  const kab = ambilTeks(req.query.kab_kota);
  const [ruas, seg] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS jumlah_ruas, COALESCE(SUM(panjang_km), 0)::float AS panjang_ruas_km
       FROM ruas_jalan WHERE ($1::text IS NULL OR kab_kota = $1)`, [kab]),
    pool.query(
      `SELECT s.kondisi, COUNT(*)::int AS jumlah_segmen, SUM(s.km_akhir - s.km_awal)::float AS km,
              SUM(s.nilai_iri * (s.km_akhir - s.km_awal))::float AS iri_x_km
       FROM segmen_kondisi s JOIN ruas_jalan r ON r.idruas = s.idruas
       WHERE ($1::text IS NULL OR r.kab_kota = $1)
       GROUP BY s.kondisi`, [kab]),
  ]);
  const km = Object.fromEntries(NAMA_KONDISI.map((k) => [k, 0]));
  let jumlahSegmen = 0, iriXkm = 0;
  for (const b of seg.rows) { km[b.kondisi] = bulat(b.km); jumlahSegmen += b.jumlah_segmen; iriXkm += b.iri_x_km; }
  const kmSurvei = Object.values(km).reduce((a, b) => a + b, 0);
  res.json({
    kab_kota: kab,
    jumlah_ruas: ruas.rows[0].jumlah_ruas,
    panjang_ruas_km: bulat(ruas.rows[0].panjang_ruas_km, 1),
    jumlah_segmen: jumlahSegmen,
    km_survei: bulat(kmSurvei, 1),
    km,
    persen_mantap: kmSurvei ? bulat(((km["Baik"] + km["Sedang"]) / kmSurvei) * 100, 1) : null,
    iri_rata2: kmSurvei ? bulat(iriXkm / kmSurvei) : null,
  });
}));

// Pencarian spasial: segmen dalam radius (meter) dari satu titik, diurutkan dari yang terdekat
app.get("/api/terdekat", rute(async (req, res) => {
  const lat = ambilAngka(req.query.lat, "lat", { min: -90, maks: 90, wajib: true });
  const lng = ambilAngka(req.query.lng, "lng", { min: -180, maks: 180, wajib: true });
  const radius = ambilAngka(req.query.radius, "radius", { min: 100, maks: 50000, bawaan: 5000 });
  const batas = ambilAngka(req.query.limit, "limit", { min: 1, maks: 100, bawaan: 30 });
  const kondisi = req.query.kondisi === undefined ? ["Rusak Ringan", "Rusak Berat"] : ambilKondisi(req.query.kondisi);
  const r = await pool.query(
    `WITH titik AS (SELECT ST_SetSRID(ST_MakePoint($2::float8, $1::float8), 4326)::geography AS g)
     SELECT s.id, s.idruas, r.nm_ruas, r.kab_kota, s.km_awal::float AS km_awal, s.km_akhir::float AS km_akhir,
            s.nilai_iri::float AS nilai_iri, s.kondisi,
            ROUND(ST_Distance(s.geom::geography, t.g))::int AS jarak_m,
            ST_AsGeoJSON(s.geom, 6) AS geom
     FROM segmen_kondisi s
     JOIN ruas_jalan r ON r.idruas = s.idruas
     CROSS JOIN titik t
     WHERE ST_DWithin(s.geom::geography, t.g, $3::float8) AND s.kondisi = ANY($4)
     ORDER BY ST_Distance(s.geom::geography, t.g), s.id
     LIMIT $5`,
    [lat, lng, radius, kondisi, batas]
  );
  res.json({ pusat: { lat, lng }, radius_m: radius, ...keFeatureCollection(r.rows, "id") });
}));

// Tren tahunan (Galura Data Jabar) - provinsi, atau satu Kab/Kota bila ?kab_kota= diisi
app.get("/api/tren", rute(async (req, res) => {
  const r = await pool.query(
    `SELECT tahun,
            SUM(km_baik)::float AS baik, SUM(km_sedang)::float AS sedang,
            SUM(km_rusak_ringan)::float AS rusak_ringan, SUM(km_rusak_berat)::float AS rusak_berat,
            SUM(km_total)::float AS total
     FROM v_kondisi_tahunan
     WHERE ($1::text IS NULL OR kab_kota = $1)
     GROUP BY tahun ORDER BY tahun`,
    [ambilTeks(req.query.kab_kota)]
  );
  res.json(r.rows.map((b) => ({
    tahun: b.tahun,
    km: { "Baik": bulat(b.baik), "Sedang": bulat(b.sedang), "Rusak Ringan": bulat(b.rusak_ringan), "Rusak Berat": bulat(b.rusak_berat) },
    total_km: bulat(b.total),
    persen_mantap: b.total ? bulat(((b.baik + b.sedang) / b.total) * 100, 1) : null,
  })));
}));

// Peringkat Kab/Kota berdasarkan persentase jalan mantap pada satu tahun
app.get("/api/peringkat", rute(async (req, res) => {
  const tahun = ambilAngka(req.query.tahun, "tahun", { min: 2000, maks: 2100, bawaan: null });
  const r = await pool.query(
    `SELECT kab_kota, tahun, km_total::float AS total_km, km_rusak_berat::float AS km_rusak_berat,
            km_rusak_ringan::float AS km_rusak_ringan,
            ROUND(((km_baik + km_sedang) / NULLIF(km_total, 0) * 100)::numeric, 1)::float AS persen_mantap
     FROM v_kondisi_tahunan
     WHERE tahun = COALESCE($1::int, (SELECT MAX(tahun) FROM kondisi_kabkota))
     ORDER BY persen_mantap DESC NULLS LAST, kab_kota`,
    [tahun]
  );
  res.json(r.rows);
}));

// Validasi keakuratan data (hasil di-cache 10 menit karena kuerinya cukup berat)
let cacheValidasi = null;
app.get("/api/validasi", rute(async (req, res) => {
  if (!cacheValidasi || Date.now() - cacheValidasi.waktu > 10 * 60 * 1000) {
    cacheValidasi = { waktu: Date.now(), isi: await jalankanValidasi(pool) };
  }
  res.json(cacheValidasi.isi);
}));

// ---------------------------------------------------------------- berkas statis
app.use(express.static(path.join(__dirname, "public"), {
  extensions: ["html"], // /peta, /dashboard, dst. membuka peta.html, dashboard.html
  setHeaders: (res, berkas) => {
    // pustaka vendor jarang berubah; kode aplikasi selalu dicek ulang agar perubahan langsung terlihat
    res.setHeader("Cache-Control", berkas.includes(`${path.sep}vendor${path.sep}`) ? "public, max-age=86400" : "no-cache");
  },
}));

app.use("/api", (req, res) => res.status(404).json({ galat: "Endpoint tidak ditemukan." }));

// Penanganan galat (kesalahan input = 400, database mati = 503, lainnya = 500)
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err.status === 400) return res.status(400).json({ galat: err.message });
  const dbMati = ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "28P01", "3D000", "57P03"].includes(err.code);
  if (dbMati) {
    return res.status(503).json({
      galat: "Database tidak dapat diakses. Pastikan PostgreSQL berjalan, PGPASSWORD di .env benar, dan data sudah diimpor (npm run impor-db).",
    });
  }
  if (err.code === "42P01") {
    return res.status(503).json({ galat: "Tabel belum ada. Jalankan: npm run impor-db" });
  }
  console.error("[X]", err);
  res.status(500).json({ galat: "Terjadi kesalahan pada server." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`[OK] Server berjalan di http://localhost:${PORT}`);
  try {
    const r = await pool.query("SELECT COUNT(*)::int AS n FROM segmen_kondisi");
    console.log(`[OK] Database terhubung (${r.rows[0].n} segmen jalan)`);
  } catch (err) {
    console.warn(`[!] Database belum siap: ${err.message}`);
    console.warn("    Jalankan: npm run cek-db, lalu npm run impor-db");
  }
});
