(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const ctx = () => window.KAS_CTX || {};
  let rows = [];
  let settings = null;
  let loadedFor = null; // kunci "userId|tahunH" agar tidak memuat ulang berlebihan
  let loading = false;

  const num = (v) => Number(v || 0);
  const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
  const rp = (v) => "Rp " + nf.format(num(v));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const stripPrefix = (s, re) => String(s || "").replace(re, "").trim();

  function currentHijriYear() {
    try {
      const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { year: "numeric" }).formatToParts(new Date());
      const y = parseInt(parts.find((p) => p.type === "year")?.value, 10);
      if (y) return y;
    } catch (e) { /* abaikan */ }
    return new Date().getFullYear() - 579;
  }

  function defaultSettings() {
    const p = ctx().profile || {};
    const h = currentHijriYear();
    return {
      id: 1,
      tahun_hijriah: h,
      tahun_masehi: h + 579,
      nama_dkm: p.name || "",
      desa: stripPrefix(p.village, /^(desa|kelurahan)\s+/i),
      kecamatan: stripPrefix(p.district, /^kecamatan\s+/i),
      ketua_upz: "",
      ketua_rw: "",
      no_hp: ""
    };
  }

  const total = (r) => num(r.zakat_fitrah_uang) + num(r.bis_ramadhan) + num(r.zakat_mal) + num(r.infak_umum) + num(r.fidyah);

  function setMsg(id, text, ok = false) {
    const el = $(id);
    el.textContent = text || "";
    el.classList.toggle("success", ok);
  }

  function onUpzPage() {
    return window.location.hash.slice(1) === "upz-perhimpunan";
  }

  function applyVisibility() {
    const admin = Boolean(ctx().isAdmin);
    $("upzGuest").classList.toggle("hidden", admin);
    $("upzAdmin").classList.toggle("hidden", !admin);
  }

  function fillSettingsForm() {
    $("upzTahunH").value = settings.tahun_hijriah;
    $("upzTahunM").value = settings.tahun_masehi;
    $("upzDkm").value = settings.nama_dkm || "";
    $("upzDesa").value = settings.desa || "";
    $("upzKecamatan").value = settings.kecamatan || "";
    $("upzKetua").value = settings.ketua_upz || "";
    $("upzKetuaRw").value = settings.ketua_rw || "";
    $("upzHp").value = settings.no_hp || "";
  }

  async function loadAll(force = false) {
    applyVisibility();
    const c = ctx();
    if (!onUpzPage() || !c.client || !c.isAdmin || loading) return;
    const key = (c.profile?.id || "") + "|" + (settings?.tahun_hijriah || "");
    if (!force && loadedFor === key && settings) { render(); return; }
    loading = true;
    try {
      if (!settings) {
        const { data, error } = await c.client.from("upz_settings").select("*").eq("id", 1).maybeSingle();
        if (error) throw error;
        settings = data ? { ...defaultSettings(), ...data } : defaultSettings();
        fillSettingsForm();
      }
      const { data, error } = await c.client.from("upz_muzaki").select("*")
        .eq("tahun_hijriah", settings.tahun_hijriah).order("created_at", { ascending: true });
      if (error) throw error;
      rows = data || [];
      loadedFor = (c.profile?.id || "") + "|" + settings.tahun_hijriah;
      render();
    } catch (err) {
      console.error("UPZ:", err);
      $("upzList").innerHTML = '<p class="empty-state">Data belum dapat dimuat. Jalankan setup-upz-supabase.sql di Supabase terlebih dahulu.</p>';
      c.showToast?.("Data UPZ gagal dimuat. Pastikan setup-upz-supabase.sql sudah dijalankan.");
    } finally {
      loading = false;
    }
  }

  function filtered() {
    const q = $("upzSearch").value.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => `${r.nama} ${r.alamat} ${r.rt} ${r.rw}`.toLowerCase().includes(q));
  }

  function sums(list) {
    return list.reduce((a, r) => {
      a.jiwa += num(r.jumlah_jiwa); a.fitrah += num(r.zakat_fitrah_uang); a.beras += num(r.zakat_fitrah_beras);
      a.bis += num(r.bis_ramadhan); a.mal += num(r.zakat_mal); a.infak += num(r.infak_umum);
      a.fidyah += num(r.fidyah); a.jumlah += total(r);
      return a;
    }, { jiwa: 0, fitrah: 0, beras: 0, bis: 0, mal: 0, infak: 0, fidyah: 0, jumlah: 0 });
  }

  function render() {
    if (!settings) return;
    $("upzListTitle").textContent = `Perhimpunan Tahun ${settings.tahun_hijriah} H / ${settings.tahun_masehi} M`;
    const all = sums(rows);
    $("upzSumMuzaki").textContent = nf.format(rows.length);
    $("upzSumJiwa").textContent = nf.format(all.jiwa);
    $("upzSumBeras").textContent = nf1.format(all.beras);
    $("upzSumTotal").textContent = rp(all.jumlah);

    const list = filtered();
    const box = $("upzList");
    if (!list.length) {
      box.innerHTML = `<p class="empty-state">${rows.length ? "Tidak ada data yang cocok." : "Belum ada data muzaki untuk tahun ini."}</p>`;
      return;
    }
    const chip = (label, value, cls = "") => num(value) ? `<span class="upz-chip ${cls}">${label} ${nf.format(num(value))}</span>` : "";
    box.innerHTML = list.map((r) => {
      const addr = [r.alamat, (r.rt || r.rw) ? `RT ${r.rt || "-"}/RW ${r.rw || "-"}` : "", num(r.jumlah_jiwa) ? `${nf.format(num(r.jumlah_jiwa))} jiwa` : ""].filter(Boolean).join(" · ");
      const chips = [
        chip("Fitrah", r.zakat_fitrah_uang, "upz-chip-main"),
        num(r.zakat_fitrah_beras) ? `<span class="upz-chip upz-chip-main">Beras ${nf1.format(num(r.zakat_fitrah_beras))} kg</span>` : "",
        chip("BIS", r.bis_ramadhan), chip("Zakat mal", r.zakat_mal), chip("Infak", r.infak_umum), chip("Fidyah", r.fidyah)
      ].join("");
      return `<article class="upz-item">
        <div class="upz-item-top"><strong>${esc(r.nama)}</strong><strong>${rp(total(r))}</strong></div>
        <div class="upz-item-addr">${esc(addr)}</div>
        <div class="upz-chips">${chips || '<span class="upz-chip">Belum ada nominal</span>'}</div>
        <div class="upz-item-actions"><button class="btn btn-outline" type="button" data-upz-edit="${r.id}">Edit</button><button class="btn btn-muted" type="button" data-upz-del="${r.id}">Hapus</button></div>
      </article>`;
    }).join("");
  }

  /* ---------- Form ---------- */
  const moneyIds = ["upzFitrahUang", "upzBis", "upzMal", "upzInfak", "upzFidyah"];

  function updateJumlah() {
    $("upzJumlah").value = rp(moneyIds.reduce((a, id) => a + num($(id).value), 0));
  }

  function resetForm() {
    $("upzForm").reset();
    $("upzId").value = "";
    ["upzJiwa", ...moneyIds, "upzFitrahBeras"].forEach((id) => { $(id).value = 0; });
    $("upzFormTitle").textContent = "Tambah Muzaki";
    $("upzSaveBtn").textContent = "Simpan";
    $("upzCancelBtn").classList.add("hidden");
    updateJumlah();
  }

  function beginEdit(id) {
    const r = rows.find((x) => x.id === id);
    if (!r) return;
    $("upzId").value = r.id;
    $("upzNama").value = r.nama || "";
    $("upzAlamat").value = r.alamat || "";
    $("upzRt").value = r.rt || "";
    $("upzRw").value = r.rw || "";
    $("upzJiwa").value = num(r.jumlah_jiwa);
    $("upzFitrahUang").value = num(r.zakat_fitrah_uang);
    $("upzFitrahBeras").value = num(r.zakat_fitrah_beras);
    $("upzBis").value = num(r.bis_ramadhan);
    $("upzMal").value = num(r.zakat_mal);
    $("upzInfak").value = num(r.infak_umum);
    $("upzFidyah").value = num(r.fidyah);
    $("upzFormTitle").textContent = "Edit Muzaki";
    $("upzSaveBtn").textContent = "Simpan Perubahan";
    $("upzCancelBtn").classList.remove("hidden");
    updateJumlah();
    $("upzForm").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function saveMuzaki(event) {
    event.preventDefault();
    const c = ctx();
    if (!c.isAdmin || !settings) return;
    const payload = {
      tahun_hijriah: settings.tahun_hijriah,
      tahun_masehi: settings.tahun_masehi,
      nama: $("upzNama").value.trim(),
      alamat: $("upzAlamat").value.trim(),
      rt: $("upzRt").value.trim(),
      rw: $("upzRw").value.trim(),
      jumlah_jiwa: Math.max(0, parseInt($("upzJiwa").value, 10) || 0),
      zakat_fitrah_uang: Math.max(0, Math.round(num($("upzFitrahUang").value))),
      zakat_fitrah_beras: Math.max(0, num($("upzFitrahBeras").value)),
      bis_ramadhan: Math.max(0, Math.round(num($("upzBis").value))),
      zakat_mal: Math.max(0, Math.round(num($("upzMal").value))),
      infak_umum: Math.max(0, Math.round(num($("upzInfak").value))),
      fidyah: Math.max(0, Math.round(num($("upzFidyah").value)))
    };
    if (!payload.nama) { setMsg("upzMsg", "Nama muzaki wajib diisi."); return; }
    $("upzSaveBtn").disabled = true;
    setMsg("upzMsg", "Menyimpan...");
    const id = $("upzId").value;
    const q = id
      ? c.client.from("upz_muzaki").update(payload).eq("id", id)
      : c.client.from("upz_muzaki").insert(payload);
    const { error } = await q;
    $("upzSaveBtn").disabled = false;
    if (error) {
      console.error(error);
      setMsg("upzMsg", "Gagal menyimpan: " + error.message);
      return;
    }
    setMsg("upzMsg", id ? "Perubahan disimpan." : "Data muzaki ditambahkan.", true);
    resetForm();
    await loadAll(true);
  }

  async function deleteMuzaki(id) {
    const r = rows.find((x) => x.id === id);
    if (!r || !window.confirm(`Hapus data ${r.nama}?`)) return;
    const { error } = await ctx().client.from("upz_muzaki").delete().eq("id", id);
    if (error) { ctx().showToast?.("Gagal menghapus: " + error.message); return; }
    await loadAll(true);
  }

  async function saveSettings(event) {
    event.preventDefault();
    const c = ctx();
    if (!c.isAdmin) return;
    const th = parseInt($("upzTahunH").value, 10);
    const tm = parseInt($("upzTahunM").value, 10);
    if (!th || !tm) { setMsg("upzSettingsMsg", "Tahun Hijriah dan Masehi wajib diisi."); return; }
    const payload = {
      id: 1, tahun_hijriah: th, tahun_masehi: tm,
      nama_dkm: $("upzDkm").value.trim(), desa: $("upzDesa").value.trim(),
      kecamatan: $("upzKecamatan").value.trim(), ketua_upz: $("upzKetua").value.trim(), ketua_rw: $("upzKetuaRw").value.trim(), no_hp: $("upzHp").value.trim()
    };
    $("upzSaveSettingsBtn").disabled = true;
    const { error } = await c.client.from("upz_settings").upsert(payload);
    $("upzSaveSettingsBtn").disabled = false;
    if (error) { setMsg("upzSettingsMsg", "Gagal menyimpan: " + error.message); return; }
    settings = { ...settings, ...payload };
    setMsg("upzSettingsMsg", "Data kop disimpan.", true);
    await loadAll(true);
  }

  function todayJakarta() {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    return p;
  }

  function longDate(value) {
    const [y, m, d] = String(value || todayJakarta()).split("-").map(Number);
    return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
  }

  /* ---------- Cetak PDF Form A ---------- */
  async function printForm(blank) {
    const c = ctx();
    if (!window.jspdf?.jsPDF) { c.showToast?.("Komponen PDF belum termuat. Muat ulang aplikasi."); return; }
    if (!settings) return;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const M = 10;
    if (typeof doc.autoTable !== "function") { c.showToast?.("Komponen tabel PDF belum termuat. Muat ulang aplikasi."); return; }
    doc.setTextColor(0, 0, 0);

    doc.setFont("helvetica", "italic"); doc.setFontSize(10);
    doc.text("form A DKM/RT/RW", M, 9);

    const logo = await c.loadImageAsPngDataUrl?.("baznas-logo.png?v=2", 800);
    if (logo) doc.addImage(logo, "PNG", W / 2 - 15.2, 6, 30.4, 22);

    doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text("DATA PENGUMPULAN", W / 2, 34, { align: "center" });
    doc.text("DANA ZAKAT FITRAH, BIS RAMADHAN, ZAKAT MAL, INFAK UMUM DAN FIDYAH", W / 2, 40, { align: "center" });
    doc.text(`TAHUN ${settings.tahun_hijriah} H / ${settings.tahun_masehi} M`, W / 2, 46, { align: "center" });

    // Identitas
    const s = settings;
    const field = (label, value, x, colonX, lineEnd, y, underline = true) => {
      doc.setFont("helvetica", "normal"); doc.setFontSize(10);
      doc.text(label, x, y);
      doc.text(":", colonX, y);
      doc.text(String(value || ""), colonX + 3, y - 0.4);
      if (underline) { doc.setLineWidth(0.3); doc.line(colonX + 2, y + 1.2, lineEnd, y + 1.2); }
    };
    field("Nama DKM/RW", blank ? "" : s.nama_dkm, M, 48, 128, 56);
    field("Desa/Kelurahan", blank ? "" : s.desa, M, 48, 128, 62);
    field("Kecamatan", blank ? "" : s.kecamatan, M, 48, 128, 68);
    field("Kabupaten", "SUBANG", M, 48, 128, 74, false);
    field("Nama Ketua UPZ", blank ? "" : s.ketua_upz, 165, 203, W - M, 56);
    field("Nomor Hp.", blank ? "" : s.no_hp, 165, 203, W - M, 62);

    // Tabel
    const data = blank ? [] : rows;
    const fmt = (v) => (num(v) ? nf.format(num(v)) : "");
    const body = data.map((r, i) => [
      i + 1, r.nama || "", r.alamat || "", r.rt || "", r.rw || "",
      num(r.jumlah_jiwa) ? nf.format(num(r.jumlah_jiwa)) : "",
      fmt(r.zakat_fitrah_uang), num(r.zakat_fitrah_beras) ? nf1.format(num(r.zakat_fitrah_beras)) : "",
      fmt(r.bis_ramadhan), fmt(r.zakat_mal), fmt(r.infak_umum), fmt(r.fidyah), fmt(total(r))
    ]);
    while (blank && body.length < 10) body.push(["", "", "", "", "", "", "", "", "", "", "", "", ""]);

    const foot = [];
    if (!blank && data.length) {
      const t = sums(data);
      foot.push([
        { content: "JUMLAH", colSpan: 5, styles: { halign: "center", fontStyle: "bold" } },
        { content: nf.format(t.jiwa), styles: { halign: "center" } }, nf.format(t.fitrah), nf1.format(t.beras), nf.format(t.bis),
        nf.format(t.mal), nf.format(t.infak), nf.format(t.fidyah), nf.format(t.jumlah)
      ]);
    }

    const H = { halign: "center", valign: "middle" };
    doc.autoTable({
      startY: 80,
      margin: { left: M, right: M, bottom: 10 },
      theme: "grid",
      head: [
        [
          { content: "NO", rowSpan: 3, styles: H },
          { content: "NAMA MUZAKI (Kepala Keluarga)", rowSpan: 3, styles: H },
          { content: "ALAMAT", colSpan: 3, styles: H },
          { content: "JUMLAH JIWA (Orang)", rowSpan: 3, styles: H },
          { content: "PENGUMPULAN", colSpan: 7, styles: H }
        ],
        [
          { content: "Kp/Dsn/Blok", rowSpan: 2, styles: H },
          { content: "RT", rowSpan: 2, styles: H },
          { content: "RW", rowSpan: 2, styles: H },
          { content: "ZAKAT FITRAH", colSpan: 2, styles: H },
          { content: "BIS Ramadhan (Rp)", rowSpan: 2, styles: H },
          { content: "Zakat Mal Rp.", rowSpan: 2, styles: H },
          { content: "Infak Umum Rp.", rowSpan: 2, styles: H },
          { content: "Fidyah Rp.", rowSpan: 2, styles: H },
          { content: "Jumlah Rp.", rowSpan: 2, styles: H }
        ],
        [
          { content: "Uang (Rp)", styles: H },
          { content: "Beras (3,5 L / 2,8 kg)", styles: H }
        ]
      ],
      body,
      foot,
      showHead: "everyPage",
      showFoot: "lastPage",
      styles: { font: "helvetica", fontSize: 8, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.3, cellPadding: 1.6, minCellHeight: 8, valign: "middle" },
      headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: "normal", lineWidth: 0.3, lineColor: [0, 0, 0] },
      footStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: "bold", lineWidth: 0.3, lineColor: [0, 0, 0], halign: "right" },
      bodyStyles: { fillColor: [255, 255, 255] },
      columnStyles: {
        0: { cellWidth: 10, halign: "center" },
        1: { cellWidth: 51 },
        2: { cellWidth: 32 },
        3: { cellWidth: 10, halign: "center" },
        4: { cellWidth: 10, halign: "center" },
        5: { cellWidth: 16, halign: "center" },
        6: { cellWidth: 22, halign: "right" },
        7: { cellWidth: 18, halign: "right" },
        8: { cellWidth: 20, halign: "right" },
        9: { cellWidth: 22, halign: "right" },
        10: { cellWidth: 22, halign: "right" },
        11: { cellWidth: 20, halign: "right" },
        12: { cellWidth: 24, halign: "right" }
      }
    });

    // Titimangsa dan tanda tangan
    const pageH = doc.internal.pageSize.getHeight();
    let y = (doc.lastAutoTable?.finalY || 80) + 10;
    if (y + 40 > pageH - 8) { doc.addPage(); y = 20; }
    const sx = W - M - 60;       // blok kanan: Ketua UPZ
    const lx = M + 20;           // blok kiri: Ketua RW
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.text(`${s.desa || "........."}, ${longDate($("upzTglLaporan").value)}`, sx + 30, y, { align: "center" });
    doc.text("Mengetahui,", lx + 30, y, { align: "center" });
    doc.text("Ketua RW 004", lx + 30, y + 5, { align: "center" });
    doc.text("Ketua UPZ", sx + 30, y + 5, { align: "center" });
    const ny = y + 30;
    doc.setFont("helvetica", "bold");
    const rwName = blank ? "" : (s.ketua_rw || "");
    const upzName = blank ? "" : (s.ketua_upz || "");
    doc.text(rwName || "(                                   )", lx + 30, ny, { align: "center" });
    doc.text(upzName || "(                                   )", sx + 30, ny, { align: "center" });
    if (rwName) { doc.setLineWidth(0.3); doc.line(lx + 30 - doc.getTextWidth(rwName) / 2, ny + 1, lx + 30 + doc.getTextWidth(rwName) / 2, ny + 1); }
    if (upzName) { doc.setLineWidth(0.3); doc.line(sx + 30 - doc.getTextWidth(upzName) / 2, ny + 1, sx + 30 + doc.getTextWidth(upzName) / 2, ny + 1); }

    doc.save(`Form-A-UPZ-${blank ? "Kosong-" : ""}${s.tahun_hijriah}H.pdf`);
  }

  /* ---------- Init ---------- */
  function bind() {
    $("upzForm").addEventListener("submit", saveMuzaki);
    $("upzCancelBtn").addEventListener("click", resetForm);
    $("upzSettingsForm").addEventListener("submit", saveSettings);
    $("upzSearch").addEventListener("input", render);
    $("upzPrintBtn").addEventListener("click", () => printForm(false));
    $("upzPrintBlankBtn").addEventListener("click", () => printForm(true));
    moneyIds.forEach((id) => $(id).addEventListener("input", updateJumlah));
    $("upzTahunH").addEventListener("input", () => {
      const h = parseInt($("upzTahunH").value, 10);
      if (h) $("upzTahunM").value = h + 579;
    });
    $("upzList").addEventListener("click", (e) => {
      const ed = e.target.closest("[data-upz-edit]");
      const del = e.target.closest("[data-upz-del]");
      if (ed) beginEdit(ed.dataset.upzEdit);
      if (del) deleteMuzaki(del.dataset.upzDel);
    });
    document.addEventListener("kas:auth", () => { if (!ctx().isAdmin) { settings = null; rows = []; loadedFor = null; } loadAll(); });
    document.addEventListener("kas:page", () => loadAll());
    $("upzTglLaporan").value = todayJakarta();
    resetForm();
    applyVisibility();
  }

  document.addEventListener("DOMContentLoaded", bind);
})();
