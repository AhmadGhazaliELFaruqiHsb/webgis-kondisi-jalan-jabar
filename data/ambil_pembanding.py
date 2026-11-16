"""
Data pembanding untuk validasi (dipakai oleh database/validasi_data.js)
Sumber : GeoServer Temanjabar (DBMPR Jawa Barat), layanan WFS publik
         https://geo.temanjabar.net/geoserver/wfs
Output :
  pembanding_skj_dbmpr.csv      layer 6_rj_prov_skj, IRI per segmen menurut segmentasi resmi DBMPR
                                (survei Roadroid Januari 2021 yang diolah DBMPR sendiri)
  pembanding_visual_dbmpr.csv   layer 1_rj_prov_kemantapan, luas permukaan (m2) per 7 kelas kerusakan
                                hasil survei visual; hanya terisi untuk sebagian ruas (wilayah Sukabumi)
Jalankan: python ambil_pembanding.py   (cukup library standar Python)
"""
import csv
import json
import os
import urllib.request

WFS = ("https://geo.temanjabar.net/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature"
       "&outputFormat=application/json&typeNames=temanjabar:")
DIR = os.path.dirname(os.path.abspath(__file__))
KELAS_VISUAL = ["sangat_baik", "baik", "sedang", "jelek", "parah", "sangat_parah", "hancur"]


def ambil(layer, kolom):
    url = WFS + layer + "&propertyName=" + ",".join(kolom)
    with urllib.request.urlopen(url, timeout=300) as r:
        return [f["properties"] for f in json.load(r)["features"]]


def tulis(nama, kolom, baris):
    with open(os.path.join(DIR, nama), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(kolom)
        w.writerows(baris)
    print(f"{nama}: {len(baris)} baris")


# 1. segmentasi resmi DBMPR (panjang dari kolom l, dalam meter)
skj, unik = [], set()
for p in ambil("6_rj_prov_skj", ["idsegmen", "idruas", "l", "c_iri", "e_iri", "created_at"]):
    if p["idsegmen"] in unik:  # sumber memuat 50 baris ganda yang identik
        continue
    unik.add(p["idsegmen"])
    skj.append(p)
tulis("pembanding_skj_dbmpr.csv", ["idsegmen", "idruas", "panjang_m", "c_iri", "e_iri", "tanggal"],
      [[p["idsegmen"], p["idruas"], round(p["l"], 2), round(p["c_iri"], 4), round(p["e_iri"], 4),
        (p["created_at"] or "")[:10]] for p in skj if p["c_iri"] is not None])

# 2. survei visual: satu baris per ruas yang berisi nilai (layer memuat baris ganda per ruas)
vis, sudah = [], set()
for p in ambil("1_rj_prov_kemantapan", ["idruas", "kab_kota"] + KELAS_VISUAL):
    if p["idruas"] in sudah or not any(p[k] for k in KELAS_VISUAL):
        continue
    sudah.add(p["idruas"])
    vis.append([p["idruas"], p["kab_kota"]] + [p[k] or 0 for k in KELAS_VISUAL])
tulis("pembanding_visual_dbmpr.csv", ["idruas", "kab_kota"] + [k + "_m2" for k in KELAS_VISUAL], vis)
