(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const ctx = () => window.KAS_CTX || {};
  let settings = null;      // Data kop UPZ (dibagi untuk Perhimpunan & Pendistribusian)
  let settingsLoading = false;
  let settingsFailed = false;

  const num = (v) => Number(v || 0);
  const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
  const rp = (v) => "Rp " + nf.format(num(v));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const stripPrefix = (s, re) => String(s || "").replace(re, "").trim();
  const total = (r) => num(r.zakat_fitrah_uang) + num(r.bis_ramadhan) + num(r.zakat_mal) + num(r.infak_umum) + num(r.fidyah);
  const currentPage = () => window.location.hash.slice(1);

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
      id: 1, tahun_hijriah: h, tahun_masehi: h + 579,
      nama_dkm: p.name || "",
      desa: stripPrefix(p.village, /^(desa|kelurahan)\s+/i),
      kecamatan: stripPrefix(p.district, /^kecamatan\s+/i),
      ketua_upz: "", ketua_rw: "", no_hp: ""
    };
  }

  function setMsg(id, text, ok = false) {
    const el = $(id);
    el.textContent = text || "";
    el.classList.toggle("success", ok);
  }

  function todayJakarta() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  }

  function longDate(value) {
    const [y, m, d] = String(value || todayJakarta()).split("-").map(Number);
    return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
  }

  function sums(list) {
    return list.reduce((a, r) => {
      a.jiwa += num(r.jumlah_jiwa); a.fitrah += num(r.zakat_fitrah_uang); a.beras += num(r.zakat_fitrah_beras);
      a.bis += num(r.bis_ramadhan); a.mal += num(r.zakat_mal); a.infak += num(r.infak_umum);
      a.fidyah += num(r.fidyah); a.jumlah += total(r);
      return a;
    }, { jiwa: 0, fitrah: 0, beras: 0, bis: 0, mal: 0, infak: 0, fidyah: 0, jumlah: 0 });
  }

  /* ---------- Data kop (form di Profil > Data Kop UPZ) ---------- */
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

  async function loadSettings(force = false) {
    const c = ctx();
    if (!c.client || !c.isAdmin || settingsLoading) return;
    if (settings && !force) return;
    settingsLoading = true;
    try {
      const { data, error } = await c.client.from("upz_settings").select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      settings = data ? { ...defaultSettings(), ...data } : defaultSettings();
      settingsFailed = false;
      fillSettingsForm();
      document.dispatchEvent(new CustomEvent("upz:settings"));
    } catch (err) {
      console.error("UPZ settings:", err);
      settingsFailed = true;
      c.showToast?.("Data kop UPZ gagal dimuat. Pastikan setup-upz-supabase.sql sudah dijalankan.");
      document.dispatchEvent(new CustomEvent("upz:settings"));
    } finally {
      settingsLoading = false;
    }
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
      kecamatan: $("upzKecamatan").value.trim(), ketua_upz: $("upzKetua").value.trim(),
      ketua_rw: $("upzKetuaRw").value.trim(), no_hp: $("upzHp").value.trim()
    };
    $("upzSaveSettingsBtn").disabled = true;
    const { error } = await c.client.from("upz_settings").upsert(payload);
    $("upzSaveSettingsBtn").disabled = false;
    if (error) { setMsg("upzSettingsMsg", "Gagal menyimpan: " + error.message); return; }
    settings = { ...(settings || defaultSettings()), ...payload };
    setMsg("upzSettingsMsg", "Data kop UPZ disimpan. Dipakai di Perhimpunan dan Pendistribusian.", true);
    document.dispatchEvent(new CustomEvent("upz:settings", { detail: { changed: true } }));
  }

  /* ---------- Modul daftar (Perhimpunan & Pendistribusian) ---------- */
  function createModule(cfg) {
    const p = cfg.prefix;
    const id = (s) => p + s;
    const el = (s) => $(p + s);
    const moneyIds = ["FitrahUang", "Bis", "Mal", "Infak", "Fidyah"].map(id);
    let rows = [];
    let loadedFor = null;
    let loading = false;

    const onPage = () => currentPage() === cfg.page;

    function applyVisibility() {
      const admin = Boolean(ctx().isAdmin);
      el("Guest").classList.toggle("hidden", admin);
      el("Admin").classList.toggle("hidden", !admin);
    }

    async function loadAll(force = false) {
      applyVisibility();
      const c = ctx();
      if (!onPage() || !c.client) return;
      if (!c.isAdmin) { loadPublic(); return; }
      if (!settings) {
        if (!settingsFailed) loadSettings();
        else el("List").innerHTML = '<p class="empty-state">Data belum dapat dimuat. Jalankan setup-upz-supabase.sql di Supabase terlebih dahulu.</p>';
        return;
      }
      if (loading) return;
      const key = (c.profile?.id || "") + "|" + settings.tahun_hijriah;
      if (!force && loadedFor === key) { render(); return; }
      loading = true;
      try {
        const { data, error } = await c.client.from(cfg.table).select("*")
          .eq("tahun_hijriah", settings.tahun_hijriah).order("created_at", { ascending: true });
        if (error) throw error;
        rows = data || [];
        loadedFor = key;
        render();
      } catch (err) {
        console.error(cfg.title + ":", err);
        el("List").innerHTML = `<p class="empty-state">Data belum dapat dimuat. Jalankan ${cfg.sqlFile} di Supabase terlebih dahulu.</p>`;
        c.showToast?.(`Data ${cfg.title} gagal dimuat. Pastikan ${cfg.sqlFile} sudah dijalankan.`);
      } finally {
        loading = false;
      }
    }

    /* ---------- Tampilan publik: tanpa nama warga ---------- */
    let pubLoaded = false;
    let pubLoading = false;

    async function loadPublic(force = false) {
      const c = ctx();
      if (pubLoading || (pubLoaded && !force)) return;
      pubLoading = true;
      try {
        const { data, error } = await c.client.rpc(cfg.rpc);
        if (error) throw error;
        renderPublic(data || {});
        pubLoaded = true;
      } catch (err) {
        console.error(cfg.title + " publik:", err);
        el("PubList").innerHTML = `<p class="empty-state">Data belum dapat dimuat. Jalankan ${cfg.publicSqlFile} di Supabase terlebih dahulu.</p>`;
      } finally {
        pubLoading = false;
      }
    }

    function renderPublic(d) {
      const list = Array.isArray(d.rows) ? d.rows : [];
      const th = d.tahun_hijriah, tm = d.tahun_masehi;
      el("PubTitle").textContent = th ? `${cfg.title} Tahun ${th} H / ${tm} M` : cfg.title;
      const all = sums(list);
      el("PubCount").textContent = nf.format(list.length);
      el("PubJiwa").textContent = nf.format(all.jiwa);
      el("PubBeras").textContent = nf1.format(all.beras);
      el("PubTotal").textContent = rp(all.jumlah);
      if (!list.length) { el("PubList").innerHTML = `<p class="empty-state">${cfg.emptyText}</p>`; return; }
      const f = (v) => (num(v) ? nf.format(num(v)) : "-");
      const body = list.map((r, i) => `<tr><td>${i + 1}</td><td>${r.rt || r.rw ? `${esc(r.rt || "-")}/${esc(r.rw || "-")}` : "-"}</td><td>${f(r.jumlah_jiwa)}</td><td>${f(r.zakat_fitrah_uang)}</td><td>${num(r.zakat_fitrah_beras) ? nf1.format(num(r.zakat_fitrah_beras)) : "-"}</td><td>${f(r.bis_ramadhan)}</td><td>${f(r.zakat_mal)}</td><td>${f(r.infak_umum)}</td><td>${f(r.fidyah)}</td><td><b>${nf.format(total(r))}</b></td></tr>`).join("");
      el("PubList").innerHTML = `<div class="upz-pub-scroll"><table class="upz-pub-table"><thead><tr><th>No</th><th>RT/RW</th><th>Jiwa</th><th>Fitrah (Rp)</th><th>Beras (kg)</th><th>BIS (Rp)</th><th>Zakat Mal (Rp)</th><th>Infak (Rp)</th><th>Fidyah (Rp)</th><th>Jumlah (Rp)</th></tr></thead><tbody>${body}</tbody></table></div>`;
    }

    function filtered() {
      const q = el("Search").value.trim().toLowerCase();
      if (!q) return rows;
      return rows.filter((r) => `${r.nama} ${r.alamat} ${r.rt} ${r.rw}`.toLowerCase().includes(q));
    }

    function render() {
      if (!settings) return;
      el("ListTitle").textContent = `${cfg.title} Tahun ${settings.tahun_hijriah} H / ${settings.tahun_masehi} M`;
      el("YearNote").textContent = `Tahun ${settings.tahun_hijriah} H / ${settings.tahun_masehi} M · ${settings.nama_dkm || "Nama DKM/RW belum diisi"}`;
      const all = sums(rows);
      el("SumMuzaki").textContent = nf.format(rows.length);
      el("SumJiwa").textContent = nf.format(all.jiwa);
      el("SumBeras").textContent = nf1.format(all.beras);
      el("SumTotal").textContent = rp(all.jumlah);

      const list = filtered();
      const box = el("List");
      if (!list.length) {
        box.innerHTML = `<p class="empty-state">${rows.length ? "Tidak ada data yang cocok." : cfg.emptyText}</p>`;
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
          <div class="upz-item-actions"><button class="btn btn-outline" type="button" data-edit="${r.id}">Edit</button><button class="btn btn-muted" type="button" data-del="${r.id}">Hapus</button></div>
        </article>`;
      }).join("");
    }

    function updateJumlah() {
      el("Jumlah").value = rp(moneyIds.reduce((a, i) => a + num($(i).value), 0));
    }

    function resetForm() {
      el("Form").reset();
      el("Id").value = "";
      [id("Jiwa"), ...moneyIds, id("FitrahBeras")].forEach((i) => { $(i).value = 0; });
      el("FormTitle").textContent = cfg.addTitle;
      el("SaveBtn").textContent = "Simpan";
      el("CancelBtn").classList.add("hidden");
      updateJumlah();
    }

    function beginEdit(rid) {
      const r = rows.find((x) => x.id === rid);
      if (!r) return;
      el("Id").value = r.id;
      el("Nama").value = r.nama || "";
      el("Alamat").value = r.alamat || "";
      el("Rt").value = r.rt || "";
      el("Rw").value = r.rw || "";
      el("Jiwa").value = num(r.jumlah_jiwa);
      el("FitrahUang").value = num(r.zakat_fitrah_uang);
      el("FitrahBeras").value = num(r.zakat_fitrah_beras);
      el("Bis").value = num(r.bis_ramadhan);
      el("Mal").value = num(r.zakat_mal);
      el("Infak").value = num(r.infak_umum);
      el("Fidyah").value = num(r.fidyah);
      el("FormTitle").textContent = cfg.editTitle;
      el("SaveBtn").textContent = "Simpan Perubahan";
      el("CancelBtn").classList.remove("hidden");
      updateJumlah();
      el("Form").scrollIntoView({ behavior: "smooth", block: "center" });
    }

    async function save(event) {
      event.preventDefault();
      const c = ctx();
      if (!c.isAdmin || !settings) return;
      const payload = {
        tahun_hijriah: settings.tahun_hijriah,
        tahun_masehi: settings.tahun_masehi,
        nama: el("Nama").value.trim(),
        alamat: el("Alamat").value.trim(),
        rt: el("Rt").value.trim(),
        rw: el("Rw").value.trim(),
        jumlah_jiwa: Math.max(0, parseInt(el("Jiwa").value, 10) || 0),
        zakat_fitrah_uang: Math.max(0, Math.round(num(el("FitrahUang").value))),
        zakat_fitrah_beras: Math.max(0, num(el("FitrahBeras").value)),
        bis_ramadhan: Math.max(0, Math.round(num(el("Bis").value))),
        zakat_mal: Math.max(0, Math.round(num(el("Mal").value))),
        infak_umum: Math.max(0, Math.round(num(el("Infak").value))),
        fidyah: Math.max(0, Math.round(num(el("Fidyah").value)))
      };
      if (!payload.nama) { setMsg(id("Msg"), cfg.nameRequired); return; }
      el("SaveBtn").disabled = true;
      setMsg(id("Msg"), "Menyimpan...");
      const rid = el("Id").value;
      const q = rid
        ? c.client.from(cfg.table).update(payload).eq("id", rid)
        : c.client.from(cfg.table).insert(payload);
      const { error } = await q;
      el("SaveBtn").disabled = false;
      if (error) {
        console.error(error);
        setMsg(id("Msg"), "Gagal menyimpan: " + error.message);
        return;
      }
      setMsg(id("Msg"), rid ? "Perubahan disimpan." : cfg.addedText, true);
      resetForm();
      await loadAll(true);
    }

    async function remove(rid) {
      const r = rows.find((x) => x.id === rid);
      if (!r || !window.confirm(`Hapus data ${r.nama}?`)) return;
      const { error } = await ctx().client.from(cfg.table).delete().eq("id", rid);
      if (error) { ctx().showToast?.("Gagal menghapus: " + error.message); return; }
      await loadAll(true);
    }

    /* ---------- Cetak PDF ---------- */
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
      doc.text(`form ${cfg.form} DKM/RT/RW`, M, 9);

      const logo = await c.loadImageAsPngDataUrl?.("baznas-logo.png?v=2", 800);
      if (logo) doc.addImage(logo, "PNG", W / 2 - 15.2, 6, 30.4, 22);

      doc.setFont("helvetica", "bold"); doc.setFontSize(12);
      doc.text(cfg.docTitle, W / 2, 34, { align: "center" });
      doc.text("DANA ZAKAT FITRAH, BIS RAMADHAN, ZAKAT MAL, INFAK UMUM DAN FIDYAH", W / 2, 40, { align: "center" });
      doc.text(`TAHUN ${settings.tahun_hijriah} H / ${settings.tahun_masehi} M`, W / 2, 46, { align: "center" });

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
            { content: cfg.nameHead, rowSpan: 3, styles: H },
            { content: "ALAMAT", colSpan: 3, styles: H },
            { content: "JUMLAH JIWA (Orang)", rowSpan: 3, styles: H },
            { content: cfg.groupHead, colSpan: 7, styles: H }
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
          0: { cellWidth: 10, halign: "center" }, 1: { cellWidth: 51 }, 2: { cellWidth: 32 },
          3: { cellWidth: 10, halign: "center" }, 4: { cellWidth: 10, halign: "center" }, 5: { cellWidth: 16, halign: "center" },
          6: { cellWidth: 22, halign: "right" }, 7: { cellWidth: 18, halign: "right" }, 8: { cellWidth: 20, halign: "right" },
          9: { cellWidth: 22, halign: "right" }, 10: { cellWidth: 22, halign: "right" }, 11: { cellWidth: 20, halign: "right" },
          12: { cellWidth: 24, halign: "right" }
        }
      });

      const pageH = doc.internal.pageSize.getHeight();
      let y = (doc.lastAutoTable?.finalY || 80) + 10;
      if (y + 40 > pageH - 8) { doc.addPage(); y = 20; }
      const sx = W - M - 60;
      const lx = M + 20;
      doc.setFont("helvetica", "normal"); doc.setFontSize(10);
      doc.text(`${s.desa || "........."}, ${longDate(el("TglLaporan").value)}`, sx + 30, y, { align: "center" });
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

      doc.save(`${cfg.fileName}-${blank ? "Kosong-" : ""}${s.tahun_hijriah}H.pdf`);
    }

    function bind() {
      el("Form").addEventListener("submit", save);
      el("CancelBtn").addEventListener("click", resetForm);
      el("Search").addEventListener("input", render);
      el("PrintBtn").addEventListener("click", () => printForm(false));
      el("PrintBlankBtn").addEventListener("click", () => printForm(true));
      moneyIds.forEach((i) => $(i).addEventListener("input", updateJumlah));
      el("List").addEventListener("click", (e) => {
        const ed = e.target.closest("[data-edit]");
        const del = e.target.closest("[data-del]");
        if (ed) beginEdit(ed.dataset.edit);
        if (del) remove(del.dataset.del);
      });
      document.addEventListener("kas:auth", () => { if (!ctx().isAdmin) { rows = []; loadedFor = null; } pubLoaded = false; loadAll(); });
      document.addEventListener("kas:page", () => loadAll());
      document.addEventListener("upz:settings", (e) => loadAll(Boolean(e.detail?.changed)));
      el("TglLaporan").value = todayJakarta();
      resetForm();
      applyVisibility();
    }
    return { bind };
  }

  const perhimpunan = createModule({
    prefix: "upz", rpc: "upz_public_perhimpunan", publicSqlFile: "supabase-migration-upz-publik.sql", page: "upz-perhimpunan", table: "upz_muzaki", sqlFile: "setup-upz-supabase.sql",
    title: "Perhimpunan", form: "A", docTitle: "DATA PENGUMPULAN", groupHead: "PENGUMPULAN",
    nameHead: "NAMA MUZAKI (Kepala Keluarga)", fileName: "Form-A-UPZ",
    addTitle: "Tambah Muzaki", editTitle: "Edit Muzaki", addedText: "Data muzaki ditambahkan.",
    nameRequired: "Nama muzaki wajib diisi.", emptyText: "Belum ada data muzaki untuk tahun ini."
  });

  const pendistribusian = createModule({
    prefix: "dist", rpc: "upz_public_pendistribusian", publicSqlFile: "supabase-migration-upz-publik.sql", page: "upz-pendistribusian", table: "upz_mustahik", sqlFile: "supabase-migration-upz-pendistribusian.sql",
    title: "Pendistribusian", form: "B", docTitle: "DATA PENDISTRIBUSIAN", groupHead: "PENDISTRIBUSIAN",
    nameHead: "NAMA MUSTAHIK DAN DHUAFA (Kepala Keluarga)", fileName: "Form-B-UPZ",
    addTitle: "Tambah Mustahik / Dhuafa", editTitle: "Edit Mustahik / Dhuafa", addedText: "Data mustahik ditambahkan.",
    nameRequired: "Nama mustahik wajib diisi.", emptyText: "Belum ada data penerima untuk tahun ini."
  });

  function bind() {
    $("upzSettingsForm").addEventListener("submit", saveSettings);
    $("upzTahunH").addEventListener("input", () => {
      const h = parseInt($("upzTahunH").value, 10);
      if (h) $("upzTahunM").value = h + 579;
    });
    perhimpunan.bind();
    pendistribusian.bind();
    const maybeLoadSettings = () => { if (ctx().isAdmin && (currentPage() === "profil" || currentPage().startsWith("upz-"))) loadSettings(); };
    document.addEventListener("kas:auth", () => { if (!ctx().isAdmin) settings = null; maybeLoadSettings(); });
    document.addEventListener("kas:page", maybeLoadSettings);
  }

  document.addEventListener("DOMContentLoaded", bind);
})();
