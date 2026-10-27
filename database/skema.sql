-- Tahap 3 - Skema database WebGIS Kondisi Jalan Provinsi Jawa Barat
-- Dijalankan otomatis oleh: npm run impor-db  (aman dijalankan berulang kali)
-- Sistem koordinat seluruh geometri: EPSG:4326 (WGS 84)

CREATE EXTENSION IF NOT EXISTS postgis;

DROP VIEW  IF EXISTS v_kondisi_tahunan;
DROP TABLE IF EXISTS segmen_kondisi;
DROP TABLE IF EXISTS ruas_jalan;
DROP TABLE IF EXISTS batas_jabar;
DROP TABLE IF EXISTS kondisi_kabkota;

-- ---------------------------------------------------------------------------
-- 1. Ruas jalan provinsi (garis) + ringkasan kondisi hasil survei per ruas
-- ---------------------------------------------------------------------------
CREATE TABLE ruas_jalan (
    idruas           varchar(12)  PRIMARY KEY,
    nm_ruas          text         NOT NULL,
    kab_kota         text         NOT NULL,
    wil_uptd         text,
    uptd             varchar(4),
    panjang_km       numeric(8,2),
    iri_rata2        numeric(5,2),
    kondisi          varchar(12)  CHECK (kondisi IN ('Baik','Sedang','Rusak Ringan','Rusak Berat')),
    persen_mantap    numeric(5,1),
    km_baik          numeric(8,2) DEFAULT 0,
    km_sedang        numeric(8,2) DEFAULT 0,
    km_rusak_ringan  numeric(8,2) DEFAULT 0,
    km_rusak_berat   numeric(8,2) DEFAULT 0,
    geom             geometry(MultiLineString, 4326) NOT NULL
);

-- ---------------------------------------------------------------------------
-- 2. Segmen +-1 km dengan nilai IRI (m/km) dan kelas kondisinya
-- ---------------------------------------------------------------------------
CREATE TABLE segmen_kondisi (
    id         serial       PRIMARY KEY,
    idruas     varchar(12)  NOT NULL REFERENCES ruas_jalan (idruas) ON DELETE CASCADE,
    km_awal    numeric(8,2) NOT NULL,
    km_akhir   numeric(8,2) NOT NULL,
    nilai_iri  numeric(5,2) NOT NULL,
    kondisi    varchar(12)  NOT NULL CHECK (kondisi IN ('Baik','Sedang','Rusak Ringan','Rusak Berat')),
    geom       geometry(LineString, 4326) NOT NULL
);

-- ---------------------------------------------------------------------------
-- 3. Batas Provinsi Jawa Barat (poligon)
-- ---------------------------------------------------------------------------
CREATE TABLE batas_jabar (
    id    serial PRIMARY KEY,
    nama  text   NOT NULL,
    geom  geometry(MultiPolygon, 4326) NOT NULL
);

-- ---------------------------------------------------------------------------
-- 4. Panjang jalan per kondisi per Kab/Kota per tahun (Galura Data Jabar)
-- ---------------------------------------------------------------------------
CREATE TABLE kondisi_kabkota (
    id                    integer      PRIMARY KEY,
    kode_kabupaten_kota   varchar(4)   NOT NULL,
    nama_kabupaten_kota   text         NOT NULL,
    wilayah_uptd          text,
    kategori_jalan        varchar(14)  NOT NULL CHECK (kategori_jalan IN ('MANTAP','TIDAK MANTAP')),
    kondisi_jalan         varchar(14)  NOT NULL CHECK (kondisi_jalan IN ('BAIK','SEDANG','RUSAK RINGAN','RUSAK BERAT')),
    panjang_km            numeric(8,2) NOT NULL,
    tahun                 smallint     NOT NULL
);

-- ---------------------------------------------------------------------------
-- Indeks: GiST untuk kueri spasial, B-tree untuk filter yang sering dipakai
-- ---------------------------------------------------------------------------
CREATE INDEX idx_ruas_geom        ON ruas_jalan     USING GIST (geom);
CREATE INDEX idx_ruas_kabkota     ON ruas_jalan     (kab_kota);
CREATE INDEX idx_ruas_kondisi     ON ruas_jalan     (kondisi);
CREATE INDEX idx_segmen_geom      ON segmen_kondisi USING GIST (geom);
CREATE INDEX idx_segmen_geog      ON segmen_kondisi USING GIST ((geom::geography));  -- untuk ST_DWithin (meter)
CREATE INDEX idx_segmen_idruas    ON segmen_kondisi (idruas);
CREATE INDEX idx_segmen_kondisi   ON segmen_kondisi (kondisi);
CREATE INDEX idx_batas_geom       ON batas_jabar    USING GIST (geom);
CREATE INDEX idx_kk_nama_tahun    ON kondisi_kabkota (nama_kabupaten_kota, tahun);

-- ---------------------------------------------------------------------------
-- View: rekap panjang jalan per kondisi per Kab/Kota per tahun
-- "Mantap" menurut Bina Marga = Baik + Sedang
-- ---------------------------------------------------------------------------
CREATE VIEW v_kondisi_tahunan AS
SELECT
    nama_kabupaten_kota                                                    AS kab_kota,
    tahun,
    SUM(panjang_km) FILTER (WHERE kondisi_jalan = 'BAIK')                  AS km_baik,
    SUM(panjang_km) FILTER (WHERE kondisi_jalan = 'SEDANG')                AS km_sedang,
    SUM(panjang_km) FILTER (WHERE kondisi_jalan = 'RUSAK RINGAN')          AS km_rusak_ringan,
    SUM(panjang_km) FILTER (WHERE kondisi_jalan = 'RUSAK BERAT')           AS km_rusak_berat,
    SUM(panjang_km)                                                        AS km_total
FROM kondisi_kabkota
GROUP BY nama_kabupaten_kota, tahun;
