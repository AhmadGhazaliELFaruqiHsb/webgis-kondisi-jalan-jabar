"""
Tahap 2 - Pengolahan data WebGIS Kondisi Jalan Provinsi Jawa Barat
Input  : layer Temanjabar (ruas jalan, batas Jabar, titik survei Roadroid)
Output : ruas_jalan.geojson, segmen_kondisi.geojson, batas_jabar.geojson
"""
import json
import math
import pandas as pd
import geopandas as gpd
from shapely.geometry import LineString, MultiLineString, Polygon, MultiPolygon

UP = "/mnt/user-data/uploads/"
OUT = "/home/claude/olah/out/"

# Batas kelas IRI (m/km) - acuan umum Bina Marga
def kelas_iri(v):
    if v < 4:
        return "Baik"
    if v < 8:
        return "Sedang"
    if v < 12:
        return "Rusak Ringan"
    return "Rusak Berat"

def haversine(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))

def rapikan_kabkota(s):
    return s.strip().upper()

# ------------------------------------------------------------------ 1. ruas jalan
raw = json.load(open(UP + "query.json"))
rows = []
for f in raw["features"]:
    a = f["attributes"]
    paths = f["geometry"]["paths"]
    geom = MultiLineString([LineString(p) for p in paths if len(p) > 1])
    rows.append({**a, "geometry": geom})
ruas = gpd.GeoDataFrame(rows, crs="EPSG:4326")

# beberapa ruas tercatat >1 baris (geometri terpecah) -> gabungkan per idruas
agg = {
    "nm_ruas": "first", "kab_kota": "first", "wil_uptd": "first", "uptd": "first",
    "pjg_ruas_m": "first", "sta_awal_m": "first", "sta_akhr_m": "first",
}
ruas = ruas.dissolve(by="idruas", aggfunc=agg).reset_index()
ruas["kab_kota"] = ruas["kab_kota"].map(rapikan_kabkota)
ruas["panjang_km"] = (pd.to_numeric(ruas["pjg_ruas_m"], errors="coerce") / 1000).round(2)

# ------------------------------------------------------------------ 2. titik Roadroid -> segmen 1 km
rr = json.load(open(UP + "query__2_.json"))
pts = pd.DataFrame([{**f["attributes"], "x": f["geometry"]["x"], "y": f["geometry"]["y"]} for f in rr["features"]])
for c in ["eiri", "ciri"]:
    pts[c] = pd.to_numeric(pts[c], errors="coerce")
pts = pts.sort_values(["id_ruas_jalan", "id"]).reset_index(drop=True)

info = ruas.set_index("idruas")[["nm_ruas", "kab_kota", "wil_uptd"]].to_dict("index")
segs = []
TITIK_PER_SEGMEN = 20  # 20 titik x 50 m = 1 km
for rid, g in pts.groupby("id_ruas_jalan", sort=False):
    coords = list(zip(g.x.round(6), g.y.round(6)))
    iri = g.ciri.tolist()
    # pecah bila ada lompatan > 250 m antar titik berurutan (jeda survei)
    runs, cur = [], [0]
    for i in range(1, len(coords)):
        if haversine(coords[i - 1], coords[i]) > 250:
            runs.append(cur); cur = [i]
        else:
            cur.append(i)
    runs.append(cur)
    km = 0.0
    for run in runs:
        for s in range(0, len(run), TITIK_PER_SEGMEN):
            idx = run[s:s + TITIK_PER_SEGMEN]
            # sambungkan ke titik pertama segmen berikutnya agar garis tidak putus
            nxt = run[s + TITIK_PER_SEGMEN] if s + TITIK_PER_SEGMEN < len(run) else None
            line_idx = idx + ([nxt] if nxt is not None else [])
            if len(line_idx) < 2:
                continue
            nilai = sum(iri[i] for i in idx) / len(idx)
            panjang = len(idx) * 0.05
            segs.append({
                "idruas": rid,
                "nm_ruas": info.get(rid, {}).get("nm_ruas"),
                "kab_kota": info.get(rid, {}).get("kab_kota"),
                "km_awal": round(km, 2),
                "km_akhir": round(km + panjang, 2),
                "nilai_iri": round(nilai, 2),
                "kondisi": kelas_iri(nilai),
                "geometry": LineString([coords[i] for i in line_idx]),
            })
            km += panjang
seg = gpd.GeoDataFrame(segs, crs="EPSG:4326")

# ------------------------------------------------------------------ 3. ringkasan kondisi per ruas
pts["kondisi"] = pts.ciri.map(kelas_iri)
per = pts.pivot_table(index="id_ruas_jalan", columns="kondisi", values="id", aggfunc="count", fill_value=0) * 0.05
for k in ["Baik", "Sedang", "Rusak Ringan", "Rusak Berat"]:
    if k not in per:
        per[k] = 0.0
per = per[["Baik", "Sedang", "Rusak Ringan", "Rusak Berat"]].round(2)
per.columns = ["km_baik", "km_sedang", "km_rusak_ringan", "km_rusak_berat"]
per["iri_rata2"] = pts.groupby("id_ruas_jalan").ciri.mean().round(2)
tot = per[["km_baik", "km_sedang", "km_rusak_ringan", "km_rusak_berat"]].sum(axis=1)
per["persen_mantap"] = ((per.km_baik + per.km_sedang) / tot * 100).round(1)
per["kondisi"] = per.iri_rata2.map(kelas_iri)
ruas = ruas.merge(per, left_on="idruas", right_index=True, how="left")

kolom = ["idruas", "nm_ruas", "kab_kota", "wil_uptd", "uptd", "panjang_km", "iri_rata2", "kondisi",
         "persen_mantap", "km_baik", "km_sedang", "km_rusak_ringan", "km_rusak_berat", "geometry"]
ruas = ruas[kolom]
ruas["geometry"] = ruas.geometry.simplify(0.00002, preserve_topology=True)  # ~2 m, perkecil ukuran file

# ------------------------------------------------------------------ 4. batas Jawa Barat
bj = json.load(open(UP + "query__1_.json"))
rings = bj["features"][0]["geometry"]["rings"]
batas = gpd.GeoDataFrame([{"nama": "Jawa Barat", "geometry": MultiPolygon([Polygon(r) for r in rings if len(r) > 3])}], crs="EPSG:4326")
batas["geometry"] = batas.geometry.simplify(0.0005, preserve_topology=True)

# ------------------------------------------------------------------ simpan
import os
os.makedirs(OUT, exist_ok=True)
ruas.to_file(OUT + "ruas_jalan.geojson", driver="GeoJSON", COORDINATE_PRECISION=6)
seg.to_file(OUT + "segmen_kondisi.geojson", driver="GeoJSON", COORDINATE_PRECISION=6)
batas.to_file(OUT + "batas_jabar.geojson", driver="GeoJSON", COORDINATE_PRECISION=5)

print("ruas   :", len(ruas), "| total", ruas.panjang_km.sum().round(1), "km")
print("segmen :", len(seg), "| total", (seg.km_akhir - seg.km_awal).sum().round(1), "km")
print(seg.groupby("kondisi").apply(lambda d: (d.km_akhir - d.km_awal).sum()).round(1))
print(ruas.kondisi.value_counts())
