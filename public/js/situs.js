"use strict";
// Bagian bersama semua halaman: menu navigasi, tombol tema terang/gelap, dan warna grafik yang mengikuti tema.
// Butuh konfigurasi.js (warnaTema, temaTerang). Halaman lain bisa mendengarkan event "temaberubah".

// Warna dataset yang bergantung tema ditandai dengan properti temaWarna, mis.
// { temaWarna: { borderColor: "aksen" } } -> borderColor = nilai --aksen tema yang sedang aktif.
function warnaDatasetDariTema(ds) {
  if (!ds.temaWarna) return;
  for (const [prop, nama] of Object.entries(ds.temaWarna)) ds[prop] = warnaTema(nama);
}

function warnaGrafikDariTema() {
  if (!window.Chart) return;
  Chart.defaults.color = warnaTema("redup");
  Chart.defaults.borderColor = warnaTema("garis");
}
warnaGrafikDariTema(); // sebelum grafik apa pun dibuat

// Grafik Chart.js membaca warna saat dibuat, jadi saat tema berganti semuanya diperbarui lalu digambar ulang
function segarkanGrafik() {
  if (!window.Chart) return;
  warnaGrafikDariTema();
  Object.values(Chart.instances).forEach((c) => {
    c.data.datasets.forEach(warnaDatasetDariTema);
    c.options.color = Chart.defaults.color;
    Object.values(c.options.scales || {}).forEach((sk) => {
      if (sk.ticks) sk.ticks.color = Chart.defaults.color;
      if (sk.title) sk.title.color = Chart.defaults.color;
      if (sk.grid) sk.grid.color = Chart.defaults.borderColor;
    });
    c.update();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // menu: tandai halaman yang sedang dibuka
  const hal = document.body.dataset.hal;
  document.querySelectorAll(".nav-situs a[data-hal]").forEach((a) => {
    if (a.dataset.hal === hal) a.setAttribute("aria-current", "page");
  });

  // menu lipat di layar sempit
  const btnMenu = document.getElementById("btnMenu");
  const nav = document.getElementById("navSitus");
  if (btnMenu && nav) {
    const atur = (buka) => { nav.classList.toggle("terbuka", buka); btnMenu.setAttribute("aria-expanded", String(buka)); };
    btnMenu.addEventListener("click", (e) => { e.stopPropagation(); atur(!nav.classList.contains("terbuka")); });
    document.addEventListener("click", (e) => { if (!nav.contains(e.target)) atur(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") atur(false); });
  }

  // tombol tema
  const btn = document.getElementById("btnTema");
  if (!btn) return;
  const label = () => {
    const terang = temaTerang();
    btn.textContent = terang ? "☾ Gelap" : "☀ Terang";
    btn.title = terang ? "Ganti ke tema gelap" : "Ganti ke tema terang";
  };
  label();
  btn.addEventListener("click", () => {
    const baru = temaTerang() ? "gelap" : "terang";
    document.documentElement.dataset.tema = baru;
    try { localStorage.setItem("sikojab-tema", baru); } catch (e) { /* mode privat: tema tidak disimpan */ }
    label();
    segarkanGrafik();
    document.dispatchEvent(new CustomEvent("temaberubah", { detail: baru }));
  });
});
