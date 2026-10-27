// Cek apakah PostgreSQL dan PostGIS sudah terpasang dan bisa diakses.
// Jalankan dengan: npm run cek-db
require("dotenv").config();
const { Client } = require("pg");

async function main() {
  // sambung ke database bawaan "postgres" (database proyek belum dibuat)
  const client = new Client({ database: "postgres" });
  try {
    await client.connect();
    const ver = await client.query("SELECT version()");
    console.log("[OK] Terhubung ke", ver.rows[0].version.split(",")[0]);

    const gis = await client.query(
      "SELECT default_version FROM pg_available_extensions WHERE name = 'postgis'"
    );
    if (gis.rows.length) {
      console.log("[OK] PostGIS tersedia, versi", gis.rows[0].default_version);
    } else {
      console.log("[X] PostGIS belum terpasang. Pasang lewat Stack Builder: Spatial Extensions > PostGIS.");
    }
  } catch (err) {
    console.error("[X] Gagal terhubung ke PostgreSQL:", err.message);
    console.error("    Cek PGPASSWORD di file .env, dan pastikan service PostgreSQL sedang berjalan.");
  } finally {
    await client.end().catch(() => {});
  }
}

main();
