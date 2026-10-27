"use strict";
// Konfigurasi bersama: kelas kondisi, peta dasar, dan fungsi pembantu.

const KONDISI = [
  { nama: "Baik",         warna: "#2E9E4F", teks: "#1E2329", rentang: "IRI < 4" },
  { nama: "Sedang",       warna: "#F2B705", teks: "#1E2329", rentang: "IRI 4 - 8" },
  { nama: "Rusak Ringan", warna: "#F08A24", teks: "#1E2329", rentang: "IRI 8 - 12" },
  { nama: "Rusak Berat",  warna: "#D63A2F", teks: "#FFFFFF", rentang: "IRI ≥ 12" },
];
const INFO = Object.fromEntries(KONDISI.map((k) => [k.nama, k]));

// Peta dasar tanpa API key. (Ubin CARTO sekarang mewajibkan key, jadi tidak dipakai.)
// "label" = lapisan tulisan (nama tempat) yang ditumpuk di atas peta dasar.
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const PETA_DASAR = {
  gelap: {
    nama: "Gelap",
    url: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    label: `${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    opsi: { maxZoom: 18, maxNativeZoom: 16, attribution: "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ" },
  },
  terang: {
    nama: "Terang",
    url: `${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    label: `${ESRI}/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    opsi: { maxZoom: 18, maxNativeZoom: 16, attribution: "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ" },
  },
  osm: {
    nama: "OSM",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    opsi: { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' },
  },
  satelit: {
    nama: "Satelit",
    url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    opsi: { maxZoom: 18, attribution: "Tiles &copy; Esri, Maxar, Earthstar Geographics" },
  },
};

// ---------- fungsi pembantu ----------
const fmt = (n, d = 1) =>
  n === null || n === undefined || Number.isNaN(Number(n))
    ? "–"
    : Number(n).toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });

// "KABUPATEN BANDUNG BARAT" -> "Kabupaten Bandung Barat"
const judul = (s) => String(s ?? "").toLowerCase().replace(/(^|[\s(\/-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const jarak = (m) => (m < 1000 ? `${m} m` : `${fmt(m / 1000, 1)} km`);

// Pemanggil API: melewatkan parameter yang null/undefined, melempar galat berpesan jelas
async function api(jalur, params = {}) {
  const url = new URL(jalur, window.location.origin);
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined) url.searchParams.set(k, v);
  }
  let resp;
  try {
    resp = await fetch(url);
  } catch {
    throw new Error("Server tidak dapat dihubungi. Pastikan perintah npm start sedang berjalan.");
  }
  const isi = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(isi.galat || `Permintaan gagal (${resp.status}).`);
  return isi;
}
