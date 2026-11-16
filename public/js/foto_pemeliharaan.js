"use strict";
// Foto sebelum dan sesudah pemeliharaan jalan provinsi, dari dokumentasi resmi DBMPR Jawa Barat
// (Temanjabar, layer WFS "pemeliharaan", kolom foto_awal dan foto_akhir; berkas di tj.temanjabar.net/storage/pekerjaan/).
// Dipilih 2 pekerjaan tambal sulam per UPTD. "survei" = segmen survei Roadroid (Jan 2021) terdekat dari titik
// pekerjaan (maks. 200 m), dicari dengan PostGIS; null bila tidak ada segmen sedekat itu.
const FOTO_PEMELIHARAAN = [
 {
  "id": 23280,
  "ruas": "Cibeber - Sukanagara",
  "kab": "Kab. Cianjur",
  "uptd": 1,
  "tanggal": "2021-08-19",
  "lokasi": "KM. BDG. 83+600",
  "pekerjaan": "Tambal Sulam Hotmix",
  "sebelum": "img/kondisi/pemeliharaan/23280-awal.jpg",
  "sesudah": "img/kondisi/pemeliharaan/23280-akhir.jpg",
  "asli": [
   "https://tj.temanjabar.net/storage/pekerjaan/2021122216131461c2ec2a4936e",
   "https://tj.temanjabar.net/storage/pekerjaan/2021122216131461c2ec2a495e5"
  ],
  "survei": {
   "kondisi": "Sedang",
   "iri": 7.05,
   "jarak": 38
  }
 },
 {
  "id": 435,
  "ruas": "Jl. Lawang Gintung (Bogor)",
  "kab": "Kota Bogor",
  "uptd": 1,
  "tanggal": "2021-03-15",
  "lokasi": "Km. Jkt. 63+820",
  "pekerjaan": "Tambal Sulam Hotmix",
  "sebelum": "img/kondisi/pemeliharaan/435-awal.jpg",
  "sesudah": "img/kondisi/pemeliharaan/435-akhir.jpg",
  "asli": [
   "https://tj.temanjabar.net/storage/pekerjaan/2021040915081760700b719ebfd",
   "https://tj.temanjabar.net/storage/pekerjaan/2021040915081760700b719f06c"
  ],
  "survei": {
   "kondisi": "Sedang",
   "iri": 5.63,
   "jarak": 25
  }
 },
 {
  "id": 31414,
  "ruas": "Jl. Lingkar Sukabumi (Baros - Jl. Pembangunan)",
  "kab": "Kota Sukabumi",
  "uptd": 2,
  "tanggal": "2022-04-17",
  "lokasi": "Km Bdg 95+800",
  "pekerjaan": "Tambal Sulam Hotmix",
  "sebelum": "img/kondisi/pemeliharaan/31414-awal.jpg",
  "sesudah": "img/kondisi/pemeliharaan/31414-akhir.jpg",
  "asli": [
   "https://tj.temanjabar.net/storage/pekerjaan/2022042611023962676edfa76fa",
   "https://tj.temanjabar.net/storage/pekerjaan/2022042611023962676edfa7bfc"
  ],
  "survei": {
   "kondisi": "Sedang",
   "iri": 4.65,
   "jarak": 18
  }
 },
 {
  "id": 12088,
  "ruas": "Sp. Surade - Ujunggenteng",
  "kab": "Kab. Sukabumi",
  "uptd": 2,
  "tanggal": "2021-09-14",
  "lokasi": "Km bdg 224+350 - 224+600",
  "pekerjaan": "Tambal Sulam Hotmix",
  "sebelum": "img/kondisi/pemeliharaan/12088-awal.jpg",
  "sesudah": "img/kondisi/pemeliharaan/12088-akhir.jpg",
  "asli": [
   "https://tj.temanjabar.net/storage/pekerjaan/202109151614086141b960a0c58",
   "https://tj.temanjabar.net/storage/pekerjaan/202109151614086141b960a1095"
  ],
  "survei": {
   "kondisi": "Rusak Ringan",
   "iri": 9.53,
   "jarak": 47
  }
 },
 {
  "id": 57477,
  "ruas": "Rajamandala - Cipeundeuy - Cikalongwetan",
  "kab": "Kab. Bandung Barat",
  "uptd": 3,
  "tanggal": "2022-12-01",
  "lokasi": "km bdg 36+240 - 37+350",
  "pekerjaan": "Tambal Sulam Hotmix",
  "sebelum": "img/kondisi/pemeliharaan/57477-awal.jpg",
  "sesudah": "img/kondisi/pemeliharaan/57477-akhir.jpg",
  "asli": [
   "https://tj.temanjabar.net/storage/pekerjaan/Q8OzhsPNFeY0qgQV19kHjR3u1BmQWgMUoQhSJgyb.jpg",
   "https://tj.temanjabar.net/storage/pekerjaan/ni2Vboi0bgQuutOtf5UJfMGSJddZtBQdzM0i85zX.jpg"
  ],
  "survei": {
   "kondisi": "Sedang",
   "iri": 5.24,
   "jarak": 10
  }
 },
 {
  "id": 28841,
  "ruas": "Cipamokolan (Bts. Kota Bandung/Jbt. Tol) - Sp. Manirancan - Jl. Lingkar Luar Majalaya",
  "kab": "Kab. Bandung",
  "uptd": 3,
  "tanggal": "2022-03-03",
  "lokasi": "Km 14+220 tengah",
  "pekerjaan": "Tambal Sulam Hotmix",
  "sebelum": "img/kondisi/pemeliharaan/28841-awal.jpg",
  "sesudah": "img/kondisi/pemeliharaan/28841-akhir.jpg",
  "asli": [
   "https://tj.temanjabar.net/storage/pekerjaan/20220304192301622204a593895",
   "https://tj.temanjabar.net/storage/pekerjaan/20220304192301622204a597578"
  ],
  "survei": {
   "kondisi": "Sedang",
   "iri": 6.98,
   "jarak": 0
  }
 },
 {
  "id": 21839,
  "ruas": "Garut - Bts. Garut/Tasikmalaya",
  "kab": "Kab. Garut",
  "uptd": 4,
  "tanggal": "2021-12-08",
  "lokasi": "73+200",
  "pekerjaan": "Tambal Sulam Hotmix",
  "sebelum": "img/kondisi/pemeliharaan/21839-awal.jpg",
  "sesudah": "img/kondisi/pemeliharaan/21839-akhir.jpg",
  "asli": [
   "https://tj.temanjabar.net/storage/pekerjaan/2021121010173761b2c6d1107ea",
   "https://tj.temanjabar.net/storage/pekerjaan/2021121010173761b2c6d111103"
  ],
  "survei": {
   "kondisi": "Rusak Berat",
   "iri": 12.48,
   "jarak": 2
  }
 },
 {
  "id": 36249,
  "ruas": "Bts. Bandung/Garut - Garut",
  "kab": "Kab. Garut",
  "uptd": 4,
  "tanggal": "2022-06-29",
  "lokasi": "55+100",
  "pekerjaan": "Tambal Sulam Hotmix",
  "sebelum": "img/kondisi/pemeliharaan/36249-awal.jpg",
  "sesudah": "img/kondisi/pemeliharaan/36249-akhir.jpg",
  "asli": [
   "https://tj.temanjabar.net/storage/pekerjaan/2022070111043262be7250b6bd3",
   "https://tj.temanjabar.net/storage/pekerjaan/2022070111043262be7250bb0e1"
  ],
  "survei": {
   "kondisi": "Sedang",
   "iri": 5.44,
   "jarak": 7
  }
 },
 {
  "id": 7873,
  "ruas": "Warudoyong (Bts.Kab. Tasikmalaya/Ciamis) - Sp.3 Winduraja (Kawali)",
  "kab": "Kab. Ciamis",
  "uptd": 5,
  "tanggal": "2021-06-23",
  "lokasi": "Km. Bdg. 91+100",
  "pekerjaan": "Tambal Sulam Hotmix",
  "sebelum": "img/kondisi/pemeliharaan/7873-awal.jpg",
  "sesudah": "img/kondisi/pemeliharaan/7873-akhir.jpg",
  "asli": [
   "https://tj.temanjabar.net/storage/pekerjaan/20210819132818611dfa02c0f94",
   "https://tj.temanjabar.net/storage/pekerjaan/20210819132818611dfa02c12a9"
  ],
  "survei": {
   "kondisi": "Sedang",
   "iri": 7.39,
   "jarak": 4
  }
 },
 {
  "id": 3472,
  "ruas": "Ciawigebang - Jalaksana",
  "kab": "Kab. Kuningan",
  "uptd": 5,
  "tanggal": "2021-03-18",
  "lokasi": "KM.CN 28+350",
  "pekerjaan": "Tambal Sulam Hotmix",
  "sebelum": "img/kondisi/pemeliharaan/3472-awal.jpg",
  "sesudah": "img/kondisi/pemeliharaan/3472-akhir.jpg",
  "asli": [
   "https://tj.temanjabar.net/storage/pekerjaan/2021070116061660dd858876124",
   "https://tj.temanjabar.net/storage/pekerjaan/2021070116061660dd858876792"
  ],
  "survei": {
   "kondisi": "Sedang",
   "iri": 4.04,
   "jarak": 14
  }
 },
 {
  "id": 5878,
  "ruas": "Talaga - Bts. Majalengka/Sumedang (Kirisik)",
  "kab": "Kab. Majalengka",
  "uptd": 6,
  "tanggal": "2021-07-20",
  "lokasi": "Km.Cn.77+775 s/d Km.Cn.77+885",
  "pekerjaan": "Tambal Sulam Hotmix",
  "sebelum": "img/kondisi/pemeliharaan/5878-awal.jpg",
  "sesudah": "img/kondisi/pemeliharaan/5878-akhir.jpg",
  "asli": [
   "https://tj.temanjabar.net/storage/pekerjaan/2021072310010760fa30f3d24e8",
   "https://tj.temanjabar.net/storage/pekerjaan/2021072310010760fa30f3d278e"
  ],
  "survei": {
   "kondisi": "Rusak Ringan",
   "iri": 9.24,
   "jarak": 4
  }
 },
 {
  "id": 68953,
  "ruas": "Jangga - Cikamurang",
  "kab": "Kab. Indramayu",
  "uptd": 6,
  "tanggal": "2023-03-06",
  "lokasi": "km CN 76+000",
  "pekerjaan": "Tambal Sulam Hotmix",
  "sebelum": "img/kondisi/pemeliharaan/68953-awal.jpg",
  "sesudah": "img/kondisi/pemeliharaan/68953-akhir.jpg",
  "asli": [
   "https://tj.temanjabar.net/storage/pekerjaan/skvXkFk4Ov8LPJ1945LjD3tXFxTpzmK3akaIdeIT.jpg",
   "https://tj.temanjabar.net/storage/pekerjaan/HDlgXShWASJiPWqQ2wdfe3UuWLK9x9g8yYIknZ6Q.jpg"
  ],
  "survei": null
 }
];
