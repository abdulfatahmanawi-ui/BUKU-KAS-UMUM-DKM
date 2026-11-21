(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const config = window.APP_CONFIG || {};
  const configured =
    config.SUPABASE_URL &&
    config.SUPABASE_ANON_KEY &&
    !config.SUPABASE_URL.includes("YOUR-PROJECT-ID") &&
    !config.SUPABASE_ANON_KEY.includes("YOUR_SUPABASE");

  let client = null;
  let transactions = [];
  let fundsReady = false;
  let reportDataReady = false;
  const fundNames = {"DKM":"Kas DKM","PEMBANGUNAN":"Kas Pembangunan","PHBI":"Kas PHBI"};
  const defaultCategories = {
    MASUK: ["Infak", "Sedekah", "Donasi Jamaah", "Wakaf", "Sumbangan", "Lainnya"],
    KELUAR: ["Operasional", "Listrik dan Air", "Kebersihan", "Pembangunan", "Kegiatan Masjid", "Perlengkapan", "Lainnya"]
  };
  let transactionCategories = { MASUK: [], KELUAR: [] };
  let isAdmin = false;
  let currentUser = null;
  let toastTimer = null;
  let mosqueProfile = {
    id: 1,
    name: "Masjid Jami Al-Ikhlas",
    address: "Dusun Pokek RW 004",
    village: "Desa Kawunganten",
    district: "Kecamatan Cikaum",
    regency: "Kabupaten Subang",
    phone: "",
    email: "",
    description: "Informasi ini disediakan untuk membantu jamaah memantau pengelolaan kas masjid. Data transaksi dikelola oleh pengurus yang berwenang.",
    logo_url: null,
    logo_path: null
  };
  const PROFILE_BUCKET = "mosque-assets";
  const officerDefaults = [
    { id: "pelindung", role: "Pelindung", group: "Pengurus Inti", sort: 1 },
    { id: "penasehat", role: "Penasehat", group: "Pengurus Inti", sort: 2 },
    { id: "ketua", role: "Ketua", group: "Pengurus Inti", sort: 3 },
    { id: "wakil_ketua", role: "Wakil Ketua", group: "Pengurus Inti", sort: 4 },
    { id: "sekretaris", role: "Sekretaris", group: "Pengurus Inti", sort: 5 },
    { id: "bendahara", role: "Bendahara", group: "Pengurus Inti", sort: 6 },
    { id: "bidang_manajemen", role: "Bidang Manajemen dan Administrasi", group: "Bidang-bidang", sort: 7 },
    { id: "bidang_sdm", role: "Bidang Pengembangan SDM", group: "Bidang-bidang", sort: 8 },
    { id: "bidang_sarana", role: "Bidang Pemeliharaan dan Sarana", group: "Bidang-bidang", sort: 9 },
    { id: "bidang_remaja", role: "Bidang Pembinaan Remaja Masjid", group: "Bidang-bidang", sort: 10 },
    { id: "bidang_humas", role: "Bidang Hubungan Masyarakat dan Pendanaan", group: "Bidang-bidang", sort: 11 }
  ];
  let officers = officerDefaults.map((item) => ({ ...item, name: "" }));

  const rupiah = (value) => new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0
  }).format(Number(value || 0));

  const formatDate = (value) => {
    if (!value) return "-";
    const date = new Date(`${value}T00:00:00`);
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit", month: "short", year: "numeric"
    }).format(date);
  };

  function getJakartaDateInputValue() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);

  function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
  }

  function kindToType(kind) {
    const value = String(kind || "").toLowerCase();
    if (["in", "income", "masuk"].includes(value)) return "MASUK";
    if (["out", "expense", "keluar", "pengeluaran"].includes(value)) return "KELUAR";
    return "UNKNOWN";
  }

  function typeToKind(type) {
    return type === "MASUK" ? "in" : "out";
  }

  function updatePartyNameLabel() {
    const incoming = $("transactionType").value === "MASUK";
    $("partyNameLabel").textContent = incoming ? "Nama penyetor" : "Nama penerima";
    $("transactionPartyName").placeholder = incoming
      ? "Nama orang yang menyetorkan uang"
      : "Nama orang yang menerima uang";
  }

  function setConnection(text, status) {
    const el = $("connectionStatus");
    el.textContent = text;
    el.className = `status-pill status-${status}`;
  }

  function setFormMessage(message, success = false) {
    const el = $("formMessage");
    el.textContent = message;
    el.classList.toggle("success", success);
  }

  function setLoginMessage(message) {
    $("loginMessage").textContent = message;
  }

  function updateAdminUI() {
    $("adminPanel").classList.toggle("hidden", !isAdmin);
    $("adminBadge").classList.toggle("hidden", !isAdmin);
    $("loginOpenBtn").classList.toggle("hidden", Boolean(currentUser));
    $("logoutBtn").classList.toggle("hidden", !currentUser);
    $("actionHeader").classList.toggle("hidden", !isAdmin);
    $("profilePanel").classList.toggle("hidden", !isAdmin);
    $("officersAdminPanel").classList.toggle("hidden", !isAdmin);
  }

  async function verifyAdmin(user) {
    if (!user) {
      currentUser = null;
      isAdmin = false;
      updateAdminUI();
      return;
    }
    currentUser = user;
    try {
      const { data, error } = await client
        .from("admin_users")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      isAdmin = Boolean(data);
      updateAdminUI();

      if (!isAdmin) {
        showToast("Akun berhasil login, tetapi belum terdaftar sebagai administrator.");
      }
    } catch (error) {
      isAdmin = false;
      updateAdminUI();
      console.error("Verifikasi admin:", error);
      showToast("Tidak dapat memverifikasi hak administrator.");
    }
  }

  function profileAddressLine(profile = mosqueProfile, separator = " · ") {
    return [profile.address, profile.village, profile.district, profile.regency]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(separator);
  }

  function renderMosqueProfile() {
    $("brandName").textContent = mosqueProfile.name || "Masjid";
    $("brandSubtitle").textContent = profileAddressLine(mosqueProfile);
    $("publicProfileName").textContent = mosqueProfile.name || "Masjid";
    $("publicProfileAddress").textContent = profileAddressLine(mosqueProfile) || "Alamat belum tersedia";
    for (const [id, value] of [
      ["publicProfilePhone", mosqueProfile.phone],
      ["publicProfileEmail", mosqueProfile.email]
    ]) {
      $(id).textContent = value || "";
      $(id + "Row").hidden = !value;
    }
    $("footerBrandName").textContent = mosqueProfile.name || "Masjid";
    $("publicDescription").textContent = mosqueProfile.description ||
      "Informasi kas masjid disediakan untuk membantu jamaah memantau pengelolaan keuangan.";
    document.title = `Kas DKM | ${mosqueProfile.name || "Masjid"}`;

    const mark = $("brandMark");
    mark.replaceChildren();
    if (mosqueProfile.logo_url) {
      const image = document.createElement("img");
      image.src = mosqueProfile.logo_url;
      image.alt = `Logo ${mosqueProfile.name || "masjid"}`;
      mark.appendChild(image);
      mark.classList.add("has-logo");
    } else {
      mark.textContent = "DKM";
      mark.classList.remove("has-logo");
    }
    populateProfileForm();
  }

  function populateProfileForm() {
    if (!$("profileForm")) return;
    $("profileName").value = mosqueProfile.name || "";
    $("profileAddress").value = mosqueProfile.address || "";
    $("profileVillage").value = mosqueProfile.village || "";
    $("profileDistrict").value = mosqueProfile.district || "";
    $("profileRegency").value = mosqueProfile.regency || "";
    $("profilePhone").value = mosqueProfile.phone || "";
    $("profileEmail").value = mosqueProfile.email || "";
    $("profileDescription").value = mosqueProfile.description || "";
    $("profileLogoFile").value = "";
    $("removeProfileLogo").checked = false;
    renderProfileLogoPreview(mosqueProfile.logo_url);
  }

  function renderProfileLogoPreview(url) {
    const image = $("profileLogoPreview");
    const placeholder = $("profileLogoPlaceholder");
    if (url) {
      image.src = url;
      image.classList.remove("hidden");
      placeholder.classList.add("hidden");
    } else {
      image.removeAttribute("src");
      image.classList.add("hidden");
      placeholder.classList.remove("hidden");
    }
  }

  async function loadMosqueProfile() {
    if (!client) return;
    const { data, error } = await client
      .from("mosque_profile")
      .select("id, name, address, village, district, regency, phone, email, description, logo_url, logo_path")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      console.error("Memuat profil masjid:", error);
      showToast("Profil masjid belum tersedia. Jalankan SQL pembaruan profil di Supabase.");
      renderMosqueProfile();
      return;
    }
    if (data) mosqueProfile = { ...mosqueProfile, ...data };
    renderMosqueProfile();
  }

  function renderOfficers() {
    const publicTarget = $("publicOfficers");
    if (publicTarget) {
      const groups = ["Pengurus Inti", "Bidang-bidang"];
      publicTarget.innerHTML = groups.map((group) => {
        const items = officers.filter((item) => item.group === group).sort((a,b) => a.sort-b.sort);
        return `<div class="officer-group"><h3>${escapeHtml(group)}</h3><dl class="officer-list">${items.map((item) => `<div><dt>${escapeHtml(item.role)}</dt><dd>${escapeHtml(item.name || "—")}</dd></div>`).join("")}</dl></div>`;
      }).join("");
    }
    const editor = $("officersEditor");
    if (editor) {
      const groups = ["Pengurus Inti", "Bidang-bidang"];
      editor.innerHTML = groups.map((group) => `<div class="officer-group"><h3>${escapeHtml(group)}</h3><div class="officer-input-grid">${officers.filter((item) => item.group === group).sort((a,b) => a.sort-b.sort).map((item) => `<label>${escapeHtml(item.role)}<input type="text" maxlength="120" data-officer-id="${escapeHtml(item.id)}" value="${escapeHtml(item.name || "")}" placeholder="Masukkan nama ${escapeHtml(item.role.toLowerCase())}"></label>`).join("")}</div></div>`).join("");
    }
  }

  async function loadOfficers() {
    if (!client) return;
    const { data, error } = await client.from("dkm_officers").select("officer_id, role_name, group_name, person_name, sort_order").order("sort_order", { ascending: true });
    if (error) {
      console.error("Memuat susunan pengurus:", error);
      if ($("officersMessage")) $("officersMessage").textContent = "Jalankan SQL migration susunan pengurus terlebih dahulu.";
      renderOfficers();
      return;
    }
    const byId = new Map((data || []).map((row) => [row.officer_id, row]));
    officers = officerDefaults.map((item) => {
      const row = byId.get(item.id);
      return { ...item, name: row?.person_name || "" };
    });
    renderOfficers();
  }

  async function saveOfficers(event) {
    event.preventDefault();
    if (!isAdmin) return;
    const button = $("saveOfficersBtn");
    button.disabled = true; button.textContent = "Menyimpan...";
    try {
      const values = [...document.querySelectorAll("[data-officer-id]")];
      const rows = officers.map((item) => ({
        officer_id: item.id, role_name: item.role, group_name: item.group,
        person_name: values.find((input) => input.dataset.officerId === item.id)?.value.trim() || "",
        sort_order: item.sort
      }));
      const { error } = await client.from("dkm_officers").upsert(rows, { onConflict: "officer_id" });
      if (error) throw error;
      officers = officers.map((item) => ({ ...item, name: rows.find((row) => row.officer_id === item.id)?.person_name || "" }));
      renderOfficers();
      $("officersMessage").textContent = "Susunan pengurus berhasil disimpan.";
      $("officersMessage").classList.add("success");
      showToast("Susunan pengurus berhasil diperbarui.");
    } catch (error) {
      console.error("Menyimpan susunan pengurus:", error);
      $("officersMessage").textContent = `Gagal menyimpan: ${error.message || "Periksa izin database."}`;
      $("officersMessage").classList.remove("success");
    } finally { button.disabled = false; button.textContent = "Simpan Susunan Pengurus"; }
  }

  function officerName(id) {
    return officers.find((item) => item.id === id)?.name?.trim() || "";
  }

  function setProfileMessage(message, success = false) {
    const element = $("profileMessage");
    element.textContent = message;
    element.classList.toggle("success", success);
  }

  function safeFileName(name) {
    return String(name || "logo-masjid").replace(/[^a-z0-9._-]/gi, "_").slice(-90);
  }

  async function saveMosqueProfile(event) {
    event.preventDefault();
    if (!isAdmin) return;

    const file = $("profileLogoFile").files[0] || null;
    const removeLogo = $("removeProfileLogo").checked;
    if (file) {
      const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
      if (!allowedTypes.includes(file.type)) {
        setProfileMessage("Gunakan file PNG, JPG, atau WebP.");
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        setProfileMessage("Ukuran foto maksimal 2 MB.");
        return;
      }
    }

    const name = $("profileName").value.trim();
    if (!name) {
      setProfileMessage("Nama masjid wajib diisi.");
      return;
    }

    const saveButton = $("saveProfileBtn");
    saveButton.disabled = true;
    saveButton.textContent = "Menyimpan...";
    setProfileMessage("");

    const previousLogoPath = mosqueProfile.logo_path;
    let nextLogoPath = mosqueProfile.logo_path;
    let nextLogoUrl = mosqueProfile.logo_url;
    let uploadedPath = null;

    try {
      if (file) {
        const uniqueName = `${Date.now()}-${safeFileName(file.name)}`;
        uploadedPath = `logo/${uniqueName}`;
        const { error: uploadError } = await client.storage
          .from(PROFILE_BUCKET)
          .upload(uploadedPath, file, {
            cacheControl: "3600",
            contentType: file.type,
            upsert: false
          });
        if (uploadError) throw uploadError;
        nextLogoPath = uploadedPath;
        nextLogoUrl = client.storage.from(PROFILE_BUCKET).getPublicUrl(uploadedPath).data.publicUrl;
      } else if (removeLogo) {
        nextLogoPath = null;
        nextLogoUrl = null;
      }

      const payload = {
        id: 1,
        name,
        address: $("profileAddress").value.trim(),
        village: $("profileVillage").value.trim(),
        district: $("profileDistrict").value.trim(),
        regency: $("profileRegency").value.trim(),
        phone: $("profilePhone").value.trim(),
        email: $("profileEmail").value.trim(),
        description: $("profileDescription").value.trim(),
        logo_url: nextLogoUrl,
        logo_path: nextLogoPath,
        updated_by: currentUser.id
      };

      const { error: saveError } = await client
        .from("mosque_profile")
        .upsert(payload, { onConflict: "id" });
      if (saveError) throw saveError;

      if (previousLogoPath && previousLogoPath !== nextLogoPath) {
        const { error: removeError } = await client.storage
          .from(PROFILE_BUCKET)
          .remove([previousLogoPath]);
        if (removeError) console.warn("Logo lama tidak terhapus:", removeError);
      }

      mosqueProfile = { ...mosqueProfile, ...payload };
      renderMosqueProfile();
      setProfileMessage("Profil masjid berhasil diperbarui.", true);
      showToast("Profil masjid berhasil diperbarui.");
    } catch (error) {
      console.error("Menyimpan profil masjid:", error);
      if (uploadedPath) await client.storage.from(PROFILE_BUCKET).remove([uploadedPath]);
      setProfileMessage(`Gagal menyimpan profil: ${error.message || "Periksa koneksi dan izin Supabase."}`);
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "Simpan Profil Masjid";
    }
  }

  function loadImageAsPngDataUrl(url, maxDimension = 600) {
    if (!url) return Promise.resolve(null);
    return new Promise((resolve) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const context = canvas.getContext("2d");
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/png"));
        } catch (error) {
          console.warn("Logo tidak dapat dimasukkan ke PDF:", error);
          resolve(null);
        }
      };
      image.onerror = () => resolve(null);
      image.src = url;
    });
  }

  function setCategoryMessage(message, success = false) {
    const el = $("categoryMessage");
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("success", success);
  }

  function categoriesFor(type) {
    return transactionCategories[type] || defaultCategories[type] || [];
  }

  function renderCategoryOptions(selected = "") {
    const type = $("transactionType").value || "MASUK";
    const categories = [...categoriesFor(type)];
    if (selected && !categories.includes(selected)) categories.unshift(selected);
    $("transactionCategory").innerHTML = categories.length
      ? categories.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")
      : '<option value="">Belum ada kategori — tambahkan melalui Kelola Kategori</option>';
    if (selected) $("transactionCategory").value = selected;
  }

  function renderCategoryLists() {
    const render = (type, targetId) => {
      const target = $(targetId);
      const names = categoriesFor(type);
      target.innerHTML = names.length ? names.map((name) => `
        <div class="category-item"><span>${escapeHtml(name)}</span>
          <button type="button" class="mini-btn delete" data-category-type="${type}" data-category-name="${escapeHtml(name)}" aria-label="Hapus kategori ${escapeHtml(name)}">Hapus</button>
        </div>`).join("") : '<p class="help-text">Belum ada kategori.</p>';
    };
    render("MASUK", "incomeCategoryList");
    render("KELUAR", "expenseCategoryList");
  }

  async function loadCategories() {
    if (!client) return;
    const { data, error } = await client.from("transaction_categories")
      .select("id, category_type, name").order("name", { ascending: true });
    if (error) {
      console.error("Memuat kategori:", error);
      transactionCategories = { MASUK: [...defaultCategories.MASUK], KELUAR: [...defaultCategories.KELUAR] };
      setCategoryMessage("Tabel kategori belum tersedia. Jalankan supabase-migration-kategori-transaksi.sql di Supabase.");
    } else {
      transactionCategories = { MASUK: [], KELUAR: [] };
      (data || []).forEach((row) => {
        const type = row.category_type === "in" ? "MASUK" : row.category_type === "out" ? "KELUAR" : "";
        if (type) transactionCategories[type].push(row.name);
      });
    }
    renderCategoryOptions($("transactionCategory").value);
    renderCategoryLists();
  }

  async function addCategory(event) {
    event.preventDefault();
    if (!isAdmin) return;
    const type = $("categoryType").value;
    const name = $("newCategoryName").value.trim();
    if (!name) return;
    if (categoriesFor(type).some((item) => item.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setCategoryMessage("Kategori tersebut sudah ada.");
      return;
    }
    const { error } = await client.from("transaction_categories").insert({
      category_type: type === "MASUK" ? "in" : "out", name
    });
    if (error) {
      setCategoryMessage(`Gagal menambahkan kategori: ${error.message}`);
      return;
    }
    $("newCategoryName").value = "";
    await loadCategories();
    renderCategoryOptions();
    setCategoryMessage("Kategori berhasil ditambahkan.", true);
  }

  async function deleteCategory(type, name) {
    if (!isAdmin || !window.confirm(`Hapus kategori "${name}" dari daftar ${type === "MASUK" ? "pemasukan" : "pengeluaran"}? Transaksi lama tetap tersimpan.`)) return;
    const { error } = await client.from("transaction_categories").delete()
      .eq("category_type", type === "MASUK" ? "in" : "out").eq("name", name);
    if (error) {
      setCategoryMessage(`Gagal menghapus kategori: ${error.message}`);
      return;
    }
    await loadCategories();
    renderCategoryOptions();
    setCategoryMessage("Kategori berhasil dihapus. Riwayat transaksi lama tidak berubah.", true);
  }

  async function loadTransactions() {
    if (!client) return;
    reportDataReady = false;
    setConnection("Memuat data...", "wait");
    const columns = "id, date, description, category, kind, amount, created_at";
    const query = async (fields) => {
      const rows = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await client.from("transactions").select(fields)
          .order("date", { ascending: false })
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(offset, offset + 499);
        if (error) return { error };
        rows.push(...data);
        if (data.length < 500) return { data: rows };
      }
    };
    let result = await query(columns + ", fund");
    const missingFund = ["42703", "PGRST204"].includes(result.error?.code);
    if (missingFund) result = await query(columns);
    const { data, error } = result;
    fundsReady = !error && !missingFund;
    $("transactionFund").disabled = !fundsReady;
    $("fundStatus").hidden = fundsReady;
    $("fundStatus").textContent = error ? "Data kas gagal dimuat." : "Kas Pembangunan dan Kas PHBI menunggu migrasi Supabase.";
    if (error) renderFundCards();

    if (error) {
      console.error(error);
      setConnection("Database bermasalah", "error");
      $("transactionTableBody").innerHTML =
        `<tr><td colspan="${isAdmin ? 6 : 5}" class="empty-state">Data belum dapat dimuat. Periksa konfigurasi Supabase dan kebijakan RLS.</td></tr>`;
      showToast("Gagal mengambil data transaksi dari Supabase.");
      return;
    }

    let receiptNames = new Map();
    if (isAdmin && data?.length) {
      const { data: receiptRows, error: receiptError } = await client
        .from("transaction_receipt_details")
        .select("transaction_id, party_name")
        .limit(5000);
      if (receiptError) {
        console.error("Data nama kwitansi:", receiptError);
        showToast(["42P01", "PGRST205"].includes(receiptError.code)
          ? "Fitur kwitansi belum aktif. Jalankan supabase-migration-kwitansi.sql di Supabase."
          : "Nama penyetor/penerima belum dapat dimuat. Periksa migrasi dan hak akses Supabase.");
      } else {
        receiptNames = new Map((receiptRows || []).map((row) => [row.transaction_id, row.party_name]));
      }
    }

    transactions = (data || []).map((row) => ({
      ...row,
      // Nama pihak kwitansi hanya diambil untuk pengurus dari tabel privat terpisah.
      party_name: receiptNames.get(row.id) || "",
      // Normalisasi skema Supabase yang sudah ada ke format internal aplikasi.
      fund: row.fund || "DKM",
      transaction_date: row.date,
      type: kindToType(row.kind)
    }));
    reportDataReady = true;
    setConnection("Database online", "online");
    populateMonthFilter();
    renderAll();
  }

  function populateMonthFilter() {
    const select = $("monthFilter");
    const current = select.value || "all";
    const months = [...new Set(transactions.map((item) => String(item.transaction_date || "").slice(0, 7)).filter(Boolean))].sort().reverse();
    select.innerHTML = `<option value="all">Semua periode</option>` +
      months.map((month) => {
        const [year, number] = month.split("-");
        const label = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" })
          .format(new Date(Number(year), Number(number) - 1, 1));
        return `<option value="${month}">${escapeHtml(label)}</option>`;
      }).join("");
    select.value = months.includes(current) || current === "all" ? current : "all";
  }

  function getFilteredTransactions() {
    const fund = $("fundFilter").value;
    const month = $("monthFilter").value;
    const type = $("typeFilter").value;
    const search = $("searchInput").value.trim().toLowerCase();

    return transactions.filter((item) => {
      const monthMatch = month === "all" || String(item.transaction_date).startsWith(month);
      const typeMatch = type === "all" || item.type === type;
      const searchMatch = !search ||
        String(item.description || "").toLowerCase().includes(search) ||
        String(item.category || "").toLowerCase().includes(search);
      return (fund === "all" || item.fund === fund) && monthMatch && typeMatch && searchMatch;
    });
  }

  function calculate(items) {
    const income = items.filter((x) => x.type === "MASUK").reduce((sum, x) => sum + Number(x.amount || 0), 0);
    const expense = items.filter((x) => x.type === "KELUAR").reduce((sum, x) => sum + Number(x.amount || 0), 0);
    return { income, expense, balance: income - expense };
  }

  function renderFundCards(dkmAvailable = false) {
    for (const id of ["DKM", "PEMBANGUNAN", "PHBI"]) {
      const available = fundsReady || (id === "DKM" && dkmAvailable);
      const totals = calculate(transactions.filter((item) => item.fund === id));
      $(id + "Income").textContent = available ? rupiah(totals.income) : "—";
      $(id + "Expense").textContent = available ? rupiah(totals.expense) : "—";
      $(id + "Balance").textContent = available ? rupiah(totals.balance) : "—";
    }
  }

  function renderTable() {
    const items = getFilteredTransactions();
    const summary = calculate(items);
    const colspan = isAdmin ? 6 : 5;

    $("recordCount").textContent = `${items.length} transaksi`;
    $("periodSummary").textContent =
      `Periode terpilih — Masuk: ${rupiah(summary.income)} · Keluar: ${rupiah(summary.expense)} · Selisih: ${rupiah(summary.balance)}`;

    if (!items.length) {
      $("transactionTableBody").innerHTML =
        `<tr><td colspan="${colspan}" class="empty-state">Belum ada transaksi untuk filter yang dipilih.</td></tr>`;
      return;
    }

    $("transactionTableBody").innerHTML = items.map((item) => {
      const incoming = item.type === "MASUK";
      const knownType = item.type === "MASUK" || item.type === "KELUAR";
      const typeLabel = item.type === "MASUK" ? "Pemasukan" :
        item.type === "KELUAR" ? "Pengeluaran" : `Jenis tidak dikenal (${escapeHtml(item.kind)})`;
      const action = isAdmin ? `
        <td class="action-col">
          <div class="row-actions">
            <button class="mini-btn receipt" type="button" data-receipt="${escapeHtml(item.id)}">Kwitansi</button>
            <button class="mini-btn" type="button" data-edit="${escapeHtml(item.id)}">Edit</button>
            <button class="mini-btn delete" type="button" data-delete="${escapeHtml(item.id)}">Hapus</button>
          </div>
        </td>` : "";

      return `<tr>
        <td>${escapeHtml(formatDate(item.transaction_date))}</td>
        <td>${escapeHtml(item.category)}</td>
        <td>${escapeHtml(item.description)}</td>
        <td><span class="type-tag ${incoming ? "tag-in" : "tag-out"}">${typeLabel}</span></td>
        <td class="number ${incoming ? "amount-in" : "amount-out"}">${incoming ? "+" : "−"} ${escapeHtml(rupiah(item.amount))}</td>
        ${action}
      </tr>`;
    }).join("");
  }

  function renderAll() {
    renderFundCards(true);
    renderTable();
  }

  function resetTransactionForm() {
    $("transactionForm").reset();
    $("transactionId").value = "";
    $("transactionDate").value = new Date().toISOString().slice(0, 10);
    $("transactionType").value = "MASUK";
    renderCategoryOptions();
    $("transactionPartyName").value = "";
    updatePartyNameLabel();
    $("formTitle").textContent = "Tambah Transaksi";
    $("saveTransactionBtn").textContent = "Simpan Transaksi";
    $("cancelEditBtn").classList.add("hidden");
    setFormMessage("");
    $("transactionForm").classList.add("hidden");
  }

  function openTransactionForm(type) {
    const fund = Object.keys(fundNames).find((key) => key === $("fundFilter").value) || "DKM";
    resetTransactionForm();
    $("transactionFund").value = fund;
    $("transactionType").value = type;
    renderCategoryOptions();
    updatePartyNameLabel();
    $("formTitle").textContent = (type === "MASUK" ? "Tambah Pemasukan " : "Tambah Pengeluaran ") + fundNames[fund];
    $("saveTransactionBtn").textContent = type === "MASUK" ? "Simpan Pemasukan" : "Simpan Pengeluaran";
    $("transactionForm").classList.remove("hidden");
    $("transactionForm").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function beginEdit(id) {
    const item = transactions.find((row) => row.id === id);
    if (!item) return;
    $("transactionId").value = item.id;
    $("transactionDate").value = item.transaction_date;
    $("transactionType").value = item.type === "KELUAR" ? "KELUAR" : "MASUK";
    renderCategoryOptions(item.category);
    $("transactionCategory").value = item.category;
    $("transactionFund").value = item.fund;
    $("transactionAmount").value = item.amount;
    $("transactionDescription").value = item.description;
    $("transactionPartyName").value = item.party_name || "";
    updatePartyNameLabel();
    $("formTitle").textContent = "Edit Transaksi " + fundNames[item.fund];
    $("saveTransactionBtn").textContent = "Simpan Perubahan";
    $("transactionForm").classList.remove("hidden");
    $("cancelEditBtn").classList.remove("hidden");
    $("adminPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveTransaction(event) {
    event.preventDefault();
    if (!isAdmin) return;

    const id = $("transactionId").value;
    const payload = {
      date: $("transactionDate").value,
      kind: typeToKind($("transactionType").value),
      category: $("transactionCategory").value,
      amount: Number($("transactionAmount").value),
      description: $("transactionDescription").value.trim()
    };
    if (fundsReady) payload.fund = $("transactionFund").value;
    const partyName = $("transactionPartyName").value.trim();

    if (!payload.date || !payload.description || !payload.category || !partyName || !Number.isFinite(payload.amount) || payload.amount <= 0) {
      setFormMessage("Lengkapi tanggal, keterangan, nama penyetor/penerima, dan nominal dengan benar.");
      return;
    }

    $("saveTransactionBtn").disabled = true;
    $("saveTransactionBtn").textContent = "Menyimpan...";
    setFormMessage("");

    let result;
    let savedTransactionId = id;
    if (id) {
      result = await client.from("transactions").update(payload).eq("id", id);
    } else {
      result = await client.from("transactions").insert(payload).select("id").single();
      if (!result.error) savedTransactionId = result.data.id;
    }

    if (result.error) {
      console.error(result.error);
      $("saveTransactionBtn").disabled = false;
      $("saveTransactionBtn").textContent = id ? "Simpan Perubahan" : "Simpan Transaksi";
      setFormMessage(`Gagal menyimpan: ${result.error.message}`);
      return;
    }

    const { error: receiptError } = await client
      .from("transaction_receipt_details")
      .upsert({ transaction_id: savedTransactionId, party_name: partyName }, { onConflict: "transaction_id" });

    $("saveTransactionBtn").disabled = false;
    $("saveTransactionBtn").textContent = id ? "Simpan Perubahan" : "Simpan Transaksi";

    if (receiptError) {
      console.error("Gagal menyimpan nama kwitansi:", receiptError);
      // Jika transaksi baru gagal memiliki detail kwitansi, batalkan insert agar data tidak setengah tersimpan.
      if (!id && savedTransactionId) {
        await client.from("transactions").delete().eq("id", savedTransactionId);
      }
      setFormMessage(["42P01", "PGRST205"].includes(receiptError.code)
        ? "Fitur kwitansi belum aktif. Jalankan supabase-migration-kwitansi.sql di Supabase."
        : `Gagal menyimpan nama penyetor/penerima: ${receiptError.message}`);
      return;
    }

    resetTransactionForm();
    await loadTransactions();
    showToast(id ? "Transaksi berhasil diperbarui." : "Transaksi berhasil ditambahkan.");
  }

  async function deleteTransaction(id) {
    if (!isAdmin || !confirm("Hapus transaksi ini? Tindakan ini tidak dapat dibatalkan.")) return;
    const { error } = await client.from("transactions").delete().eq("id", id);
    if (error) {
      console.error(error);
      showToast(`Gagal menghapus transaksi: ${error.message}`);
      return;
    }
    await loadTransactions();
    showToast("Transaksi berhasil dihapus.");
  }

  function terbilangAngka(value) {
    const n = Math.floor(Math.abs(Number(value) || 0));
    const satuan = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan"];
    if (n === 0) return "nol";
    if (n < 10) return satuan[n];
    if (n === 10) return "sepuluh";
    if (n === 11) return "sebelas";
    if (n < 20) return `${terbilangAngka(n - 10)} belas`;
    if (n < 100) return `${terbilangAngka(Math.floor(n / 10))} puluh${n % 10 ? ` ${terbilangAngka(n % 10)}` : ""}`;
    if (n < 200) return `seratus${n - 100 ? ` ${terbilangAngka(n - 100)}` : ""}`;
    if (n < 1000) return `${terbilangAngka(Math.floor(n / 100))} ratus${n % 100 ? ` ${terbilangAngka(n % 100)}` : ""}`;
    if (n < 2000) return `seribu${n - 1000 ? ` ${terbilangAngka(n - 1000)}` : ""}`;
    if (n < 1000000) return `${terbilangAngka(Math.floor(n / 1000))} ribu${n % 1000 ? ` ${terbilangAngka(n % 1000)}` : ""}`;
    if (n < 1000000000) return `${terbilangAngka(Math.floor(n / 1000000))} juta${n % 1000000 ? ` ${terbilangAngka(n % 1000000)}` : ""}`;
    if (n < 1000000000000) return `${terbilangAngka(Math.floor(n / 1000000000))} miliar${n % 1000000000 ? ` ${terbilangAngka(n % 1000000000)}` : ""}`;
    return `${terbilangAngka(Math.floor(n / 1000000000000))} triliun${n % 1000000000000 ? ` ${terbilangAngka(n % 1000000000000)}` : ""}`;
  }

  function terbilangRupiah(value) {
    return `${terbilangAngka(value)} rupiah`;
  }

  
  async function printReceipt(id) {
      if (!isAdmin) return;
      const item = transactions.find((row) => row.id === id);
      if (!item) {
        showToast("Data transaksi tidak ditemukan.");
        return;
      }
      if (!String(item.party_name || "").trim()) {
        showToast("Nama penyetor/penerima belum diisi. Klik Edit pada transaksi tersebut terlebih dahulu.");
        return;
      }
      if (!window.jspdf || !window.jspdf.jsPDF) {
        showToast("Library PDF belum termuat. Periksa koneksi internet lalu coba lagi.");
        return;
      }

      const { jsPDF } = window.jspdf;
      // Format landscape khusus agar kwitansi tetap lebar dan mudah dibaca.
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [260, 162] });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const incoming = item.type === "MASUK";
      const receiptDate = String(item.transaction_date || "").replace(/-/g, "");
      const idSuffix = String(item.id || "").replace(/-/g, "").slice(-8).toUpperCase();
      const receiptNumber = `KWT-${incoming ? "IN" : "OUT"}-${receiptDate}-${idSuffix}`;
      const partyName = String(item.party_name || "").trim();
      const partyLabel = incoming ? "Telah Diterima Dari" : "Telah Dibayarkan Kepada";
      const partyCaption = incoming ? "Penyetor / Donatur" : "Penerima";
      const amountWords = terbilangRupiah(item.amount);
      const capitalizedWords = amountWords.charAt(0).toUpperCase() + amountWords.slice(1);
      const description = String(item.description || "-").trim();
      const category = String(item.category || "-").trim();
      const villageName = String(mosqueProfile.village || "Kawunganten")
        .replace(/^desa\s+/i, "").trim() || "Kawunganten";
      const receiptPlaceDate = `${villageName}, ${formatDate(item.transaction_date)}`;
      const mosqueName = String(mosqueProfile.name || "Masjid Jami' Al-Ikhlas")
        .replace(/^DKM\s*/i, "").toUpperCase();

      // Helper agar teks panjang mengecil secara proporsional dan tidak menabrak elemen lain.
      const drawFitText = (text, x, y, maxWidth, size, minSize, style = "normal", align = "left", baseline = "alphabetic") => {
        doc.setFont("helvetica", style);
        let fontSize = size;
        doc.setFontSize(fontSize);
        while (fontSize > minSize && doc.getTextWidth(String(text)) > maxWidth) {
          fontSize -= 0.2;
          doc.setFontSize(fontSize);
        }
        const textOptions = { baseline };
        if (align !== "left") textOptions.align = align;
        doc.text(String(text), x, y, textOptions);
      };

      // Bingkai kwitansi dengan warna identitas DKM.
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageWidth, pageHeight, "F");
      doc.setDrawColor(0, 91, 64);
      doc.setLineWidth(1.1);
      doc.rect(4, 4, pageWidth - 8, pageHeight - 8);
      doc.setLineWidth(0.35);
      doc.rect(6.5, 6.5, pageWidth - 13, pageHeight - 13);

      // Logo masjid.
      let logoData = null;
      if (mosqueProfile.logo_url) {
        logoData = await loadImageAsPngDataUrl(mosqueProfile.logo_url, 600);
      }
      if (!logoData) {
        logoData = await loadImageAsPngDataUrl("kwitansi-logo.png", 600);
      }
      if (logoData) {
        doc.addImage(logoData, "PNG", 12, 10.5, 19, 19, undefined, "FAST");
      }

      // Kop identitas masjid: rata kiri, rapat, dan tidak melewati area judul.
      const headerTextX = 37;
      const headerMaxWidth = 137;
      doc.setTextColor(0, 0, 0);
      drawFitText("DEWAN KEMAKMURAN MASJID (DKM)", headerTextX, 15.2, headerMaxWidth, 11.5, 9.5, "bold");
      drawFitText(mosqueName, headerTextX, 22.2, headerMaxWidth, 12.5, 9.2, "bold");
      drawFitText(profileAddressLine(mosqueProfile, " "), headerTextX, 28.1, headerMaxWidth, 8.2, 6.8, "italic");

      // Judul kwitansi membedakan transaksi masuk dan keluar.
      const titleX = 181;
      const titleW = 68;
      doc.setFillColor(0, 91, 34);
      doc.roundedRect(titleX, 9.5, titleW, 12, 1.2, 1.2, "F");
      doc.setTextColor(255, 255, 255);
      drawFitText(
        incoming ? "KWITANSI PEMASUKAN" : "BUKTI PENGELUARAN",
        titleX + titleW / 2, 15.5, titleW - 5, 10.5, 8.2, "bold", "center", "middle"
      );
      doc.setTextColor(65, 75, 82);
      // Nomor kwitansi diposisikan tepat di bawah kotak judul dan rata tengah.
      drawFitText(`No. ${receiptNumber}`, titleX + titleW / 2, 25.5, titleW, 7.8, 6.8, "bold", "center", "middle");

      // Garis kop.
      doc.setDrawColor(0, 91, 64);
      doc.setLineWidth(0.7);
      doc.line(11, 36, pageWidth - 11, 36);

      // Area isi menggunakan kolom label dan nilai yang konsisten.
      const labelX = 12;
      const colonX = 63;
      const valueX = 68;
      const valueRight = pageWidth - 12;
      const valueWidth = valueRight - valueX;

      doc.setTextColor(70, 80, 88);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.2);
      doc.text(partyLabel, labelX, 48.5);
      doc.setTextColor(0, 0, 0);
      doc.text(":", colonX, 48.5);
      drawFitText(partyName, valueX, 48.5, valueWidth, 10.2, 8.2, "bold");
      doc.setDrawColor(190, 202, 196);
      doc.setLineWidth(0.2);
      for (let x = valueX; x < valueRight; x += 2.3) {
        doc.line(x, 53.5, Math.min(x + 0.95, valueRight), 53.5);
      }

      // Terbilang pada bidang hijau dengan ruang yang cukup.
      doc.setTextColor(70, 80, 88);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.2);
      doc.text("Uang Sejumlah", labelX, 64.8);
      doc.setTextColor(0, 0, 0);
      doc.text(":", colonX, 64.8);
      doc.setFillColor(91, 151, 61);
      doc.roundedRect(valueX, 57.5, valueWidth, 14, 1, 1, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      let wordFontSize = 9.2;
      doc.setFontSize(wordFontSize);
      let wordLines = doc.splitTextToSize(capitalizedWords, valueWidth - 8);
      while (wordLines.length > 2 && wordFontSize > 7.4) {
        wordFontSize -= 0.2;
        doc.setFontSize(wordFontSize);
        wordLines = doc.splitTextToSize(capitalizedWords, valueWidth - 8);
      }
      doc.text(wordLines.slice(0, 2), valueX + 4, wordLines.length > 1 ? 62.5 : 66.2, {
        maxWidth: valueWidth - 8
      });

      // Keterangan pembayaran dan kategori.
      doc.setTextColor(70, 80, 88);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.2);
      doc.text("Untuk Pembayaran", labelX, 82);
      doc.setTextColor(0, 0, 0);
      doc.text(":", colonX, 82);
      drawFitText(description, valueX, 82, valueWidth, 9.8, 8, "normal");
      doc.setDrawColor(190, 202, 196);
      doc.setLineWidth(0.2);
      for (let x = valueX; x < valueRight; x += 2.3) {
        doc.line(x, 86.5, Math.min(x + 0.95, valueRight), 86.5);
      }

      doc.setTextColor(70, 80, 88);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.2);
      doc.text("Pos / Kategori Kas", labelX, 97);
      doc.setTextColor(0, 0, 0);
      doc.text(":", colonX, 97);
      drawFitText(category, valueX, 97, valueWidth, 9.8, 8, "normal");

      doc.setDrawColor(0, 91, 64);
      doc.setLineWidth(0.45);
      doc.line(11, 106, pageWidth - 11, 106);

      // Nominal transaksi dibuat paling menonjol di bagian bawah kiri.
      doc.setTextColor(70, 80, 88);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.2);
      doc.text("JUMLAH NOMINAL", 12, 114);
      doc.setFillColor(0, 91, 34);
      doc.setDrawColor(220, 174, 28);
      doc.setLineWidth(0.75);
      doc.roundedRect(11, 116, 86, 19, 1, 1, "FD");
      doc.setTextColor(255, 255, 255);
      drawFitText(rupiah(item.amount), 54, 128.3, 78, 15, 11, "bold", "center");
      doc.setTextColor(0, 91, 64);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.2);
      doc.text("Bukti transaksi tercatat", 12, 141);

      // Tanda tangan penyetor/penerima dan bendahara.
      const leftCenter = 151;
      const rightCenter = 218;
      doc.setTextColor(75, 85, 94);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.8);
      doc.text(partyCaption, leftCenter, 114, { align: "center" });
      drawFitText(receiptPlaceDate, rightCenter, 114, 66, 8.8, 7.2, "normal", "center");

      doc.setDrawColor(145, 154, 160);
      doc.setLineWidth(0.3);
      doc.line(leftCenter - 25, 137, leftCenter + 25, 137);
      doc.line(rightCenter - 25, 137, rightCenter + 25, 137);

      doc.setTextColor(32, 42, 50);
      drawFitText(partyName, leftCenter, 143.2, 58, 9, 7, "bold", "center");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("Bendahara DKM", rightCenter, 143.2, { align: "center" });
      if (officerName("bendahara")) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        drawFitText(officerName("bendahara"), rightCenter, 148, 58, 7.5, 6.5, "normal", "center");
      }
      doc.setTextColor(115, 125, 133);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      if (!officerName("bendahara")) doc.text("Pengurus DKM", rightCenter, 148, { align: "center" });

      // Catatan kaki tetap berada di dalam bingkai.
      doc.setTextColor(145, 154, 160);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.7);
      doc.text("* Kwitansi ini merupakan bukti pencatatan resmi sistem kas DKM Al-Ikhlas", 12, 155);

      const safeName = String(mosqueProfile.name || "Masjid").replace(/[^a-z0-9-]/gi, "_");
      doc.save(`Kwitansi_${incoming ? "Pemasukan" : "Pengeluaran"}_${safeName}_${receiptDate}.pdf`);
    }
  async function exportPdf() {
    const fund = $("fundFilter").value;
    if (!Object.hasOwn(fundNames, fund)) {
      showToast("Pilih Kas DKM, Kas Pembangunan, atau Kas PHBI pada filter Kas.");
      $("fundFilter").focus();
      return;
    }
    if (!reportDataReady || (!fundsReady && fund !== "DKM")) {
      showToast("Data kas belum tersedia untuk mencetak laporan.");
      return;
    }
    const fundName = fundNames[fund];
    const monthValue = $("monthFilter").value;
    if (monthValue === "all") {
      showToast("Pilih satu bulan pada filter Periode sebelum mengunduh laporan bulanan.");
      $("monthFilter").focus();
      return;
    }

    const selectedPrintDate = $("reportPrintDate").value;
    if (!selectedPrintDate) {
      showToast("Pilih tanggal cetak laporan terlebih dahulu.");
      $("reportPrintDate").focus();
      return;
    }

    if (!window.jspdf || !window.jspdf.jsPDF) {
      showToast("Komponen PDF belum termuat. Silakan muat ulang aplikasi.");
      return;
    }

    const [year, month] = monthValue.split("-").map(Number);
    const monthStart = `${monthValue}-01`;
    const monthEndDay = new Date(year, month, 0).getDate();
    const monthEnd = `${monthValue}-${String(monthEndDay).padStart(2, "0")}`;
    const fundItems = transactions.filter((item) => item.fund === fund);
    const monthItems = fundItems.filter((item) => {
      const date = String(item.transaction_date || "");
      return date >= monthStart && date <= monthEnd;
    }).sort((a, b) => {
      const dateOrder = String(a.transaction_date || "").localeCompare(String(b.transaction_date || ""));
      if (dateOrder !== 0) return dateOrder;
      return String(a.created_at || "").localeCompare(String(b.created_at || ""));
    });

    if (typeof window.jspdf.jsPDF !== "function") {
      showToast("Library PDF belum siap. Silakan muat ulang aplikasi.");
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;
    const contentWidth = pageWidth - margin * 2;
    const totals = calculate(monthItems);

    const period = new Intl.DateTimeFormat("id-ID", {
      month: "long", year: "numeric", timeZone: "Asia/Jakarta"
    }).format(new Date(year, month - 1, 1));

    const [printYear, printMonth, printDay] = selectedPrintDate.split("-").map(Number);
    const printDateValue = new Date(Date.UTC(printYear, printMonth - 1, printDay));
    const printDate = new Intl.DateTimeFormat("id-ID", {
      day: "2-digit", month: "long", year: "numeric", timeZone: "UTC"
    }).format(printDateValue);
    const villageName = String(mosqueProfile.village || "Kawunganten")
      .replace(/^desa\s+/i, "")
      .trim() || "Kawunganten";
    const placeAndDate = `${villageName}, ${printDate}`;

    // Kembalikan kop surat resmi DKM (logo, identitas, alamat, dan QR code).
    // File kop.jpeg tersedia di folder utama aplikasi.
    const letterheadData = await loadImageAsPngDataUrl("kop.jpeg", 1800);
    const headerY = 7.5;
    const headerWidth = contentWidth;
    const headerHeight = headerWidth * (350 / 1600);

    if (letterheadData) {
      doc.addImage(
        letterheadData,
        "PNG",
        margin,
        headerY,
        headerWidth,
        headerHeight,
        undefined,
        "FAST"
      );
    } else {
      // Fallback apabila kop.jpeg tidak tersedia saat laporan dicetak.
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("DEWAN KEMAKMURAN MASJID (DKM)", pageWidth / 2, 16, { align: "center" });
      doc.setFontSize(13);
      doc.text("MASJID JAMI' AL-IKHLAS DUSUN POKEK", pageWidth / 2, 23, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text("Dusun Pokek RT 016/004 Desa Kawunganten, Kec. Cikaum - Subang - Jawa Barat 41266", pageWidth / 2, 29, {
        align: "center",
        maxWidth: contentWidth
      });
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.6);
      doc.line(margin, 34, pageWidth - margin, 34);
    }

    const headerBottomY = headerY + headerHeight;

    const mosqueName = String(mosqueProfile.name || "Masjid Jami Al-Ikhlas").trim();
    const mosqueLocation = String(mosqueProfile.address || "Dusun Pokek")
      .replace(/\s+RW\s*\d+.*$/i, "")
      .trim();
    const reportNameLine = `${mosqueName} ${mosqueLocation}`.toUpperCase();

    // Saldo awal hanya memakai transaksi kas yang dipilih sebelum bulan laporan.
    // Filter jenis dan pencarian di halaman tidak mengurangi isi laporan bulanan.
    const openingBalance = fundItems.reduce((balance, item) => {
      if (!item.transaction_date || item.transaction_date >= monthStart) return balance;
      const amount = Number(item.amount || 0);
      if (item.type === "MASUK") return balance + amount;
      if (item.type === "KELUAR") return balance - amount;
      return balance;
    }, 0);

    let runningBalance = openingBalance;
    const formatNumericDate = (value) => {
      const parts = String(value || "").split("-");
      if (parts.length !== 3) return "-";
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    };

    const rows = [[
      1,
      formatNumericDate(monthStart),
      "",
      "Sisa Saldo Bulan Lalu",
      "",
      "",
      rupiah(openingBalance)
    ]];

    monthItems.forEach((item) => {
      const amount = Number(item.amount || 0);
      if (item.type === "MASUK") runningBalance += amount;
      else if (item.type === "KELUAR") runningBalance -= amount;

      rows.push([
        rows.length + 1,
        formatNumericDate(item.transaction_date),
        item.category || "",
        item.description || "",
        item.type === "MASUK" ? rupiah(amount) : "",
        item.type === "KELUAR" ? rupiah(amount) : "",
        rupiah(runningBalance)
      ]);
    });

    const closingBalance = runningBalance;

    // Judul tiga baris ditempatkan tepat di bawah kop surat.
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("LAPORAN " + fundName.toUpperCase(), pageWidth / 2, headerBottomY + 7, { align: "center" });
    doc.text(reportNameLine, pageWidth / 2, headerBottomY + 13.5, {
      align: "center",
      maxWidth: contentWidth
    });
    doc.text(`PERIODE ${period.toUpperCase()}`, pageWidth / 2, headerBottomY + 20, { align: "center" });

    const tableStartY = headerBottomY + 26;
    if (typeof doc.autoTable === "function") {
      doc.autoTable({
        startY: tableStartY,
        margin: { left: margin, right: margin, top: 12, bottom: 18 },
        tableWidth: contentWidth,
        head: [["No.", "Tanggal", "Kategori", "Uraian", "Pemasukan", "Pengeluaran", "Sisa"]],
        body: rows,
        foot: [[
          { content: "Jumlah", colSpan: 4, styles: { halign: "center", fontStyle: "bold" } },
          rupiah(totals.income),
          rupiah(totals.expense),
          rupiah(closingBalance)
        ]],
        showHead: "everyPage",
        showFoot: "lastPage",
        rowPageBreak: "avoid",
        theme: "grid",
        styles: {
          font: "helvetica",
          fontSize: 7.5,
          textColor: [0, 0, 0],
          cellPadding: 1.8,
          lineColor: [0, 0, 0],
          lineWidth: 0.2,
          valign: "middle",
          overflow: "linebreak",
          fillColor: [255, 255, 255]
        },
        headStyles: {
          fillColor: [255, 255, 255],
          textColor: [0, 0, 0],
          fontStyle: "bold",
          fontSize: 8,
          halign: "center",
          lineColor: [0, 0, 0],
          lineWidth: 0.2
        },
        bodyStyles: {
          fillColor: [255, 255, 255],
          textColor: [0, 0, 0],
          lineColor: [0, 0, 0],
          lineWidth: 0.2
        },
        footStyles: {
          fillColor: [255, 255, 255],
          textColor: [0, 0, 0],
          fontStyle: "bold",
          lineColor: [0, 0, 0],
          lineWidth: 0.2
        },
        columnStyles: {
          0: { cellWidth: 8, halign: "center" },
          1: { cellWidth: 23, halign: "center" },
          2: { cellWidth: 26 },
          3: { cellWidth: 58, halign: "left" },
          4: { cellWidth: 26, halign: "right" },
          5: { cellWidth: 26, halign: "right" },
          6: { cellWidth: 23, halign: "right" }
        },
        didParseCell: (data) => {
          if (data.section === "body" && data.row.index === 0 && data.column.index === 3) {
            data.cell.styles.fontStyle = "normal";
          }
        }
      });
    } else {
      showToast("Komponen tabel PDF tidak tersedia. Silakan muat ulang aplikasi.");
      return;
    }

    // Tanda tangan tetap dipertahankan; tanggal cetak berada di atas Pengelola Kas.
    let signY = (doc.lastAutoTable && doc.lastAutoTable.finalY ? doc.lastAutoTable.finalY : tableStartY) + 11;
    const signatureBlockHeight = 47;
    if (signY + signatureBlockHeight > pageHeight - 15) {
      doc.addPage();
      signY = 18;
    }

    const leftCenter = pageWidth * 0.27;
    const rightCenter = pageWidth * 0.73;
    const roleY = signY + 8;

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text("Mengetahui,", leftCenter, roleY, { align: "center" });
    doc.text(placeAndDate, rightCenter, signY, { align: "center", maxWidth: 75 });
    doc.text("Pengelola Kas,", rightCenter, roleY, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Ketua DKM", leftCenter, roleY + 5, { align: "center" });
    doc.text("Bendahara", rightCenter, roleY + 5, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    if (officerName("ketua")) doc.text(officerName("ketua"), leftCenter, roleY + 29, { align: "center", maxWidth: 58 });
    if (officerName("bendahara")) doc.text(officerName("bendahara"), rightCenter, roleY + 29, { align: "center", maxWidth: 58 });

    const signatureLineY = roleY + 34;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
    doc.line(leftCenter - 24, signatureLineY, leftCenter + 24, signatureLineY);
    doc.line(rightCenter - 24, signatureLineY, rightCenter + 24, signatureLineY);

    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.15);
      doc.line(margin, pageHeight - 9, pageWidth - margin, pageHeight - 9);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(0, 0, 0);
      doc.text("DKM Masjid Jami Al-Ikhlas · Laporan " + fundName, margin, pageHeight - 5);
      doc.text(`Halaman ${page} dari ${pageCount}`, pageWidth - margin, pageHeight - 5, { align: "right" });
    }

    const safePeriod = period.replace(/[^a-z0-9-]/gi, "_");
    const safeName = String(mosqueProfile.name || "Masjid").replace(/[^a-z0-9-]/gi, "_");
    doc.save(`Laporan_${fundName.replaceAll(" ", "_")}_${safeName}_${safePeriod}.pdf`);
  }

  async function login(event) {
    event.preventDefault();
    if (!client) return;
    const email = $("loginEmail").value.trim();
    const password = $("loginPassword").value;
    $("loginSubmitBtn").disabled = true;
    $("loginSubmitBtn").textContent = "Memeriksa...";
    setLoginMessage("");

    const { data, error } = await client.auth.signInWithPassword({ email, password });
    $("loginSubmitBtn").disabled = false;
    $("loginSubmitBtn").textContent = "Masuk";

    if (error) {
      setLoginMessage("Login gagal. Periksa email dan password.");
      return;
    }

    await verifyAdmin(data.user);
    if (isAdmin) {
      $("loginDialog").close();
      $("loginForm").reset();
      setLoginMessage("");
      showToast("Login administrator berhasil.");
    } else {
      setLoginMessage("Akun ini belum diberi hak administrator.");
    }
  }

  async function logout() {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) {
      showToast("Gagal keluar dari akun.");
      return;
    }
    await verifyAdmin(null);
    resetTransactionForm();
    renderTable();
    showToast("Anda telah keluar.");
  }


  // Jadwal salat dihitung secara lokal menggunakan koordinat masjid.
  // Tidak menggunakan iframe, API, atau data dari Kementerian Agama.
  const PRAYER_LOCATION = {
    latitude: -6.4838794,
    longitude: 107.7410055,
    timezone: 7,
    timezoneName: "Asia/Jakarta"
  };
  const PRAYER_METHOD = {
    fajrAngle: 20,
    ishaAngle: 18,
    asrShadowFactor: 1,
    dhuhaAltitude: 4.5,
    sunriseSunsetAltitude: -0.833,
    imsakOffset: 10
  };

  function getPrayerDateParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: PRAYER_LOCATION.timezoneName,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return {
      year: Number(values.year),
      month: Number(values.month),
      day: Number(values.day)
    };
  }

  function getPrayerDayOfYear({ year, month, day }) {
    const current = Date.UTC(year, month - 1, day);
    const first = Date.UTC(year, 0, 1);
    return Math.floor((current - first) / 86400000) + 1;
  }

  function getSolarParameters(dateParts) {
    const dayOfYear = getPrayerDayOfYear(dateParts);
    const daysInYear = new Date(Date.UTC(dateParts.year, 1, 29)).getUTCDate() === 29 ? 366 : 365;
    const gamma = (2 * Math.PI / daysInYear) * (dayOfYear - 1);

    const equationOfTime = 229.18 * (
      0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma)
    );

    const declination =
      0.006918 -
      0.399912 * Math.cos(gamma) +
      0.070257 * Math.sin(gamma) -
      0.006758 * Math.cos(2 * gamma) +
      0.000907 * Math.sin(2 * gamma) -
      0.002697 * Math.cos(3 * gamma) +
      0.00148 * Math.sin(3 * gamma);

    const solarNoon = 720 -
      (4 * PRAYER_LOCATION.longitude) -
      equationOfTime +
      (PRAYER_LOCATION.timezone * 60);

    return { declination, solarNoon };
  }

  function getSolarHourAngle(altitudeDegrees, latitudeRadians, declination) {
    const altitude = altitudeDegrees * Math.PI / 180;
    const cosineHourAngle = (
      Math.sin(altitude) -
      Math.sin(latitudeRadians) * Math.sin(declination)
    ) / (
      Math.cos(latitudeRadians) * Math.cos(declination)
    );

    if (cosineHourAngle < -1 || cosineHourAngle > 1) return null;
    return Math.acos(Math.max(-1, Math.min(1, cosineHourAngle))) * 180 / Math.PI;
  }

  function normalizePrayerMinutes(minutes) {
    return ((Math.round(minutes) % 1440) + 1440) % 1440;
  }

  function calculateLocalPrayerTimes(dateParts) {
    const { declination, solarNoon } = getSolarParameters(dateParts);
    const latitude = PRAYER_LOCATION.latitude * Math.PI / 180;
    const latitudeDeclinationDifference = Math.abs(latitude - declination);

    const sunriseAngle = getSolarHourAngle(
      PRAYER_METHOD.sunriseSunsetAltitude, latitude, declination
    );
    const fajrAngle = getSolarHourAngle(
      -PRAYER_METHOD.fajrAngle, latitude, declination
    );
    const ishaAngle = getSolarHourAngle(
      -PRAYER_METHOD.ishaAngle, latitude, declination
    );
    const dhuhaAngle = getSolarHourAngle(
      PRAYER_METHOD.dhuhaAltitude, latitude, declination
    );

    const asrAltitude = Math.atan(
      1 / (PRAYER_METHOD.asrShadowFactor + Math.tan(latitudeDeclinationDifference))
    ) * 180 / Math.PI;
    const asrAngle = getSolarHourAngle(asrAltitude, latitude, declination);

    if ([sunriseAngle, fajrAngle, ishaAngle, dhuhaAngle, asrAngle].some((value) => value === null)) {
      throw new Error("Posisi matahari tidak dapat dihitung untuk tanggal ini.");
    }

    const sunrise = solarNoon - (4 * sunriseAngle);
    const sunset = solarNoon + (4 * sunriseAngle);
    const fajr = solarNoon - (4 * fajrAngle);
    const isha = solarNoon + (4 * ishaAngle);
    const dhuha = solarNoon - (4 * dhuhaAngle);
    const asr = solarNoon + (4 * asrAngle);

    return {
      imsak: normalizePrayerMinutes(fajr - PRAYER_METHOD.imsakOffset),
      subuh: normalizePrayerMinutes(fajr),
      terbit: normalizePrayerMinutes(sunrise),
      duha: normalizePrayerMinutes(dhuha),
      dzuhur: normalizePrayerMinutes(solarNoon + 2),
      ashar: normalizePrayerMinutes(asr),
      maghrib: normalizePrayerMinutes(sunset + 1),
      isya: normalizePrayerMinutes(isha)
    };
  }

  function formatPrayerMinutes(minutes) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  function formatPrayerDate(dateParts) {
    const date = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 12));
    return new Intl.DateTimeFormat("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Jakarta"
    }).format(date);
  }

  function getJakartaClockSeconds() {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: PRAYER_LOCATION.timezoneName,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
    return (values.hour * 3600) + (values.minute * 60) + values.second;
  }

  function getNextPrayerInfo(todayTimes, todayParts, nowSeconds) {
    const mainPrayers = [
      { key: "subuh", name: "Subuh" },
      { key: "dzuhur", name: "Dzuhur" },
      { key: "ashar", name: "Ashar" },
      { key: "maghrib", name: "Maghrib" },
      { key: "isya", name: "Isya" }
    ];

    for (const prayer of mainPrayers) {
      const prayerSeconds = todayTimes[prayer.key] * 60;
      if (prayerSeconds > nowSeconds) {
        return {
          ...prayer,
          minutes: todayTimes[prayer.key],
          secondsRemaining: prayerSeconds - nowSeconds,
          dayLabel: "Hari ini"
        };
      }
    }

    const tomorrowDate = new Date(Date.UTC(
      todayParts.year, todayParts.month - 1, todayParts.day + 1, 12
    ));
    const tomorrowParts = {
      year: tomorrowDate.getUTCFullYear(),
      month: tomorrowDate.getUTCMonth() + 1,
      day: tomorrowDate.getUTCDate()
    };
    const tomorrowTimes = calculateLocalPrayerTimes(tomorrowParts);
    const tomorrowFajr = tomorrowTimes.subuh * 60;

    return {
      key: "subuh",
      name: "Subuh",
      minutes: tomorrowTimes.subuh,
      secondsRemaining: (86400 - nowSeconds) + tomorrowFajr,
      dayLabel: "Besok"
    };
  }

  function formatPrayerCountdown(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  let cachedPrayerDateKey = "";
  let cachedPrayerDateParts = null;
  let cachedPrayerTimes = null;

  function renderLocalPrayerWidget() {
    const grid = $("prayerTimesGrid");
    if (!grid) return;

    try {
      const dateParts = getPrayerDateParts();
      const dateKey = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;

      if (dateKey !== cachedPrayerDateKey || !cachedPrayerTimes) {
        cachedPrayerTimes = calculateLocalPrayerTimes(dateParts);
        cachedPrayerDateParts = dateParts;
        cachedPrayerDateKey = dateKey;

        const prayerItems = [
          ["Imsak", "imsak"],
          ["Subuh", "subuh"],
          ["Terbit", "terbit"],
          ["Duha", "duha"],
          ["Dzuhur", "dzuhur"],
          ["Ashar", "ashar"],
          ["Maghrib", "maghrib"],
          ["Isya", "isya"]
        ];

        $("prayerTodayDate").textContent = formatPrayerDate(dateParts);
        grid.innerHTML = prayerItems.map(([label, key]) => `
          <div class="prayer-time-card" data-prayer-card="${key}">
            <span class="prayer-time-name">${label}</span>
            <strong class="prayer-time-value">${formatPrayerMinutes(cachedPrayerTimes[key])}</strong>
          </div>
        `).join("");
      }

      const nowSeconds = getJakartaClockSeconds();
      const nextPrayer = getNextPrayerInfo(
        cachedPrayerTimes, cachedPrayerDateParts, nowSeconds
      );

      $("prayerNextName").textContent = nextPrayer.name;
      $("prayerNextTime").textContent = formatPrayerMinutes(nextPrayer.minutes);
      $("prayerNextDate").textContent = nextPrayer.dayLabel;
      $("prayerCountdown").textContent =
        `Menuju waktu salat · ${formatPrayerCountdown(nextPrayer.secondsRemaining)}`;

      grid.querySelectorAll("[data-prayer-card]").forEach((card) => {
        card.classList.toggle(
          "is-next",
          nextPrayer.dayLabel === "Hari ini" &&
          card.dataset.prayerCard === nextPrayer.key
        );
      });
    } catch (error) {
      grid.innerHTML = '<div class="prayer-loading">Jadwal salat belum dapat dihitung. Periksa tanggal dan pengaturan waktu perangkat.</div>';
      console.error("Gagal menghitung jadwal salat:", error);
    }
  }

  function initLocalPrayerWidget() {
    renderLocalPrayerWidget();
    window.setInterval(renderLocalPrayerWidget, 1000);
  }

  function renderPage() {
    const requested = window.location.hash.slice(1);
    const fundRoutes = { "kas-dkm": "DKM", "kas-pembangunan": "PEMBANGUNAN", "kas-phbi": "PHBI" };
    const activeFund = fundRoutes[requested];
    const selected = activeFund ? "transaksi" :
      (["dashboard", "jadwal-sholat", "profil"].includes(requested) ? requested : "dashboard");

    if (activeFund) {
      $("fundFilter").value = activeFund;
      if (!$("transactionId").value) $("transactionFund").value = activeFund;
      $("transactionPageTitle").textContent = "Riwayat " + fundNames[activeFund];
      if (!$("transactionId").value) $("transactionForm").classList.add("hidden");
      $("formTitle").textContent = "Tambah Transaksi " + fundNames[activeFund];
      $("exportPdfBtn").textContent = "Unduh PDF " + fundNames[activeFund];
      renderTable();
    }

    document.querySelectorAll("[data-page]").forEach((page) => {
      page.hidden = page.id !== selected;
    });
    document.querySelectorAll(".section-nav a").forEach((link) => {
      if (link.hash === "#" + requested) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  function bindEvents() {
    window.addEventListener("hashchange", renderPage);
    $("loginOpenBtn").addEventListener("click", () => {
      setLoginMessage("");
      $("loginDialog").showModal();
    });
    $("loginCloseBtn").addEventListener("click", () => $("loginDialog").close());
    $("loginForm").addEventListener("submit", login);
    $("logoutBtn").addEventListener("click", logout);
    $("transactionForm").addEventListener("submit", saveTransaction);
    $("addIncomeBtn").addEventListener("click", () => openTransactionForm("MASUK"));
    $("addExpenseBtn").addEventListener("click", () => openTransactionForm("KELUAR"));
    $("transactionType").addEventListener("change", () => {
      updatePartyNameLabel();
      renderCategoryOptions();
    });
    $("categoryForm").addEventListener("submit", addCategory);
    $("incomeCategoryList").addEventListener("click", (event) => {
      const button = event.target.closest("[data-category-name]");
      if (button) deleteCategory(button.dataset.categoryType, button.dataset.categoryName);
    });
    $("expenseCategoryList").addEventListener("click", (event) => {
      const button = event.target.closest("[data-category-name]");
      if (button) deleteCategory(button.dataset.categoryType, button.dataset.categoryName);
    });
    $("profileForm").addEventListener("submit", saveMosqueProfile);
    $("officersForm").addEventListener("submit", saveOfficers);
    $("profileLogoFile").addEventListener("change", () => {
      const file = $("profileLogoFile").files[0];
      $("removeProfileLogo").checked = false;
      if (!file) {
        renderProfileLogoPreview(mosqueProfile.logo_url);
        return;
      }
      const previewUrl = URL.createObjectURL(file);
      renderProfileLogoPreview(previewUrl);
    });
    $("removeProfileLogo").addEventListener("change", (event) => {
      if (event.target.checked) {
        $("profileLogoFile").value = "";
        renderProfileLogoPreview(null);
      } else {
        renderProfileLogoPreview(mosqueProfile.logo_url);
      }
    });
    $("cancelEditBtn").addEventListener("click", resetTransactionForm);
    function updateReportButton() {
      const name = fundNames[$("fundFilter").value];
      $("exportPdfBtn").textContent = name ? "Unduh PDF " + name : "Unduh PDF per Kas";
    }
    $("fundFilter").addEventListener("change", () => {
      updateReportButton();
      renderTable();
    });
    document.querySelectorAll("[data-kas]").forEach((link) => {
      link.addEventListener("click", () => {
        $("fundFilter").value = link.dataset.kas;
        updateReportButton();
        if (!$("transactionId").value) $("transactionFund").value = link.dataset.kas;
        renderTable();
      });
    });
    $("monthFilter").addEventListener("change", renderTable);
    $("typeFilter").addEventListener("change", renderTable);
    $("searchInput").addEventListener("input", renderTable);
    $("exportPdfBtn").addEventListener("click", exportPdf);

    $("transactionTableBody").addEventListener("click", (event) => {
      const editButton = event.target.closest("[data-edit]");
      const deleteButton = event.target.closest("[data-delete]");
      const receiptButton = event.target.closest("[data-receipt]");
      if (editButton) beginEdit(editButton.dataset.edit);
      if (deleteButton) deleteTransaction(deleteButton.dataset.delete);
      if (receiptButton) printReceipt(receiptButton.dataset.receipt);
    });
  }

  async function init() {
    $("currentYear").textContent = new Date().getFullYear();
    $("transactionDate").value = getJakartaDateInputValue();
    $("reportPrintDate").value = getJakartaDateInputValue();
    updatePartyNameLabel();
    bindEvents();
    renderPage();
    renderMosqueProfile();
    initLocalPrayerWidget();

    if (!configured) {
      setConnection("Konfigurasi diperlukan", "error");
      $("fundStatus").textContent = "Konfigurasi Supabase diperlukan.";
      $("transactionTableBody").innerHTML =
        `<tr><td colspan="6" class="empty-state">Isi SUPABASE_URL dan SUPABASE_ANON_KEY pada file config.js untuk menghubungkan database.</td></tr>`;
      return;
    }

    if (!window.supabase || !window.supabase.createClient) {
      setConnection("Library gagal dimuat", "error");
      $("fundStatus").textContent = "Data kas gagal dimuat.";
      showToast("Tidak dapat memuat Supabase. Periksa koneksi internet.");
      return;
    }

    client = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);

    const { data: { session } } = await client.auth.getSession();
    await verifyAdmin(session?.user || null);
    await loadMosqueProfile();
    await loadOfficers();
    await loadCategories();
    await loadTransactions();

    // Jalankan proses lanjutan setelah callback auth selesai agar tidak
    // menahan lock internal Supabase saat melakukan query berikutnya.
    client.auth.onAuthStateChange((_event, sessionData) => {
      window.setTimeout(async () => {
        await verifyAdmin(sessionData?.user || null);
        await loadMosqueProfile();
        await loadOfficers();
        await loadCategories();
        await loadTransactions();
      }, 0);
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
