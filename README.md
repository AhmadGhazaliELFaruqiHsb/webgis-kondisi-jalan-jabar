# SIKOJAB — WebGIS Kondisi Jalan Provinsi Jawa Barat

Tugas Besar Pemetaan Berbasis Web (TPBW-50-GAB)
- Ahmad Ghazali El-Faruqi Hsb (101032330080)
- Muhammad Afif Anwar (101032300148)

Aplikasi web yang memetakan kemulusan dan kerusakan jalan provinsi di Jawa Barat. Setiap segmen jalan (±1 km) diwarnai menurut nilai IRI: **Baik** (hijau), **Sedang** (kuning), **Rusak Ringan** (oranye), **Rusak Berat** (merah).

## Halaman

SIKOJAB berupa website dengan menu navigasi yang sama di semua halaman:

| Halaman | Alamat | Isi |
|---|---|---|
| Beranda | `/` (`index.html`) | Pengantar, angka utama langsung dari database, fitur, kelas kondisi, sumber data |
| Dashboard | `/dashboard` | Angka kunci, komposisi kondisi, tren kemantapan 2018–2025, peringkat Kab/Kota, 10 ruas IRI tertinggi, ringkasan validasi; bisa difilter per Kab/Kota |
| Peta | `/peta` | Mapping spasial: peta interaktif dengan panel Peta, Analisis, dan Ruas. Bisa dibuka langsung ke ruas (`/peta?ruas=348000`) atau wilayah (`/peta?kab=KOTA%20BANDUNG`) |
| Validasi | `/validasi` | Hasil 19 pemeriksaan otomatis dan grafik Roadroid vs Galura |
| Tentang | `/tentang` | Data, metode pengolahan, teknologi, dan tim |

Tema terang/gelap dapat diganti dari tombol di kepala halaman dan diingat oleh peramban.

## Fitur

- Peta interaktif (Leaflet) dengan 4 peta dasar (Esri dan OSM, tanpa API key), legenda yang bisa dilipat, skala, dan koordinat kursor
- Lapisan: segmen kondisi 1 km, ruas (kondisi rata-rata), dan batas provinsi
- Filter kondisi (lewat batang komposisi atau kotak centang) dan filter Kabupaten/Kota; data dimuat ulang dari PostGIS
- Ringkasan angka: persentase jalan mantap, jumlah ruas, km tersurvei, IRI rata-rata
- Pencarian ruas (nama atau kode) dengan saran otomatis dan navigasi keyboard
- **Gambar kondisi:** ilustrasi untuk tiap kelas (Baik, Sedang, Rusak Ringan, Rusak Berat) di filter, Beranda, dan halaman Tentang; foto nyata dari **Google Street View** tampil langsung di pop-up segmen dan panel Ruas (klik batang profil IRI untuk berpindah segmen)
- Detail ruas: komposisi kondisi dan grafik profil IRI sepanjang ruas (Chart.js)
- Analisis: tren kemantapan 2018–2025, 8 ruas dengan IRI tertinggi, dan peringkat Kabupaten/Kota
- **Kueri spasial:** cari segmen rusak dalam radius tertentu dari titik pilihan atau dari **Lokasi saya** (`ST_DWithin` pada tipe `geography`). Lingkaran radius, titik pusat, dan sorotan hasil memakai warna sian/biru yang berlawanan dengan palet data (hijau, kuning, oranye, merah)
- **Validasi data:** 19 pemeriksaan keakuratan dan konsistensi, plus perbandingan dengan data Galura, dapat dibuka di halaman *Validasi* atau dengan `npm run validasi`
- Tampilan responsif (panel samping di desktop, panel bawah di ponsel)

## Struktur folder

```
webgis-kondisi-jalan/
├── data/        data mentah & hasil olahan (GeoJSON, CSV) + olah_data.py
├── database/
│   ├── cek_koneksi.js   cek PostgreSQL & PostGIS
│   ├── skema.sql        tabel, indeks spasial, view
│   ├── impor_data.js    membuat database + mengimpor data
│   └── validasi_data.js validasi keakuratan data (npm run validasi)
├── public/      tampilan web
│   ├── index.html, dashboard.html, peta.html, validasi.html, tentang.html
│   ├── css/     style.css (tema + aplikasi peta), situs.css (halaman situs)
│   ├── img/kondisi/     ilustrasi 4 kelas kondisi (SVG)
│   ├── js/      konfigurasi.js, situs.js (menu + tema), peta.js (Leaflet), panel.js (panel peta),
│   │            dashboard.js, validasi.js
│   └── vendor/  Leaflet 1.9.4, Chart.js 4.4.7, font Barlow (disalin lokal)
├── server.js    back end (Node.js + Express, REST API)
├── package.json
└── .env         pengaturan koneksi database (dibuat dari .env.example)
```

## Cara menjalankan

Prasyarat: Node.js 18+, PostgreSQL dengan ekstensi PostGIS (di Windows: Stack Builder, Spatial Extensions, PostGIS).

1. `npm install`
2. Salin `.env.example` menjadi `.env`, lalu isi `PGPASSWORD`
3. `npm run cek-db` — cek koneksi PostgreSQL & PostGIS
4. `npm run impor-db` — membuat database `webgis_jalan`, tabel, indeks, dan mengimpor seluruh data (aman diulang)
5. `npm start` — buka http://localhost:3000
6. (opsional) `npm run validasi` — laporan validasi data di terminal

Memperbarui dari versi lama: ganti folder `public`, `database`, `server.js`, `package.json`, dan `README.md`, lalu jalankan `npm run impor-db` sekali (memperbaiki satu geometri batas provinsi yang rusak), hentikan server lama, dan `npm start` lagi. Tekan Ctrl+F5 di peramban.

Leaflet, Chart.js, dan font sudah ada di `public/vendor/`, jadi tidak perlu CDN. Hanya ubin peta dasar (Esri dan OpenStreetMap, tanpa API key) yang membutuhkan internet.

## Sumber data

| File | Isi | Sumber |
|---|---|---|
| `data/ruas_jalan.geojson` | 297 ruas jalan provinsi (garis) | Temanjabar (GeoServer DBMPR), layer `1_rj_prov_kemantapan` |
| `data/segmen_kondisi.geojson` | 2.571 segmen ±1 km dengan nilai IRI & kondisi | Diolah dari survei Roadroid Temanjabar (Jan 2021), layer `7_rj_roadroid_skj` |
| `data/batas_jabar.geojson` | Batas Provinsi Jawa Barat | Temanjabar, layer `daerah_jawa_barat` |
| `data/kondisi_kabkota_galura.csv` | Panjang jalan per kondisi per Kab/Kota 2018–2025 | Galura Data Jabar (DBMPR) |
| `data/olah_data.py` | Script pengolahan data (Python + GeoPandas) | — |

Klasifikasi kondisi dari IRI (m/km): Baik < 4, Sedang 4–8, Rusak Ringan 8–12, Rusak Berat ≥ 12. Jalan **mantap** = Baik + Sedang.

### Catatan penting tentang data

- Peta memakai **satu survei (Roadroid, Januari 2021)**. Grafik tren dan peringkat memakai data tahunan **Galura/DBMPR** yang berbeda sumber, sehingga tidak bisa dibandingkan langsung. Contoh: pada 2021 Galura mencatat ±82% jalan mantap, sedangkan survei Roadroid pada peta menghasilkan ±49%. Kemungkinan penyebabnya adalah perbedaan metode ukur dan batas kelas; hal ini belum diverifikasi lebih lanjut.
- IRI Roadroid diukur dengan sensor ponsel, jadi bersifat indikatif.
- Panjang resmi ruas dan panjang hasil survei (jumlah titik × 50 m) dapat sedikit berbeda.

## Skema database (PostgreSQL + PostGIS, EPSG:4326)

```
ruas_jalan (idruas PK, nm_ruas, kab_kota, wil_uptd, uptd, panjang_km, iri_rata2, kondisi,
            persen_mantap, km_baik, km_sedang, km_rusak_ringan, km_rusak_berat, geom MultiLineString)
      │ 1
      │
      │ N
segmen_kondisi (id PK, idruas FK, km_awal, km_akhir, nilai_iri, kondisi, geom LineString)

batas_jabar (id PK, nama, geom MultiPolygon)

kondisi_kabkota (id PK, kode_kabupaten_kota, nama_kabupaten_kota, wilayah_uptd,
                 kategori_jalan, kondisi_jalan, panjang_km, tahun)
   └── view v_kondisi_tahunan: rekap km per kondisi per Kab/Kota per tahun
```

Indeks: GiST pada semua kolom geometri, GiST pada `segmen_kondisi.geom::geography` (untuk `ST_DWithin` dalam meter), dan B-tree pada kolom filter.

## REST API

Semua endpoint bersifat `GET` dan memakai kueri berparameter.

| Endpoint | Keterangan |
|---|---|
| `/api/health` | Status server, versi PostGIS |
| `/api/meta` | Kelas kondisi, daftar Kab/Kota, daftar tahun |
| `/api/batas` | Batas provinsi (GeoJSON) |
| `/api/segmen?kondisi=&kab_kota=&idruas=` | Segmen kondisi (GeoJSON). `kondisi` dipisah koma, mis. `Baik,Sedang` |
| `/api/ruas?kondisi=&kab_kota=&q=` | Ruas jalan (GeoJSON) |
| `/api/ruas/:id` | Detail ruas: atribut, bbox, geometri, daftar segmen. Panjang per kondisi dan persen mantap dihitung dari segmen |
| `/api/cari?q=` | Pencarian ruas (nama atau kode) |
| `/api/ringkasan?kab_kota=` | Angka ringkasan hasil survei |
| `/api/ruas-terparah?kab_kota=&limit=` | Ruas dengan IRI rata-rata tertinggi |
| `/api/terdekat?lat=&lng=&radius=&limit=&kondisi=` | Segmen dalam radius (meter) dari titik, urut terdekat. Bawaan: rusak ringan & berat |
| `/api/tren?kab_kota=` | Tren tahunan 2018–2025 (Galura) |
| `/api/peringkat?tahun=` | Peringkat Kab/Kota berdasarkan persen jalan mantap |
| `/api/validasi` | Hasil 19 pemeriksaan keakuratan data dan perbandingan dengan Galura 2021 |

Kesalahan dikembalikan sebagai `{ "galat": "pesan" }` dengan kode 400 (input salah), 404, 503 (database tidak dapat diakses), atau 500.

## Validasi keakuratan data

`npm run validasi` (atau tombol *Validasi data* di web) menjalankan 19 pemeriksaan langsung pada tabel PostGIS, dalam lima kelompok:

1. **Atribut dan klasifikasi:** kelas sesuai batas IRI, rentang IRI wajar, tanpa nilai kosong atau duplikat, nama Kab/Kota cocok dengan Galura
2. **Geometri:** geometri valid (`ST_IsValid`), segmen di dalam batas provinsi, segmen menempel pada ruas induknya, panjang nominal vs panjang terukur
3. **Kelengkapan survei:** setiap ruas punya segmen, cakupan terhadap panjang resmi
4. **Konsistensi antar-ukuran:** IRI ruas vs rata-rata segmen, persen mantap per titik vs per segmen
5. **Perbandingan dengan Galura 2021:** total panjang, persen mantap provinsi, dan korelasi antar Kabupaten/Kota

Hasil pada data saat ini: 16 lulus, 1 perlu perhatian, 2 tidak sesuai.

- **Perbaikan yang dilakukan karena validasi:** satu geometri batas provinsi tidak valid (cincin poligon rusak akibat penyederhanaan), diperbaiki dengan `ST_MakeValid` saat impor. Angka panjang per kondisi dan persen mantap di panel Ruas kini dihitung dari segmen 1 km, sama dengan peta; sebelumnya memakai klasifikasi per titik sehingga angkanya berbeda (mis. kondisi Baik 331 km per titik vs 194 km per segmen).
- **Catatan, bukan kesalahan:** 4 segmen tampak berbeda satu kelas dari batas IRI karena nilai dibulatkan 2 desimal (kelas dihitung dari nilai sebelum dibulatkan). Panjang nominal segmen (jumlah titik × 50 m) sekitar 3,6% lebih panjang dari panjang geometri terukur.
- **Dua pemeriksaan yang tidak sesuai:** survei Roadroid (Januari 2021) menghasilkan 49,2% jalan mantap, sedangkan Galura 2021 mencatat 82,3% (selisih −33 poin), dan korelasi antar Kabupaten/Kota hanya r = 0,29. Penyebabnya belum dapat dipastikan. Agar Roadroid menghasilkan 82% mantap, batas mantap harus berada di IRI sekitar 11, bukan 8. Kedua sumber sebaiknya dibaca terpisah, dan temuan ini layak dibahas di laporan.

## Gambar kondisi

Empat ilustrasi SVG ada di `public/img/kondisi/` (baik, sedang, rusak-ringan, rusak-berat). Ilustrasi ini bersifat umum, bukan foto ruas tertentu. Untuk melihat kondisi nyata, pakai tombol **Street View** (tautan resmi Google Maps ke koordinat segmen).

Untuk mengganti dengan foto sendiri, taruh berkas di `public/img/kondisi/` lalu ubah nilai `gambar` pada `KONDISI` di `public/js/konfigurasi.js` (mis. `"img/kondisi/baik.jpg"`).

## Lokasi saya

Delay terjadi karena peramban perlu beberapa detik menentukan posisi (Wi-Fi, IP, atau GPS); kueri database sendiri sekitar 15 ms. Yang dilakukan aplikasi: umpan balik seketika (tombol berputar), posisi tersimpan 5 menit dipakai ulang, hasil ditampilkan dari posisi kasar lebih dulu lalu diperbarui otomatis saat posisi lebih akurat didapat, dan lingkaran akurasi ditampilkan. Fitur ini hanya bekerja lewat `http://localhost:3000` atau `https`.

## Pemecahan masalah

| Gejala | Penyebab / solusi |
|---|---|
| `Gagal terhubung ke PostgreSQL` | Cek `PGPASSWORD` di `.env` dan pastikan service PostgreSQL berjalan |
| `PostGIS belum terpasang` | Pasang lewat Stack Builder: Spatial Extensions, PostGIS |
| Halaman menampilkan "Database tidak dapat diakses" | Jalankan `npm run cek-db`, lalu `npm run impor-db` |
| "Lokasi saya" gagal atau tidak muncul izin | Buka lewat `http://localhost:3000` (bukan alamat IP), lalu izinkan lokasi di ikon kolom alamat |
| Peta dasar kosong (garis jalan tetap tampil) | Tidak ada internet; ubin peta dasar dimuat dari server luar. Coba ganti pilihan di bagian Peta dasar |
| Tulisan "API KEY REQUIRED" di peta | Ubin CARTO kini wajib memakai key. Proyek ini memakai ubin Esri dan OSM yang tanpa key, jadi pastikan Anda memakai versi terbaru dan tekan Ctrl+F5 |
