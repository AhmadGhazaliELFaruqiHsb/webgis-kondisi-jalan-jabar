"""
Jalan non-provinsi sebagai lapisan pembanding (abu-abu, tanpa data kondisi) di peta.
Sumber : WFS Temanjabar (DBMPR Jawa Barat): 2_rj_nasional, 3_rj_tol_operasional, 5_rj_kab_kota
Output : ../public/data/jalan_nasional.geojson, jalan_tol.geojson, jalan_kabkota.geojson
Geometri disederhanakan (Douglas-Peucker) dan koordinat dibulatkan agar berkas ringan.
Jalankan: python ambil_jalan_lain.py   (cukup library standar Python)
"""
import json, os, urllib.request

WFS = ("https://geo.temanjabar.net/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature"
       "&outputFormat=application/json&typeNames=temanjabar:")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "data")

def dp(pts, tol):
    """Penyederhanaan Douglas-Peucker (derajat), iteratif."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (x1, y1), (x2, y2) = pts[a][:2], pts[b][:2]
        dx, dy = x2 - x1, y2 - y1; L = dx * dx + dy * dy
        best, idx = -1.0, -1
        for i in range(a + 1, b):
            x, y = pts[i][:2]
            if L == 0: d = (x - x1) ** 2 + (y - y1) ** 2
            else:
                t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / L))
                d = (x - x1 - t * dx) ** 2 + (y - y1 - t * dy) ** 2
            if d > best: best, idx = d, i
        if best > tol * tol:
            keep[idx] = True; stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(pts, keep) if k]

def garis(geom, tol, d):
    if not geom: return None
    parts = geom["coordinates"] if geom["type"] == "MultiLineString" else [geom["coordinates"]]
    out = []
    for p in parts:
        q = [[round(c[0], d), round(c[1], d)] for c in dp(p, tol)]
        if len(q) > 1: out.append(q)
    return {"type": "MultiLineString", "coordinates": out} if out else None

def olah(layer, nama_kolom, berkas, tol, d):
    with urllib.request.urlopen(WFS + layer, timeout=600) as r:
        data = json.load(r)
    fitur = []
    for f in data["features"]:
        g = garis(f.get("geometry"), tol, d)
        if g:
            nama = next((f["properties"].get(k) for k in nama_kolom if f["properties"].get(k)), "")
            fitur.append({"type": "Feature", "properties": {"nama": str(nama).strip()}, "geometry": g})
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, berkas), "w", encoding="utf-8") as fo:
        json.dump({"type": "FeatureCollection", "features": fitur}, fo, ensure_ascii=False, separators=(",", ":"))
    print(f"{berkas}: {len(fitur)} fitur, {os.path.getsize(os.path.join(OUT, berkas)) // 1024} KB")

olah("2_rj_nasional", ["link_name"], "jalan_nasional.geojson", 0.00005, 5)
olah("3_rj_tol_operasional", ["nama"], "jalan_tol.geojson", 0.00005, 5)
olah("5_rj_kab_kota", ["nama_ruas"], "jalan_kabkota.geojson", 0.0001, 5)
