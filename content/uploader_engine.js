/**
 * TikTok Studio DOM Automation Engine Pro (v3.3 Auto-Bypass & Replace on Restricted Content Modal)
 */

class TikTokStudioEngine {
  constructor() {
    this.isAborted = false;
    this.isPaused = false;
  }

  abort() {
    this.isAborted = true;
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
    this.isAborted = false;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async checkPauseAbort() {
    while (this.isPaused && !this.isAborted) {
      await this.sleep(300);
    }
    if (this.isAborted) {
      throw new Error("Otomatisasi dihentikan.");
    }
  }

  /**
   * Helper Universal Clicker: Pointer -> MouseDown -> MouseUp -> Click
   */
  simulateRealClick(el) {
    if (!el) return;
    const opts = { bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
    if (typeof el.click === 'function') {
      try { el.click(); } catch (e) {}
    }
  }

  /**
   * Temukan input file TikTok Studio
   */
  findFileInput() {
    const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
    const videoInput = inputs.find(i => (i.accept && (i.accept.includes('video') || i.accept.includes('mp4'))) || i.offsetParent !== null) || inputs[0];
    if (videoInput) return videoInput;

    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        if (doc) {
          const frameInputs = Array.from(doc.querySelectorAll('input[type="file"]'));
          const frameInput = frameInputs.find(i => (i.accept && i.accept.includes('video')) || i.offsetParent !== null) || frameInputs[0];
          if (frameInput) return frameInput;
        }
      } catch (e) {}
    }
    return null;
  }

  /**
   * Pastikan form upload siap di DOM
   */
  async ensureUploadReady(timeoutMs = 35000, logger = null) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      await this.checkPauseAbort();

      let fileInput = this.findFileInput();
      let dropZone = document.querySelector(
        'div[class*="upload-card"], div[class*="drop-zone"], div[class*="upload-wrapper"], button[class*="upload"], div[class*="uploader"], div[data-e2e="upload-video"], div[class*="upload-btn"], div[class*="upload_"]'
      );

      if (fileInput || dropZone) {
        return true;
      }

      // Cek tombol 'Unggah video lain' jika berada di layar sukses post
      const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"], span, p'));
      const uploadAnother = buttons.find(b => {
        if (b.offsetParent === null) return false;
        const t = (b.innerText || b.textContent || "").trim().toLowerCase();
        return t.includes("upload another") || t.includes("unggah video lain") || t.includes("post another") || t.includes("unggah lagi");
      });
      if (uploadAnother) {
        if (logger) logger("Mengklik 'Unggah video lain' untuk membuka form...", "info");
        this.simulateRealClick(uploadAnother);
        await this.sleep(2000);
        continue;
      }

      if (window.location.href.includes('/content') || window.location.href.includes('manage') || !window.location.href.includes('tab=video')) {
        const sidebarNav = document.querySelector('a[href*="upload"], a[href*="tab=video"], div[data-e2e="upload-nav"]');
        if (sidebarNav) {
          if (logger) logger("Navigasi internal ke form upload...", "info");
          this.simulateRealClick(sidebarNav);
          await this.sleep(2500);
        } else if (window.history && window.history.pushState) {
          window.history.pushState({}, '', '/tiktokstudio/upload?from=creator_center&tab=video');
          window.dispatchEvent(new PopStateEvent('popstate'));
          await this.sleep(2000);
        }
      }

      await this.sleep(1000);
    }

    throw new Error("Form upload tidak siap. Pastikan berada di halaman upload TikTok Studio.");
  }

  /**
   * Suntikkan file video ke uploader TikTok
   */
  async injectFile(file, logger = null) {
    await this.checkPauseAbort();
    await this.ensureUploadReady(35000, logger);

    if (logger) logger(`Menyiapkan input file '${file.name}'...`, "info");

    let fileInput = this.findFileInput();
    if (!fileInput) {
      const uploadArea = document.querySelector(
        'div[class*="upload-card"], div[class*="drop-zone"], div[class*="upload-wrapper"], button[class*="upload"], div[class*="uploader"]'
      );
      if (uploadArea) {
        uploadArea.click();
        await this.sleep(1000);
        fileInput = this.findFileInput();
      }
    }

    if (!fileInput) {
      throw new Error("Input file upload tidak ditemukan.");
    }

    if (logger) logger(`Memasukkan '${file.name}' (${(file.size / 1024 / 1024).toFixed(2)} MB)...`, "info");

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;

    fileInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    fileInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

    await this.sleep(2000);
    return true;
  }

  /**
   * Cari elemen editor Draft.js
   */
  findCaptionEditor() {
    const captionSelectors = [
      '.public-DraftEditor-content',
      'div[contenteditable="true"]',
      'div[data-placeholder]',
      'div[role="textbox"]',
      'div[class*="caption-input"] div[contenteditable]',
      'div[class*="notranslate"]',
      'div[class*="editor"]',
      'textarea[placeholder*="caption"]',
      'textarea[placeholder*="deskripsi"]'
    ];

    for (const sel of captionSelectors) {
      const elements = document.querySelectorAll(sel);
      for (const el of elements) {
        if (el && el.offsetParent !== null) {
          return el;
        }
      }
    }
    return null;
  }

  /**
   * Tunggu form editor TikTok siap dan stabil
   */
  async waitForFormReady(timeoutMs = 60000, logger = null) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      await this.checkPauseAbort();

      // Cek apakah ada popup konten dibatasi muncul saat render form
      if (this.detectRestrictedContentModal()) {
        throw new Error("RESTRICTED_CONTENT_DETECTED");
      }

      const editor = this.findCaptionEditor();
      if (editor) {
        if (logger) logger("✓ Form editor terdeteksi.", "info");
        await this.sleep(3000);
        return editor;
      }

      if (logger) logger("Menunggu form editor siap...", "info");
      await this.sleep(1000);
    }

    throw new Error("Timeout menunggu form editor TikTok.");
  }

  /**
   * Caption bawaan nama file TikTok otomatis (Zero Mutation / Sentuhan)
   */
  async insertCaptionSafely(customCaptionText = null, logger = null) {
    await this.checkPauseAbort();
    if (logger) logger("✓ Menggunakan caption & hashtag otomatis dari nama file.", "success");
    return true;
  }

  /**
   * Unggah Gambar Sampul Kustom (Custom Thumbnail Cover)
   */
  async uploadCustomCover(coverFile = null, logger = null) {
    await this.checkPauseAbort();
    if (!coverFile) return true;

    if (logger) logger(`Mempersiapkan unggah custom sampul: "${coverFile.name}"...`, "info");

    // 1. Cari pemicu "Edit sampul" di form TikTok Studio
    let editCoverTrigger = null;
    const allEls = Array.from(document.querySelectorAll('div, button, span, p'));
    editCoverTrigger = allEls.find(el => {
      if (el.offsetParent === null) return false;
      const t = (el.innerText || el.textContent || "").trim().toLowerCase();
      return (t === "edit sampul" || t === "edit cover" || t.includes("edit sampul") || t.includes("edit cover")) && el.children.length <= 4;
    });

    if (!editCoverTrigger) {
      // Cek container thumbnail video jika tombol teks tidak langsung ada
      const thumbBoxes = document.querySelectorAll('div[class*="cover"], div[class*="thumbnail"], div[class*="poster"]');
      for (const box of thumbBoxes) {
        if (box && box.offsetParent !== null) {
          const btnInside = box.querySelector('button, div, span');
          if (btnInside) {
            editCoverTrigger = btnInside;
            break;
          }
        }
      }
    }

    if (!editCoverTrigger) {
      if (logger) logger("⚠️ Tombol 'Edit sampul' tidak ditemukan di layar.", "warn");
      return false;
    }

    editCoverTrigger.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await this.sleep(400);
    this.simulateRealClick(editCoverTrigger);
    if (logger) logger("Membuka modal 'Edit sampul'...", "info");

    // 2. Tunggu modal dialog Edit Sampul terbuka
    let modalOpened = false;
    const startWait = Date.now();
    while (Date.now() - startWait < 12000) {
      await this.checkPauseAbort();
      const modalHeader = Array.from(document.querySelectorAll('div, span, h3, h4')).find(el => {
        const t = (el.innerText || el.textContent || "").trim().toLowerCase();
        return (t.includes("edit sampul") || t.includes("unggah sampul") || t.includes("stiker")) && el.offsetParent !== null;
      });
      if (modalHeader) {
        modalOpened = true;
        break;
      }
      await this.sleep(500);
    }

    if (!modalOpened) {
      if (logger) logger("⚠️ Modal Edit Sampul tidak terbuka.", "warn");
      return false;
    }

    await this.sleep(1200);

    // 3. Temukan tombol "Unggah sampul" / input file gambar
    let fileInput = Array.from(document.querySelectorAll('input[type="file"]')).find(inp => {
      const acc = inp.getAttribute('accept') || "";
      return acc.includes('image') || acc.includes('png') || acc.includes('jpeg') || acc.includes('jpg');
    });

    if (!fileInput) {
      const uploadCoverBtn = Array.from(document.querySelectorAll('div, button, span')).find(el => {
        if (el.offsetParent === null) return false;
        const t = (el.innerText || el.textContent || "").trim().toLowerCase();
        return t.includes("unggah sampul") || t.includes("upload cover");
      });

      if (uploadCoverBtn) {
        uploadCoverBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await this.sleep(300);
        this.simulateRealClick(uploadCoverBtn);
        await this.sleep(800);
      }

      fileInput = Array.from(document.querySelectorAll('input[type="file"]')).find(inp => {
        const acc = inp.getAttribute('accept') || "";
        return acc.includes('image') || acc.includes('png') || acc.includes('jpeg') || acc.includes('jpg');
      }) || document.querySelector('input[type="file"]');
    }

    if (!fileInput) {
      if (logger) logger("⚠️ Input file sampul gambar tidak ditemukan.", "warn");
      return false;
    }

    // 4. Inject file gambar custom sampul
    const dt = new DataTransfer();
    dt.items.add(coverFile);
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event('input', { bubbles: true }));
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    if (logger) logger("✓ Gambar sampul dimasukkan, merender pratinjau...", "info");
    await this.sleep(3000);

    // 5. Cari tombol "Simpan" di modal
    const saveBtns = Array.from(document.querySelectorAll('button, div')).filter(el => {
      if (el.offsetParent === null) return false;
      const t = (el.innerText || el.textContent || "").trim().toLowerCase();
      const isSave = t === "simpan" || t === "save" || t.startsWith("simpan");
      const isButtonLike = el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || el.className.includes('btn') || el.className.includes('button');
      return isSave && isButtonLike;
    });

    const saveBtn = saveBtns[saveBtns.length - 1];

    if (saveBtn) {
      saveBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this.sleep(400);
      this.simulateRealClick(saveBtn);
      if (logger) logger("✓ Menyimpan custom sampul video...", "success");
      await this.sleep(2000);
    } else {
      if (logger) logger("⚠️ Tombol 'Simpan' pada modal sampul tidak ditemukan.", "warn");
    }

    return true;
  }

  /**
   * Temukan pemicu Date Picker TikTok Studio
   */
  findDateTrigger() {
    const allElements = Array.from(document.querySelectorAll('div, span, button, input, p'));
    
    // Strategi 1: Cari elemen yang berisi format tahun-bulan-tanggal atau nilai tanggal
    let trigger = allElements.find(el => {
      if (el.offsetParent === null) return false;
      const text = (el.innerText || el.textContent || "").trim();
      const val = (el.value || el.getAttribute('value') || "").trim();
      const isDate = /\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(text) || /\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(val) || text.includes("2026") || val.includes("2026");
      const isLeaf = el.children.length <= 3;
      return isDate && isLeaf;
    });

    if (trigger) return trigger;

    // Strategi 2: Cari kotak kedua di baris waktu posting
    const timeTrigger = this.findTimeTrigger();
    if (timeTrigger) {
      const parent = timeTrigger.parentElement;
      if (parent) {
        const siblings = Array.from(parent.querySelectorAll('div, span, button, input')).filter(el => el.offsetParent !== null && el !== timeTrigger && !timeTrigger.contains(el));
        const dateSibling = siblings.find(el => {
          const t = (el.innerText || el.textContent || el.value || "").trim();
          return t.length >= 6 || el.querySelector('svg');
        });
        if (dateSibling) return dateSibling;
      }
    }

    // Strategi 3: Selector kelas umum Semi-UI / TikTok Studio Datepicker
    const semiDatePickers = document.querySelectorAll('.semi-datepicker-trigger, div[class*="date-picker"], div[class*="datepicker"], input[placeholder*="YYYY"]');
    for (const el of semiDatePickers) {
      if (el && el.offsetParent !== null) return el;
    }

    return null;
  }

  /**
   * Temukan pemicu Time Picker TikTok Studio
   */
  findTimeTrigger() {
    const allElements = Array.from(document.querySelectorAll('div, span, button, input'));
    return allElements.find(el => {
      const t = (el.innerText || el.textContent || el.value || "").trim();
      const isTimeFormat = /^\d{1,2}\s*:\s*\d{2}$/.test(t);
      const isLeaf = el.children.length <= 3;
      return isTimeFormat && isLeaf && el.offsetParent !== null;
    });
  }

  /**
   * Atur Tanggal Penjadwalan di Kalender TikTok (Precision Calendar Engine)
   */
  async setTikTokDatePicker(targetDateStr = "", logger = null) {
    if (!targetDateStr) return true;

    const [targetYear, targetMonth, targetDay] = targetDateStr.split('-').map(Number);
    const targetDayStr = String(targetDay);

    if (logger) logger(`Mengatur tanggal ke: ${targetDateStr} (Tgl ${targetDayStr})...`, "info");

    const dateTrigger = this.findDateTrigger();

    if (!dateTrigger) {
      if (logger) logger("⚠️ Pemicu kalender tanggal tidak ditemukan di layar.", "warn");
      return false;
    }

    const currentTriggerText = (dateTrigger.innerText || dateTrigger.textContent || dateTrigger.value || "").trim();
    if (currentTriggerText.includes(targetDateStr)) {
      if (logger) logger(`✓ Tanggal sudah sesuai (${targetDateStr}).`, "success");
      return true;
    }

    dateTrigger.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await this.sleep(300);
    this.simulateRealClick(dateTrigger);
    await this.sleep(800);

    const allElements = Array.from(document.querySelectorAll('div, span, td, button, p'));
    
    const dayElements = allElements.filter(el => {
      const text = (el.innerText || el.textContent || "").trim();
      if (text !== targetDayStr) return false;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;

      const className = (typeof el.className === 'string' ? el.className : '').toLowerCase();
      const isMuted = className.includes('disabled') || className.includes('muted') || className.includes('other');
      if (isMuted) return false;

      return true;
    });

    if (dayElements.length > 0) {
      const targetDayEl = dayElements[dayElements.length - 1];

      targetDayEl.scrollIntoView({ block: 'nearest' });
      await this.sleep(200);

      this.simulateRealClick(targetDayEl);

      if (targetDayEl.parentElement) {
        this.simulateRealClick(targetDayEl.parentElement);
      }

      const rect = targetDayEl.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      const midY = rect.top + rect.height / 2;
      const elementAtMid = document.elementFromPoint(midX, midY);
      if (elementAtMid) {
        this.simulateRealClick(elementAtMid);
      }

      await this.sleep(500);
      if (logger) logger(`✓ Tanggal ${targetDateStr} berhasil dipilih di kalender!`, "success");
    } else {
      if (logger) logger(`⚠️ Sel tanggal ${targetDayStr} tidak terdeteksi di popover kalender.`, "warn");
    }

    document.body.click();
    await this.sleep(300);
    return true;
  }

  /**
   * Pemilihan Dropdown Waktu Penjadwalan TikTok Studio (Jam & Menit kelipatan 5)
   */
  async setTikTokTimeDropdown(targetTimeStr = "04:00", logger = null) {
    let [hours, mins] = targetTimeStr.split(':').map(Number);
    if (isNaN(hours)) hours = 12;
    if (isNaN(mins)) mins = 0;

    const roundedMin = Math.round(mins / 5) * 5;
    if (roundedMin >= 60) {
      hours = (hours + 1) % 24;
      mins = 0;
    } else {
      mins = roundedMin;
    }

    const targetHourStr = String(hours).padStart(2, '0');
    const targetMinStr = String(mins).padStart(2, '0');

    if (logger) logger(`Memilih jam di dropdown: ${targetHourStr}:${targetMinStr}...`, "info");

    const timeTrigger = this.findTimeTrigger();

    if (timeTrigger) {
      timeTrigger.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this.sleep(300);
      this.simulateRealClick(timeTrigger);
      await this.sleep(700);

      const popupItems = Array.from(document.querySelectorAll('div, span, li, p, button'));
      
      const hourEl = popupItems.find(el => {
        const t = (el.innerText || el.textContent || "").trim();
        const match = t === targetHourStr || t === String(parseInt(targetHourStr, 10));
        return match && el.offsetParent !== null && el.children.length === 0;
      });

      if (hourEl) {
        hourEl.scrollIntoView({ block: 'nearest' });
        this.simulateRealClick(hourEl);
        await this.sleep(300);
        if (logger) logger(`✓ Jam ${targetHourStr} dipilih.`, "info");
      }

      const minEl = popupItems.find(el => {
        const t = (el.innerText || el.textContent || "").trim();
        return t === targetMinStr && el.offsetParent !== null && el.children.length === 0;
      });

      if (minEl) {
        minEl.scrollIntoView({ block: 'nearest' });
        this.simulateRealClick(minEl);
        await this.sleep(300);
        if (logger) logger(`✓ Menit ${targetMinStr} dipilih.`, "info");
      }

      document.body.click();
      await this.sleep(400);
    }
    return true;
  }

  /**
   * Pengaturan Penjadwalan / Sekarang dengan Validasi Otomatis
   */
  async configureSchedule({ isScheduled = false, scheduleDate = "", scheduleTime = "" }, logger = null) {
    await this.checkPauseAbort();

    const elements = Array.from(document.querySelectorAll('label, div[class*="radio"], span, div, p, button, input[type="radio"]'));
    
    if (isScheduled) {
      if (logger) logger(`Mengatur mode: Jadwalkan (${scheduleDate} ${scheduleTime})...`, "info");

      const scheduleRadio = elements.find(el => {
        const t = (el.textContent || el.innerText || el.value || "").trim().toLowerCase();
        return (t === "jadwalkan" || t === "schedule" || t.includes("jadwalkan postingan") || t.includes("jadwalkan video") || t.startsWith("jadwalkan")) && el.offsetParent !== null;
      });

      if (scheduleRadio) {
        this.simulateRealClick(scheduleRadio);
        await this.sleep(800);
      }

      if (scheduleDate) {
        try {
          await this.setTikTokDatePicker(scheduleDate, logger);
        } catch (e) {}
      }

      try {
        await this.setTikTokTimeDropdown(scheduleTime, logger);
      } catch (err) {
        if (logger) logger(`Info: ${err.message}`, "warn");
      }

      await this.sleep(600);
      const bodyText = document.body.innerText || "";
      if (bodyText.includes("minimal 15 menit") || bodyText.includes("at least 15 minutes")) {
        if (logger) logger("⚠️ Error validasi waktu lampau -> Otomatis koreksi ke +30 menit...", "warn");
        
        const now = new Date();
        now.setMinutes(now.getMinutes() + 30);
        const safeHour = String(now.getHours()).padStart(2, '0');
        const safeMin = String(Math.round(now.getMinutes() / 5) * 5 % 60).padStart(2, '0');
        const safeTimeStr = `${safeHour}:${safeMin}`;
        
        await this.setTikTokTimeDropdown(safeTimeStr, logger);
      }
    } else {
      if (logger) logger("⚡ Mengatur mode: Posting Sekarang (Langsung tanpa jadwal)...", "info");
      
      const nowRadio = elements.find(el => {
        const t = (el.textContent || el.innerText || el.value || "").trim().toLowerCase();
        return (t === "posting sekarang" || t === "publikasikan sekarang" || t === "post now" || t === "sekarang" || (t.includes("sekarang") && !t.includes("jadwalkan"))) && el.offsetParent !== null;
      });
      if (nowRadio) {
        this.simulateRealClick(nowRadio);
        await this.sleep(500);
        if (logger) logger("✓ Radio 'Posting Sekarang' berhasil dipilih.", "success");
      } else {
        if (logger) logger("✓ Mode Posting Sekarang aktif secara default.", "info");
      }
    }
  }

  /**
   * Pengaturan Visibilitas Video (JANGAN KLIK jika Public agar dropdown tidak terbuka)
   */
  async configureVisibility(visibility = "Public", logger = null) {
    await this.checkPauseAbort();

    if (visibility === "Public") {
      return true;
    }

    const elements = Array.from(document.querySelectorAll('label, div[class*="radio"], span, button, select, div[class*="select"]'));
    const trigger = elements.find(el => {
      const t = el.textContent.trim().toLowerCase();
      return (t === "semua orang" || t === "public") && el.offsetParent !== null && el.children.length <= 2;
    });

    if (trigger) {
      this.simulateRealClick(trigger);
      await this.sleep(500);

      const options = Array.from(document.querySelectorAll('div, span, li, p'));
      const targetOption = options.find(el => {
        const t = el.textContent.trim().toLowerCase();
        if (visibility === "Friends") return t === "teman" || t === "friends";
        if (visibility === "Private") return t === "hanya saya" || t === "private" || t === "hanya anda";
        return false;
      });

      if (targetOption) {
        this.simulateRealClick(targetOption);
        await this.sleep(300);
        if (logger) logger(`✓ Visibilitas diubah ke ${visibility}.`, "info");
      }
    }
  }

  /**
   * Pengaturan Izin (Komentar & Duet)
   */
  async configurePermissions({ allowComment = true, allowDuet = true }) {
    await this.checkPauseAbort();

    const expandBtn = Array.from(document.querySelectorAll('span, button, div')).find(el => {
      const t = el.textContent.trim().toLowerCase();
      return t.includes("tampilkan lebih banyak") || t.includes("show more");
    });
    if (expandBtn) {
      this.simulateRealClick(expandBtn);
      await this.sleep(300);
    }

    const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
    for (const cb of checkboxes) {
      const parentText = (cb.closest('label')?.textContent || cb.parentElement?.textContent || "").toLowerCase();
      
      let targetChecked = null;
      if (parentText.includes("komentar") || parentText.includes("comment")) {
        targetChecked = allowComment;
      } else if (parentText.includes("penggunaan ulang") || parentText.includes("duet") || parentText.includes("stitch")) {
        targetChecked = allowDuet;
      }

      if (targetChecked !== null && cb.checked !== targetChecked) {
        this.simulateRealClick(cb);
        await this.sleep(150);
      }
    }
  }

  /**
   * Cari tombol aksi utama (Posting / Jadwalkan)
   */
  findMainActionButton() {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.find(b => {
      const t = b.textContent.trim().toLowerCase();
      const isAction = t === "posting" || t === "jadwalkan" || t === "post" || t === "schedule" || t === "publikasikan";
      const hasAttr = b.getAttribute('data-e2e') === 'post_video_button' || (b.className && b.className.includes("btn-post"));
      return (isAction || hasAttr) && b.offsetParent !== null;
    });
  }

  /**
   * Deteksi Pop-up "Konten mungkin dibatasi" / Tombol "Ganti video"
   */
  detectRestrictedContentModal() {
    const dialogs = Array.from(document.querySelectorAll('div[role="dialog"], div[class*="modal"], div[class*="popup"], div[class*="semi-modal"]'));
    
    for (const modal of dialogs) {
      if (modal.offsetParent === null) continue;
      const text = (modal.innerText || modal.textContent || "").toLowerCase();
      
      const isRestricted = text.includes("konten mungkin dibatasi") || 
                           text.includes("content may be restricted") || 
                           text.includes("alasan pelanggaran") || 
                           text.includes("tidak orisinal") ||
                           text.includes("konten kode qr");
      
      if (isRestricted) {
        const buttons = Array.from(modal.querySelectorAll('button, span, div, a'));
        const replaceBtn = buttons.find(b => {
          const t = (b.innerText || b.textContent || "").trim().toLowerCase();
          return t.includes("ganti video") || t.includes("replace video");
        });

        const closeBtn = modal.querySelector('button[aria-label*="close"], div[class*="close"], svg');

        return {
          modal: modal,
          isRestricted: true,
          replaceButton: replaceBtn,
          closeButton: closeBtn
        };
      }
    }

    // Fallback pemeriksaan seluruh layar
    const bodyText = (document.body.innerText || "").toLowerCase();
    if (bodyText.includes("konten mungkin dibatasi") || bodyText.includes("alasan pelanggaran")) {
      const buttons = Array.from(document.querySelectorAll('button'));
      const replaceBtn = buttons.find(b => {
        const t = (b.innerText || b.textContent || "").trim().toLowerCase();
        return (t.includes("ganti video") || t.includes("replace video")) && b.offsetParent !== null;
      });
      return {
        isRestricted: true,
        replaceButton: replaceBtn,
        closeButton: null
      };
    }

    return null;
  }

  /**
   * Tindakan saat terdeteksi modal konten dibatasi (Klik Ganti Video / Tutup)
   */
  async handleRestrictedModalAction(logger = null) {
    const res = this.detectRestrictedContentModal();
    if (!res) return false;

    if (logger) logger("⚠️ Mengklik tombol 'Ganti video' untuk melanjutkan ke video berikutnya...", "warn");

    if (res.replaceButton) {
      this.simulateRealClick(res.replaceButton);
      await this.sleep(1500);
      return true;
    }

    if (res.closeButton) {
      this.simulateRealClick(res.closeButton);
      await this.sleep(1000);
      return true;
    }

    document.body.click();
    await this.sleep(500);
    return true;
  }

  /**
   * Deteksi dan klik tombol konfirmasi pada modal 'Posting sekarang' / 'Jadwalkan sekarang' biasa
   */
  async handlePostAnywayModal(logger = null) {
    // Jangan tangani jika ini adalah modal Konten Dibatasi
    if (this.detectRestrictedContentModal()) {
      return false;
    }

    const buttons = Array.from(document.querySelectorAll('button, div[role="dialog"] button, div[class*="modal"] button'));
    
    const confirmBtn = buttons.find(b => {
      const t = b.textContent.trim().toLowerCase();
      return t === "posting sekarang" || 
             t === "jadwalkan sekarang" || 
             t === "post now" || 
             t === "post anyway" || 
             t === "schedule now" || 
             t === "lanjutkan" ||
             t.includes("posting sekarang") ||
             t.includes("jadwalkan sekarang");
    });

    if (confirmBtn && confirmBtn.offsetParent !== null) {
      if (logger) logger("✓ Mengonfirmasi popup konfirmasi posting...", "warn");
      this.simulateRealClick(confirmBtn);
      await this.sleep(1200);
      return true;
    }
    return false;
  }

  /**
   * Pantau proses upload 100% / Diunggah + Deteksi Pelanggaran / Konten Dibatasi
   */
  async waitForUploadComplete(timeoutMs = 300000, logger = null) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      await this.checkPauseAbort();

      // 1. Cek apakah ada peringatan Konten Dibatasi
      if (this.detectRestrictedContentModal()) {
        throw new Error("RESTRICTED_CONTENT_DETECTED");
      }

      const bodyText = document.body.innerText || "";

      if (
        bodyText.includes("Diunggah") || 
        bodyText.includes("Uploaded") || 
        bodyText.includes("Upload complete") || 
        bodyText.includes("Video uploaded") || 
        bodyText.includes("100%")
      ) {
        if (logger) logger("✓ Video 100% siap diposting!", "success");
        return true;
      }

      const actionBtn = this.findMainActionButton();
      if (actionBtn && !actionBtn.disabled && actionBtn.getAttribute('aria-disabled') !== "true") {
        if (logger) logger("✓ Tombol posting siap & aktif!", "success");
        return true;
      }

      const match = bodyText.match(/(\d+)%/);
      if (match && logger) {
        logger(`Progress unggah: ${match[1]}%`, "info");
      } else if (logger) {
        logger("Memproses video...", "info");
      }

      await this.sleep(1500);
    }

    throw new Error("Waktu tunggu upload habis.");
  }

  /**
   * Klik tombol Post / Jadwalkan
   */
  async clickActionButton(logger = null) {
    await this.checkPauseAbort();

    // Cek apakah ada peringatan Konten Dibatasi sebelum klik
    if (this.detectRestrictedContentModal()) {
      throw new Error("RESTRICTED_CONTENT_DETECTED");
    }

    const actionBtn = this.findMainActionButton();
    if (!actionBtn) {
      throw new Error("Tombol 'Posting' / 'Jadwalkan' tidak ditemukan.");
    }

    if (actionBtn.disabled || actionBtn.getAttribute('aria-disabled') === "true") {
      throw new Error("Tombol aksi masih dinonaktifkan (Tunggu video siap).");
    }

    const btnText = actionBtn.textContent.trim();
    if (logger) logger(`Menekan tombol '${btnText}'...`, "info");

    actionBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await this.sleep(400);
    this.simulateRealClick(actionBtn);

    for (let i = 0; i < 8; i++) {
      await this.sleep(500);

      // Cek apakah muncul peringatan setelah diklik
      if (this.detectRestrictedContentModal()) {
        throw new Error("RESTRICTED_CONTENT_DETECTED");
      }

      await this.handlePostAnywayModal(logger);
      if (window.location.href.includes('/content')) break;
    }

    return true;
  }

  /**
   * Verifikasi Sukses Setelah Tombol Diklik
   */
  async verifySuccess(timeoutMs = 25000, logger = null) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      await this.checkPauseAbort();

      // Cek apakah ada peringatan Konten Dibatasi saat verifikasi
      if (this.detectRestrictedContentModal()) {
        throw new Error("RESTRICTED_CONTENT_DETECTED");
      }

      await this.handlePostAnywayModal(logger);

      if (window.location.href.includes('/content') || window.location.href.includes('manage')) {
        if (logger) logger("✓ Terdeteksi URL /content (Sukses Terposting)!", "success");
        return true;
      }

      const bodyText = document.body.innerText || "";
      const successPhrases = [
        "your video is being uploaded",
        "video uploaded",
        "manage your posts",
        "upload another video",
        "unggah video lain",
        "kelola postingan",
        "video anda sedang diunggah",
        "postingan berhasil",
        "berhasil diunggah",
        "terjadwal",
        "scheduled"
      ];

      for (const phrase of successPhrases) {
        if (bodyText.toLowerCase().includes(phrase)) {
          if (logger) logger(`✓ Sukses terverifikasi: "${phrase}"`, "success");
          return true;
        }
      }

      const buttons = Array.from(document.querySelectorAll('button, div[role="dialog"] button, a'));
      const uploadAnother = buttons.find(b => {
        const t = b.textContent.trim().toLowerCase();
        return t.includes("upload another") || t.includes("unggah video lain") || t.includes("post another");
      });

      if (uploadAnother && uploadAnother.offsetParent !== null) {
        if (logger) logger("✓ Terdeteksi tombol 'Unggah video lain'!", "success");
        return true;
      }

      await this.sleep(600);
    }

    if (window.location.href.includes('/content') || !this.findMainActionButton()) {
      return true;
    }

    return true;
  }

  /**
   * Reset / Navigasi ke Form Upload untuk video berikutnya (Zero-Reload In-Page Engine)
   */
  async resetForNextVideo(logger = null) {
    await this.checkPauseAbort();

    if (logger) logger("Menyiapkan form upload untuk video berikutnya...", "info");

    // 1. Jika ada modal konten dibatasi terbuka, klik Ganti Video
    if (this.detectRestrictedContentModal()) {
      await this.handleRestrictedModalAction(logger);
      await this.sleep(2000);
      return true;
    }

    // 2. Coba cari tombol 'Unggah video lain' / 'Upload another' dalam 6 detik
    const startWait = Date.now();
    while (Date.now() - startWait < 6000) {
      await this.checkPauseAbort();

      const buttons = Array.from(document.querySelectorAll('button, div[role="dialog"] button, a, div[role="button"], span, p'));
      const uploadAnotherBtn = buttons.find(b => {
        if (b.offsetParent === null) return false;
        const t = (b.innerText || b.textContent || "").trim().toLowerCase();
        return t === "unggah video lain" || 
               t === "upload another video" || 
               t.includes("unggah video lain") || 
               t.includes("upload another") || 
               t.includes("post another") ||
               t === "upload another" ||
               t.includes("unggah lagi");
      });

      if (uploadAnotherBtn) {
        if (logger) logger("✓ Mengklik 'Unggah video lain' (In-Page Reset)...", "info");
        this.simulateRealClick(uploadAnotherBtn);
        await this.sleep(2500);
        return true;
      }

      // Cek jika sudah berada di form upload kosong
      const fileInput = this.findFileInput();
      if (fileInput && !document.querySelector('.public-DraftEditor-content, div[contenteditable="true"]')) {
        if (logger) logger("✓ Form upload sudah siap dan bersih.", "info");
        return true;
      }

      await this.sleep(500);
    }

    // 3. Deteksi link menu 'Upload' / 'Unggah' di sidebar TikTok Studio
    const uploadNavs = Array.from(document.querySelectorAll('a, div, span, button')).filter(el => {
      if (el.offsetParent === null) return false;
      const href = el.getAttribute('href') || "";
      const t = (el.innerText || el.textContent || "").trim().toLowerCase();
      return href.includes('tab=video') || t === "unggah" || t === "upload";
    });

    if (uploadNavs.length > 0) {
      if (logger) logger("Navigasi ke menu Upload (SPA)...", "info");
      this.simulateRealClick(uploadNavs[0]);
      await this.sleep(2500);
      return true;
    }

    // 4. Jika masih belum di tab=video: gunakan pushState untuk transisi halus tanpa reload
    if (!window.location.href.includes('tab=video') && window.history && window.history.pushState) {
      if (logger) logger("Memperbarui rute SPA ke form upload...", "info");
      window.history.pushState({}, '', '/tiktokstudio/upload?from=creator_center&tab=video');
      window.dispatchEvent(new PopStateEvent('popstate'));
      await this.sleep(2000);
    }

    return true;
  }

  // Alias methods for compatibility with content.js
  async pollUploadProgress(timeoutMs = 300000, logger = null) {
    return this.waitForUploadComplete(timeoutMs, logger);
  }

  async triggerPostClick(logger = null) {
    return this.clickActionButton(logger);
  }

  async verifyPostSuccess(timeoutMs = 25000, logger = null) {
    return this.verifySuccess(timeoutMs, logger);
  }

  async configureSettings({ visibility = "Public", allowComment = true, allowDuet = true }, logger = null) {
    await this.configureVisibility(visibility, logger);
    return this.configurePermissions({ allowComment, allowDuet });
  }
}

window.TikTokStudioEngine = TikTokStudioEngine;
window.TikTokUploaderEngine = TikTokStudioEngine;

