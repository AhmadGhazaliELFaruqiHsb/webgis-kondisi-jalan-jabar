"""Unduh kondisi jalan NASIONAL dan KABUPATEN/KOTA di Jawa Barat dari GeoServer Temanjabar (DBMPR),
lalu tentukan kelas kondisi tiap ruas dan simpan sebagai GeoJSON ringan untuk peta.

  2_rj_nasional  : panjang baik/sedang/rusak ringan/rusak berat per link (good/fair/poor/bad_km),
                   data Ditjen Bina Marga, diperbarui 28 Februari 2024
  5_rj_kab_kota  : panjang baik/sedang/rusak ringan/rusak berat per ruas (len_good/medium/bad/worst)

Kelas tiap ruas = kondisi dengan panjang terbesar (dominan). Persen tiap kondisi ikut disimpan untuk tooltip.
Jalankan dari folder proyek:  python data/ambil_kondisi_lain.py
Hasil: public/data/kondisi_nasional.geojson dan public/data/kondisi_kabkota.geojson
"""
import json
import math
import os
import urllib.parse
import urllib.request

WFS = "https://geo.temanjabar.net/geoserver/wfs?service=WFS&version=1.0.0&request=GetFeature&outputFormat=application/json"
KELAS = ["Baik", "Sedang", "Rusak Ringan", "Rusak Berat"]
KELUAR = os.path.join(os.path.dirname(__file__), "..", "public", "data")


def ambil(layer, kolom):
    url = f"{WFS}&typeName=temanjabar:{layer}&propertyName={','.join(kolom + ['geom'])}"
    with urllib.request.urlopen(url, timeout=600) as r:
        return json.load(r)["features"]


def jarak_titik_garis(p, a, b):
    if a == b:
        return math.hypot(p[0] - a[0], p[1] - a[1])
    dx, dy = b[0] - a[0], b[1] - a[1]
    t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)))
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)


def sederhana(titik, tol):
    """Douglas-Peucker tanpa rekursi."""
    if len(titik) < 3:
        return titik
    simpan = [False] * len(titik)
    simpan[0] = simpan[-1] = True
    tumpuk = [(0, len(titik) - 1)]
    while tumpuk:
        i, j = tumpuk.pop()
        maks, k = 0, None
        for m in range(i + 1, j):
            d = jarak_titik_garis(titik[m], titik[i], titik[j])
            if d > maks:
                maks, k = d, m
        if k is not None and maks > tol:
            simpan[k] = True
            tumpuk += [(i, k), (k, j)]
    return [p for p, s in zip(titik, simpan) if s]


def geometri(g, tol):
    if not g:
        return None
    garis = g["coordinates"] if g["type"] == "MultiLineString" else [g["coordinates"]] if g["type"] == "LineString" else []
    hasil = []
    for l in garis:
        s = [[round(x, 5), round(y, 5)] for x, y, *_ in sederhana([tuple(p[:2]) for p in l], tol)]
        if len(s) >= 2:
            hasil.append(s)
    if not hasil:
        return None
    return {"type": "LineString", "coordinates": hasil[0]} if len(hasil) == 1 else {"type": "MultiLineString", "coordinates": hasil}


def angka(v):
    try:
        return max(0.0, float(v))
    except (TypeError, ValueError):
        return 0.0


def olah(fitur, nama_fn, kab_fn, panjang_fn, tol, sumber):
    keluar, km = [], {k: 0.0 for k in KELAS}
    for f in fitur:
        p = f["properties"]
        pj = panjang_fn(p)
        total = sum(pj)
        g = geometri(f.get("geometry"), tol)
        if total <= 0 or g is None:
            continue
        kelas = KELAS[pj.index(max(pj))]
        persen = [round(100 * x / total, 1) for x in pj]
        keluar.append({"type": "Feature", "geometry": g, "properties": {
            "nama": nama_fn(p), "kab": kab_fn(p), "kelas": kelas,
            "persen": persen, "mantap": round(persen[0] + persen[1], 1), "sumber": sumber}})
        for k, x in zip(KELAS, pj):
            km[k] += x
    return keluar, km


def simpan(nama, fitur):
    jalur = os.path.join(KELUAR, nama)
    with open(jalur, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": fitur}, f, ensure_ascii=False, separators=(",", ":"))
    return os.path.getsize(jalur) / 1024


if __name__ == "__main__":
    os.makedirs(KELUAR, exist_ok=True)

    nas = ambil("2_rj_nasional", ["link_name", "good_km", "fair_km", "poor_km", "bad_km"])
    f_nas, km_nas = olah(
        nas, lambda p: (p.get("link_name") or "Jalan nasional").title(), lambda p: "",
        lambda p: [angka(p.get(k)) for k in ("good_km", "fair_km", "poor_km", "bad_km")],
        0.00005, "Jalan nasional, Ditjen Bina Marga (pembaruan 28 Feb 2024)")
    print(f"kondisi_nasional.geojson: {len(f_nas)} ruas, {simpan('kondisi_nasional.geojson', f_nas):.0f} KB,",
          {k: round(v, 1) for k, v in km_nas.items()})

    kk = ambil("5_rj_kab_kota", ["nama_ruas", "kab_kota", "len_good", "len_medium", "len_bad", "len_worst"])
    f_kk, km_kk = olah(
        kk, lambda p: p.get("nama_ruas") or "Jalan kabupaten/kota", lambda p: p.get("kab_kota") or "",
        lambda p: [angka(p.get(k)) for k in ("len_good", "len_medium", "len_bad", "len_worst")],
        0.0001, "Jalan kabupaten/kota, Temanjabar DBMPR")
    print(f"kondisi_kabkota.geojson: {len(f_kk)} ruas, {simpan('kondisi_kabkota.geojson', f_kk):.0f} KB")
