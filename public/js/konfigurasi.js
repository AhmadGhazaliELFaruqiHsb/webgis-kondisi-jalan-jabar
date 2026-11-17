"use strict";
// Konfigurasi bersama: kelas kondisi, peta dasar, dan fungsi pembantu.

// gambar: foto nyata contoh kondisi dari Wikimedia Commons (berlisensi bebas, wajib mencantumkan pemilik dan lisensi).
// Foto adalah contoh visual tiap kelas, bukan foto ruas jalan provinsi dengan IRI terukur.
const LISENSI = {
  "CC BY-SA 4.0": "https://creativecommons.org/licenses/by-sa/4.0/deed.id",
  "CC BY 4.0": "https://creativecommons.org/licenses/by/4.0/deed.id",
  "CC BY 3.0": "https://creativecommons.org/licenses/by/3.0/deed.id",
};
const KONDISI = [
  { nama: "Baik", warna: "#2E9E4F", teks: "#1E2329", rentang: "IRI < 4",
    gambar: "img/kondisi/foto-baik.jpg",
    foto: { lokasi: "Muaro Jambi, Jambi", oleh: "Firzafp", lisensi: "CC BY-SA 4.0",
            url: "https://commons.wikimedia.org/wiki/File:Muaro_Jambi_Temple_Complex_access_road_-_Muaro_Jambi,_JA_(10_Mar_2023)_01.jpg" },
    ciri: "Permukaan rata dan menerus. Kendaraan melaju nyaman tanpa guncangan berarti." },
  { nama: "Sedang", warna: "#F2B705", teks: "#1E2329", rentang: "IRI 4 - 8",
    gambar: "img/kondisi/foto-sedang.jpg",
    foto: { lokasi: "Kebumen, Jawa Tengah", oleh: "DARMAS BS 9", lisensi: "CC BY-SA 4.0",
            url: "https://commons.wikimedia.org/wiki/File:Perbaikan_Jalan_Aspal_Yg_Rusak_Di_Jl.Kaswari_Kebumen_Oleh_PUPR_Kab.Kebumen.jpg" },
    ciri: "Mulai bergelombang, ada retak halus dan tambalan. Masih nyaman dilalui." },
  { nama: "Rusak Ringan", warna: "#F08A24", teks: "#1E2329", rentang: "IRI 8 - 12",
    gambar: "img/kondisi/foto-rusak-ringan.jpg",
    foto: { lokasi: "Surabaya, Jawa Timur", oleh: "MR Bang Jago", lisensi: "CC BY 4.0",
            url: "https://commons.wikimedia.org/wiki/File:Foto_Jalan_Rusak_di_Suatu_Daerah_Kota_Surabaya.jpg" },
    ciri: "Retak berkelompok, lubang kecil, dan gelombang terasa. Kecepatan perlu dikurangi." },
  { nama: "Rusak Berat", warna: "#D63A2F", teks: "#FFFFFF", rentang: "IRI ≥ 12",
    gambar: "img/kondisi/foto-rusak-berat.jpg",
    foto: { lokasi: "Indonesia", oleh: "YT Arty", lisensi: "CC BY-SA 4.0",
            url: "https://commons.wikimedia.org/wiki/File:Jalan_rusak_berlubang_-_IMG20260420173247.jpg" },
    ciri: "Lubang besar dan aspal terkelupas. Guncangan kuat, berbahaya bagi pengendara." },
];
const INFO = Object.fromEntries(KONDISI.map((k) => [k.nama, k]));

// Status (kewenangan) jalan, untuk mode warna "Status jalan" di peta. km_bps = panjang di Jawa Barat menurut BPS 2019
// (data/panjang_jalan_bps_2019.csv: jalan negara 1.789 km, provinsi 2.361 km, kabupaten/kota 23.436 km).
const STATUS_JALAN = {
  nasional: { nama: "Jalan nasional", warna: "#A23BEC", km_bps: 1789 },
  provinsi: { nama: "Jalan provinsi", warna: "#1E88E5", km_bps: 2361 },
  kabkota: { nama: "Jalan kabupaten/kota", warna: "#26A69A", km_bps: 23436 },
};

// Baris kredit foto (HTML); menerima kelas kondisi (k.foto) atau entri galeri
const kreditFoto = (k) => {
  const f = k.foto || k;
  return `Foto: <a href="${f.url}" target="_blank" rel="noopener">${esc(f.oleh)}</a>, ${esc(f.lokasi)} · ` +
    `<a href="${LISENSI[f.lisensi]}" target="_blank" rel="noopener">${f.lisensi}</a> · Wikimedia Commons`;
};

// Peta dasar tanpa API key. (Ubin CARTO sekarang mewajibkan key, jadi tidak dipakai.)
// "label" = lapisan tulisan (nama tempat) yang ditumpuk di atas peta dasar.
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const PETA_DASAR = {
  gelap: {
    nama: "Gelap", pilih: "#00E5FF", teksPilih: "#0B1114",
    url: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    label: `${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    opsi: { maxZoom: 18, maxNativeZoom: 16, attribution: "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ" },
  },
  terang: {
    nama: "Terang", pilih: "#2D3BFF", teksPilih: "#FFFFFF",
    url: `${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    label: `${ESRI}/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    opsi: { maxZoom: 18, maxNativeZoom: 16, attribution: "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ" },
  },
  // gaya peta jalan seperti Google Maps (jalan, nama tempat, area hijau); warnanya diredupkan lewat CSS (.dasar-redup)
  // supaya garis jalan oranye peta dasar tidak tertukar dengan warna kondisi jalan
  jalan: {
    nama: "Jalan", pilih: "#2D3BFF", teksPilih: "#FFFFFF",
    url: `${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`,
    opsi: { maxZoom: 19, maxNativeZoom: 19, className: "dasar-redup", attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, OpenStreetMap" },
  },
  osm: {
    nama: "OSM", pilih: "#2D3BFF", teksPilih: "#FFFFFF",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    opsi: { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' },
  },
  satelit: {
    nama: "Satelit", pilih: "#00E5FF", teksPilih: "#0B1114",
    url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    opsi: { maxZoom: 18, attribution: "Tiles &copy; Esri, Maxar, Earthstar Geographics" },
  },
};

// Peta dasar awal mengikuti tema: tema terang memakai peta jalan bergaya Google Maps, tema gelap memakai peta gelap
const dasarAwal = () => (document.documentElement.dataset.tema === "terang" ? "jalan" : "gelap");
// Peta dasar yang tampil saat halaman Peta dibuka (pilihan menu: "standar", "osm", atau "satelit")
const JENIS_BAWAAN = "osm";
// Pilihan jenis peta yang ditampilkan ke pengguna. "standar" = peta bawaan tema (jalan atau gelap).
const JENIS_PETA = ["standar", "osm", "satelit"];
const namaJenisPeta = (k) => (k === "standar" ? "Standar" : PETA_DASAR[k].nama);
// kunci peta dasar sebenarnya -> pilihan yang tampil di menu
const jenisDariDasar = (kunci) => (["jalan", "gelap", "terang"].includes(kunci) ? "standar" : kunci);

// Tautan untuk membuka satu titik di Google Maps (tab baru)
const urlGoogleMaps = (lat, lng) =>
  `https://www.google.com/maps/search/?api=1&query=${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;

// Warna seleksi (lingkaran radius, titik, sorotan hasil) dipilih berlawanan dengan palet data yang hangat
// (hijau, kuning, oranye, merah): biru-sian. Cyan terang di peta gelap/satelit, biru tua di peta terang/OSM.
// Warna aktif juga disalin ke variabel CSS --pilih.

// Tautan resmi Google Maps ke Street View pada koordinat tertentu (untuk mencocokkan data dengan kondisi nyata)
const urlStreetView = (lat, lng) =>
  `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;
// Versi sematan (iframe) Street View dari Google Maps Embed, tanpa API key. arah = derajat dari utara.
const urlStreetViewSemat = (lat, lng, arah = 0) =>
  `https://www.google.com/maps/embed?origin=mfe&pb=!6m7!1m6!2m2!1d${Number(lat).toFixed(6)}!2d${Number(lng).toFixed(6)}!3f${Math.round(arah)}!4f0!5f1`;
// arah (derajat dari utara) dari titik a ke titik b, agar kamera Street View menghadap sepanjang jalan
const arahKe = (a, b) => {
  const r = Math.PI / 180, y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
};

// Nilai variabel CSS tema yang sedang aktif (mis. warnaTema("aksen")), untuk warna yang digambar lewat JS
const warnaTema = (nama) => getComputedStyle(document.documentElement).getPropertyValue(`--${nama}`).trim();
const temaTerang = () => document.documentElement.dataset.tema === "terang";

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
