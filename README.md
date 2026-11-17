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
| Validasi | `/validasi` | Hasil 26 pemeriksaan otomatis dan grafik Roadroid vs Galura |
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
- **Validasi data:** 26 pemeriksaan keakuratan dan konsistensi, termasuk pemeriksaan silang dengan olahan resmi DBMPR dan statistik BPS, serta perbandingan dengan data Galura, dapat dibuka di halaman *Validasi* atau dengan `npm run validasi`
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
│   ├── img/kondisi/     foto contoh 4 kelas; ruas/ = 257 foto galeri; pemeliharaan/ = foto sebelum/sesudah DBMPR
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
| `data/pembanding_skj_dbmpr.csv` | IRI per segmen resmi DBMPR (survei Roadroid Jan 2021, 2.633 segmen), untuk validasi | Temanjabar, layer `6_rj_prov_skj` |
| `data/pembanding_visual_dbmpr.csv` | Luas permukaan per kelas kerusakan, survei visual 29 ruas Sukabumi, untuk validasi | Temanjabar, layer `1_rj_prov_kemantapan` |
| `data/panjang_jalan_bps_2019.csv` | Panjang jalan menurut Kab/Kota dan kewenangan (negara, provinsi, kab/kota), 2019, untuk validasi | [BPS Provinsi Jawa Barat](https://jabar.bps.go.id/) |
| `public/data/kondisi_nasional.geojson` | Kondisi jalan nasional per ruas (256 ruas), kelas = kondisi terpanjang; ditampilkan sebagai garis tipis di peta | Temanjabar, layer `2_rj_nasional` (Ditjen Bina Marga, pembaruan 28 Feb 2024) |
| `public/data/kondisi_kabkota.geojson` | Kondisi jalan kabupaten/kota per ruas (8.766 ruas yang punya data kondisi) | Temanjabar, layer `5_rj_kab_kota` |
| `data/ambil_kondisi_lain.py` | Script pengunduh dan penyederhana dua berkas di atas | — |
| `data/ambil_pembanding.py` | Script pengunduh dua berkas pembanding di atas (WFS Temanjabar) | — |

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
| `/api/foto?lat=&lng=&radius=300` | Foto lapangan di sekitar titik, dikelompokkan per tahun 2018–2025: dokumentasi pemeliharaan DBMPR (Temanjabar, 2021–2023) dan foto bertanda lokasi Wikimedia Commons. Diambil langsung dari sumbernya dan disimpan sementara di memori server |
| `/api/validasi` | Hasil 26 pemeriksaan keakuratan data, pemeriksaan silang DBMPR dan BPS, dan perbandingan dengan Galura 2021 |

Kesalahan dikembalikan sebagai `{ "galat": "pesan" }` dengan kode 400 (input salah), 404, 503 (database tidak dapat diakses), atau 500.

## Status jalan (kewenangan)

Di halaman **Peta**, pilihan *Warnai jalan menurut → Status jalan* (panel samping atau tombol Lapisan) mewarnai garis menurut pengelolanya: jalan nasional (ungu), provinsi (biru), dan kabupaten/kota (hijau toska). Pop-up segmen dan tooltip juga menyebut status jalannya. Di **Dashboard**, kartu *Status jalan menurut kewenangan* menampilkan panjang jalan nasional, provinsi, dan kab/kota per Kabupaten/Kota dari BPS 2019 (`/api/kewenangan`, tabel `pembanding_bps`): total 1.791 km nasional, 2.362 km provinsi, dan 23.436 km kab/kota.

## Validasi keakuratan data

`npm run validasi` (atau tombol *Validasi data* di web) menjalankan 26 pemeriksaan langsung pada tabel PostGIS, dalam tujuh kelompok:

1. **Atribut dan klasifikasi:** kelas sesuai batas IRI, rentang IRI wajar, tanpa nilai kosong atau duplikat, nama Kab/Kota cocok dengan Galura
2. **Geometri:** geometri valid (`ST_IsValid`), segmen di dalam batas provinsi, segmen menempel pada ruas induknya, panjang nominal vs panjang terukur
3. **Kelengkapan survei:** setiap ruas punya segmen, cakupan terhadap panjang resmi
4. **Konsistensi antar-ukuran:** IRI ruas vs rata-rata segmen, persen mantap per titik vs per segmen
5. **Pemeriksaan silang dengan olahan resmi DBMPR:** survei Roadroid yang sama juga diolah DBMPR per segmen resminya (Temanjabar `6_rj_prov_skj`). Dibandingkan per ruas: kecocokan kode ruas, korelasi IRI, kesamaan kelas, dan persen mantap
6. **Pemeriksaan silang dengan statistik BPS 2019:** panjang jalan provinsi per Kabupaten/Kota menurut BPS dibandingkan dengan panjang ruas di aplikasi: kecocokan daftar wilayah, total panjang, dan korelasi per wilayah
7. **Perbandingan dengan Galura 2021:** total panjang, persen mantap provinsi, dan korelasi antar Kabupaten/Kota

Hasil pada data saat ini dibagi dua jenis:

- **Uji kebenaran data (kelompok 1–6):** 22 lulus, 0 perlu perhatian, 0 tidak sesuai, dari 22 pemeriksaan. Satu hasil lain (panjang per kondisi per titik vs per segmen) ditampilkan sebagai *catatan metode*, bukan uji, karena selisihnya memang pasti muncul: segmen 1 km merata-ratakan sekitar 20 titik sehingga nilai ekstrem teredam.
- **Perbandingan dengan Galura (kelompok 7, metode survei berbeda):** 1 sesuai, 2 *berbeda metode*. Bagian ini bersifat informasi, bukan uji benar-salah: Galura direkap DBMPR dari survei visual (luas kerusakan dalam m²), sedangkan peta memakai survei sensor Roadroid (IRI), sehingga angkanya tidak harus sama.

- **Pemeriksaan silang DBMPR (semua lulus):** IRI rata-rata per ruas hasil olahan aplikasi berkorelasi r = 0,957 dengan olahan DBMPR (selisih median 0,06 m/km), 275 dari 297 ruas (92,6%) berkelas sama, dan persen mantap 49,2% vs 50,6%. Artinya, pengolahan data di aplikasi ini sudah benar.
- **Pemeriksaan silang BPS (semua lulus):** total jalan provinsi 2.360,6 km di aplikasi vs 2.362 km menurut BPS 2019 (selisih 0,06%), korelasi per Kabupaten/Kota r = 0,999, dan 23 dari 27 wilayah selisihnya paling banyak 1 km. Empat wilayah sisanya berpasangan dan saling menutup (Purwakarta/Karawang, Kota/Kab. Tasikmalaya): ruas yang melintasi batas wilayah dicatat di Kab/Kota yang berbeda. Artinya, daftar ruas di aplikasi sudah lengkap.

- **Perbaikan yang dilakukan karena validasi:** satu geometri batas provinsi tidak valid (cincin poligon rusak akibat penyederhanaan), diperbaiki dengan `ST_MakeValid` saat impor. Angka panjang per kondisi dan persen mantap di panel Ruas kini dihitung dari segmen 1 km, sama dengan peta; sebelumnya memakai klasifikasi per titik sehingga angkanya berbeda (mis. kondisi Baik 331 km per titik vs 194 km per segmen).
- **Catatan, bukan kesalahan:** 4 segmen tampak berbeda satu kelas dari batas IRI karena nilai dibulatkan 2 desimal (kelas dihitung dari nilai sebelum dibulatkan). Panjang nominal segmen (jumlah titik × 50 m) sekitar 3,6% lebih panjang dari panjang geometri terukur.
- **Dua perbandingan yang berbeda metode:** survei Roadroid (Januari 2021) menghasilkan 49,2% jalan mantap, sedangkan Galura 2021 mencatat 82,3% (selisih −33 poin), dan korelasi antar Kabupaten/Kota hanya r = 0,29. Penyebabnya belum dapat dipastikan. Agar Roadroid menghasilkan 82% mantap, batas mantap harus berada di IRI sekitar 11, bukan 8. Survei visual DBMPR pada 29 ruas wilayah Sukabumi (Temanjabar `1_rj_prov_kemantapan`) menunjukkan pola yang sama: rata-rata 87% luas permukaan baik sampai sedang, sedangkan Roadroid pada ruas yang sama 58% mantap. Ini menguatkan dugaan bahwa selisih berasal dari perbedaan metode survei, bukan dari pengolahan. Kedua sumber sebaiknya dibaca terpisah, dan temuan ini layak dibahas di laporan.

## Gambar kondisi

Foto contoh tiap kelas ada di `public/img/kondisi/foto-*.jpg` (Wikimedia Commons, CC BY / CC BY-SA). **Galeri Beranda** berisi 257 foto lapangan asli, satu per ruas jalan provinsi: dokumentasi pemeliharaan DBMPR Jawa Barat 2022–2023 (Temanjabar, layer WFS `pemeliharaan`, kolom `foto_awal`; berkas di `tj.temanjabar.net/storage/pekerjaan/`). Setiap foto dicocokkan ke segmen survei terdekat (maks. 100 m) dengan PostGIS, lalu per ruas dipilih foto terbaru (diutamakan pekerjaan perkerasan). Foto diperkecil ke 800 px di `public/img/kondisi/ruas/`, datanya di `public/js/foto_ruas.js`. Kelas dan IRI dari survei Roadroid Januari 2021, jadi kondisi di foto bisa berbeda dari kelasnya.

Bagian **Sebelum dan sesudah perbaikan** di Beranda memakai foto asli dokumentasi pemeliharaan DBMPR Jawa Barat dari Temanjabar (layer WFS `pemeliharaan`, kolom `foto_awal` dan `foto_akhir`; berkasnya di `tj.temanjabar.net/storage/pekerjaan/`). Dipilih 12 pekerjaan tambal sulam hotmix, dua dari setiap UPTD, lalu foto diperkecil ke lebar 1.200 px dan disimpan di `public/img/kondisi/pemeliharaan/`. Datanya ada di `public/js/foto_pemeliharaan.js`, termasuk kondisi segmen survei Roadroid terdekat (maks. 200 m) yang dicari dengan PostGIS. Foto diambil 2021–2023 sedangkan survei Januari 2021, jadi keduanya tidak selalu sama persis.

Di halaman **Peta**, pop-up segmen punya tombol **Foto per tahun**. Tombol ini membuka jendela berisi foto lapangan dalam radius 300 m (bisa diperluas ke 1 km) dengan pilihan tahun 2018–2025, mirip *Lihat tanggal lain* di Google Maps. Foto diambil dari Temanjabar (layer `pemeliharaan`, foto sebelum, saat, dan sesudah pekerjaan; tersedia 2021–2023) dan Wikimedia Commons (foto bertanda lokasi berlisensi bebas). Tahun yang tidak punya foto ditampilkan apa adanya. Untuk tahun lain tersedia tombol Street View, karena foto Google tidak boleh diambil langsung. Sumber lain yang dicoba: Mapillary (perlu token akun), KartaView (server tidak dapat diakses), dan Flickr (perlu API key).

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
