/**
 * TikTok Studio Bot - Master Dashboard Logic (v3.9.0)
 * Queue, Multi-Schedule, AI Captions, Full History, Logs, & Reset Tools
 */

// Extension IndexedDB for Queue & Video Storage
class DashVideoDB {
  static open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('TT_Automation_DB', 15);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('queue')) {
          db.createObjectStore('queue', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  static async saveQueue(queue) {
    try {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('queue', 'readwrite');
        const store = tx.objectStore('queue');
        store.clear();
        for (let i = 0; i < queue.length; i++) {
          store.put({
            id: i,
            file: queue[i].file,
            coverFile: queue[i].coverFile || null,
            coverPreviewUrl: queue[i].coverPreviewUrl || '',
            status: queue[i].status || 'waiting',
            scheduledDate: queue[i].scheduledDate || '',
            scheduledTime: queue[i].scheduledTime || '',
            customCaption: queue[i].customCaption || ''
          });
        }
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn("[DashVideoDB] Save error:", e);
    }
  }

  static async loadQueue() {
    try {
      const db = await this.open();
      return new Promise((resolve) => {
        const tx = db.transaction('queue', 'readonly');
        const store = tx.objectStore('queue');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    } catch (e) {
      return [];
    }
  }

  static async clearQueue() {
    try {
      const db = await this.open();
      return new Promise((resolve) => {
        const tx = db.transaction('queue', 'readwrite');
        tx.objectStore('queue').clear();
        tx.oncomplete = () => resolve(true);
      });
    } catch (e) {}
  }
}

// Master Dashboard App
class MasterDashboardApp {
  constructor() {
    this.videoQueue = [];
    this.historyList = [];
    this.systemLogs = [];
    this.apiKeys = [];
    this.logFilter = 'all';
    this.historySearchTerm = '';

    const now = new Date();
    now.setMinutes(now.getMinutes() + 25);
    const roundedMins = Math.ceil(now.getMinutes() / 5) * 5;
    if (roundedMins >= 60) {
      now.setHours(now.getHours() + 1);
      now.setMinutes(0);
    } else {
      now.setMinutes(roundedMins);
    }

    const defaultTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const defaultDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    this.defaultConfig = {
      mode: 'schedule',
      startMode: 'immediate',
      delayMinutes: 60,
      specificStartTime: defaultTime,
      startDate: defaultDate,
      startTime: defaultTime,
      intervalMinutes: 120,
      visibility: 'Public',
      allowComment: true,
      allowDuet: true,
      autoPost: true,
      delayBetween: 6,
      autoCatchup: true,
      aiModel: 'gemini-flash-lite-latest',
      maxHashtags: 5
    };

    this.config = { ...this.defaultConfig };

    this.init();
  }

  async init() {
    this.setupTabs();
    await this.loadConfig();
    await this.loadApiKeys();
    await this.loadQueueFromDB();
    await this.loadHistoryAndLogs();
    this.bindEvents();
    this.render();
    this.setupLiveSyncWatcher();
  }

  setupTabs() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const panes = document.querySelectorAll('.dash-pane');

    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        navButtons.forEach(b => b.classList.remove('active'));
        panes.forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        const tabKey = btn.getAttribute('data-tab');
        const target = document.getElementById(`tab-${tabKey}`);
        if (target) target.classList.add('active');
      });
    });
  }

  async loadConfig() {
    try {
      const stored = await chrome.storage.local.get(['tt_v2_config', 'tt_options_custom']);
      if (stored.tt_v2_config) {
        this.config = { ...this.config, ...stored.tt_v2_config };
      }
      if (stored.tt_options_custom) {
        this.config = { ...this.config, ...stored.tt_options_custom };
      }
    } catch (e) {}
  }

  async loadHistoryAndLogs() {
    try {
      const stored = await chrome.storage.local.get(['tt_upload_history', 'tt_system_logs']);
      if (Array.isArray(stored.tt_upload_history)) {
        this.historyList = stored.tt_upload_history;
      }
      if (Array.isArray(stored.tt_system_logs)) {
        this.systemLogs = stored.tt_system_logs;
      }
    } catch (e) {}
  }

  setupLiveSyncWatcher() {
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.tt_upload_history) {
        this.historyList = changes.tt_upload_history.newValue || [];
        this.renderHistoryTable();
      }
      if (changes.tt_system_logs) {
        this.systemLogs = changes.tt_system_logs.newValue || [];
        this.renderLogs();
      }
    });
  }

  async saveConfig() {
    try {
      await chrome.storage.local.set({
        tt_v2_config: {
          mode: this.config.mode,
          startMode: this.config.startMode,
          delayMinutes: this.config.delayMinutes,
          specificStartTime: this.config.specificStartTime,
          startDate: this.config.startDate,
          startTime: this.config.startTime,
          intervalMinutes: this.config.intervalMinutes,
          visibility: this.config.visibility,
          allowComment: this.config.allowComment,
          allowDuet: this.config.allowDuet,
          autoPost: this.config.autoPost,
          delayBetween: this.config.delayBetween
        },
        tt_options_custom: {
          autoCatchup: this.config.autoCatchup,
          aiModel: this.config.aiModel,
          maxHashtags: this.config.maxHashtags
        },
        tt_queue_metadata: this.videoQueue.map((item, idx) => ({
          id: idx,
          filename: item.file?.name || `video_${idx+1}.mp4`,
          size: item.file?.size || 0,
          coverName: item.coverFile?.name || '',
          hasCover: Boolean(item.coverFile || item.coverPreviewUrl),
          status: item.status || 'waiting',
          scheduledDate: item.scheduledDate || '',
          scheduledTime: item.scheduledTime || '',
          customCaption: item.customCaption || ''
        }))
      });
      await DashVideoDB.saveQueue(this.videoQueue);
      await this.pushQueueToActiveTikTokTabs();
      this.notifySaveStatus("✓ Semua perubahan tersimpan ke Database JSON!");
    } catch (e) {
      console.warn("Save config error:", e);
    }
  }

  async pushQueueToActiveTikTokTabs() {
    try {
      const tabs = await chrome.tabs.query({ url: "*://*.tiktok.com/*" });
      if (tabs.length === 0) return;

      const serializedItems = [];
      for (const it of this.videoQueue) {
        let fileBuffer = null;
        if (it.file && (it.file instanceof Blob || it.file instanceof File)) {
          try {
            fileBuffer = await it.file.arrayBuffer();
          } catch (err) {
            console.warn("ArrayBuffer video error:", err);
          }
        }

        let coverBuffer = null;
        if (it.coverFile && (it.coverFile instanceof Blob || it.coverFile instanceof File)) {
          try {
            coverBuffer = await it.coverFile.arrayBuffer();
          } catch (err) {
            console.warn("ArrayBuffer cover error:", err);
          }
        }

        serializedItems.push({
          name: it.file?.name || 'video.mp4',
          type: it.file?.type || 'video/mp4',
          size: it.file?.size || 0,
          fileBuffer: fileBuffer,
          coverName: it.coverFile?.name || '',
          coverType: it.coverFile?.type || 'image/jpeg',
          coverBuffer: coverBuffer,
          coverPreviewUrl: it.coverPreviewUrl || '',
          status: it.status || 'waiting',
          scheduledDate: it.scheduledDate || '',
          scheduledTime: it.scheduledTime || '',
          customCaption: it.customCaption || ''
        });
      }

      for (const t of tabs) {
        chrome.tabs.sendMessage(t.id, {
          type: "SYNC_QUEUE_FROM_DASHBOARD",
          items: serializedItems
        }).catch(() => {});
      }
    } catch (e) {
      console.warn("pushQueueToActiveTikTokTabs error:", e);
    }
  }

  async loadApiKeys() {
    try {
      const res = await fetch(chrome.runtime.getURL('api_keys.json'));
      const data = await res.json();
      if (data && Array.isArray(data.keys)) {
        this.apiKeys = data.keys;
        const textarea = document.getElementById('dashApiKeysTextarea');
        const countText = document.getElementById('dashApiKeyCountText');
        const navCount = document.getElementById('navAiKeysCount');

        if (textarea) textarea.value = this.apiKeys.join('\n');
        if (countText) countText.textContent = this.apiKeys.length;
        if (navCount) navCount.textContent = `${this.apiKeys.length} Keys Aktif`;
      }
    } catch (e) {}
  }

  async loadQueueFromDB() {
    try {
      const items = await DashVideoDB.loadQueue();
      if (items && items.length > 0) {
        this.videoQueue = items.map(it => ({
          file: it.file,
          coverFile: it.coverFile || null,
          coverPreviewUrl: it.coverPreviewUrl || '',
          status: it.status || 'waiting',
          scheduledDate: it.scheduledDate || '',
          scheduledTime: it.scheduledTime || '',
          customCaption: it.customCaption || ''
        }));
      }
    } catch (e) {}
  }

  notifySaveStatus(msg) {
    const el = document.getElementById('footerStatusText');
    if (el) {
      el.textContent = msg;
      el.style.color = '#059669';
      setTimeout(() => {
        el.textContent = "Semua perubahan otomatis tersimpan ke Database JSON.";
      }, 3000);
    }
  }

  bindEvents() {
    // Cross-origin sync request listener
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === "REQUEST_DASHBOARD_SYNC") {
        this.pushQueueToActiveTikTokTabs();
        sendResponse({ success: true, count: this.videoQueue.length, items: this.videoQueue });
      }
    });

    // Top Launch Buttons
    const launchHandler = async () => {
      await this.saveConfig();
      await this.pushQueueToActiveTikTokTabs();
      await chrome.runtime.sendMessage({ type: "OPEN_TIKTOK_STUDIO" });
      setTimeout(async () => {
        await this.pushQueueToActiveTikTokTabs();
      }, 2500);
    };

    document.getElementById('btnLaunchStudio').addEventListener('click', launchHandler);
    document.getElementById('btnLaunchBottom').addEventListener('click', launchHandler);
    document.getElementById('btnSaveDashboard').addEventListener('click', () => this.saveConfig());

    // Export & Import JSON
    document.getElementById('btnExportJsonTop').addEventListener('click', () => this.exportDatabaseJSON());
    const fileImport = document.getElementById('fileImportJson');
    document.getElementById('btnImportJsonTrigger').addEventListener('click', () => fileImport.click());
    fileImport.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        this.importDatabaseJSON(e.target.files[0]);
      }
    });

    // Batch Cover Upload
    const fileBatchCover = document.getElementById('fileBatchCoverInput');
    const btnBatchCover = document.getElementById('btnBatchCoverTrigger');
    if (btnBatchCover && fileBatchCover) {
      btnBatchCover.addEventListener('click', () => fileBatchCover.click());
      fileBatchCover.addEventListener('change', async (e) => {
        if (e.target.files && e.target.files.length > 0) {
          await this.applyBatchCovers(Array.from(e.target.files));
          fileBatchCover.value = '';
        }
      });
    }

    // File Drop & Input
    const dropZone = document.getElementById('dashDropZone');
    const fileInput = document.getElementById('dashFileInput');

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        this.addFiles(Array.from(e.target.files));
      }
    });

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '#FE2C55';
    });
    dropZone.addEventListener('dragleave', () => dropZone.style.borderColor = '');
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '';
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        this.addFiles(Array.from(e.dataTransfer.files));
      }
    });

    // Stagger Toolbar (Realtime Auto Calculation)
    const inputStartDate = document.getElementById('dashStartDate');
    const inputStartTime = document.getElementById('dashStartTime');
    const selectInterval = document.getElementById('dashIntervalMinutes');

    inputStartDate.value = this.config.startDate || new Date().toISOString().split('T')[0];
    inputStartTime.value = this.config.startTime || "12:00";
    selectInterval.value = String(this.config.intervalMinutes || 120);

    const handleRealtimeStagger = () => {
      this.config.startDate = inputStartDate.value;
      this.config.startTime = inputStartTime.value;
      this.config.intervalMinutes = parseInt(selectInterval.value, 10) || 120;
      
      if (this.config.mode === 'schedule') {
        this.calculateStagger(true);
        this.saveConfig();
        this.renderCards();
      } else {
        this.saveConfig();
      }
    };

    inputStartDate.addEventListener('input', handleRealtimeStagger);
    inputStartDate.addEventListener('change', handleRealtimeStagger);
    inputStartTime.addEventListener('input', handleRealtimeStagger);
    inputStartTime.addEventListener('change', handleRealtimeStagger);
    selectInterval.addEventListener('change', handleRealtimeStagger);

    const triggerStagger = () => {
      this.config.mode = 'schedule';
      updateModeUI();
      this.calculateStagger(true);
      this.saveConfig();
      this.renderCards();
      alert("✓ Jadwal berjenjang berhasil dihitung & diterapkan realtime ke semua video!");
    };

    document.getElementById('btnTriggerStagger').addEventListener('click', triggerStagger);

    // AI Generate All
    document.getElementById('btnAiGenAll').addEventListener('click', async () => {
      if (this.videoQueue.length === 0) return alert("Antrean video masih kosong. Tambahkan video terlebih dahulu.");
      const btn = document.getElementById('btnAiGenAll');
      btn.textContent = "⏳ Memproses AI...";
      btn.disabled = true;

      try {
        for (let i = 0; i < this.videoQueue.length; i++) {
          const item = this.videoQueue[i];
          btn.textContent = `⏳ AI Video [${i + 1}/${this.videoQueue.length}]...`;
          const cap = await this.generateAiCaption(item.file);
          item.customCaption = cap;
          this.renderCards();
        }
        await this.saveConfig();
        alert("✓ Semua video berhasil dibuatkan caption AI (Maks 5 Hashtag)!");
      } catch (err) {
        alert("✕ Error AI: " + err.message);
      } finally {
        btn.textContent = "✨ AI Semua Caption";
        btn.disabled = false;
      }
    });

    // Copy First Caption
    document.getElementById('btnCopyCaptionAll').addEventListener('click', () => {
      if (this.videoQueue.length > 0) {
        const firstCap = this.videoQueue[0].customCaption || "";
        for (let i = 1; i < this.videoQueue.length; i++) {
          this.videoQueue[i].customCaption = firstCap;
        }
        this.saveConfig();
        this.renderCards();
        alert("✓ Caption video #1 disalin ke seluruh antrean!");
      }
    });

    // Mode Publikasi TikTok (Langsung / Jadwal)
    const btnModeNow = document.getElementById('btnModeNow');
    const btnModeSchedule = document.getElementById('btnModeSchedule');
    const boxStaggerToolbar = document.getElementById('boxStaggerToolbar');

    const updateModeUI = () => {
      const isSchedule = this.config.mode === 'schedule';
      btnModeNow.classList.toggle('active', !isSchedule);
      btnModeSchedule.classList.toggle('active', isSchedule);
      if (boxStaggerToolbar) boxStaggerToolbar.style.display = isSchedule ? 'flex' : 'none';

      const modeText = document.getElementById('dashModeIndicatorText');
      if (modeText) {
        modeText.textContent = isSchedule 
          ? '● Mode: Jadwalkan Postingan (Tanggal & Jam)' 
          : '● Mode: Langsung Post (Tanpa Jadwal)';
      }
    };

    btnModeNow.addEventListener('click', () => {
      this.config.mode = 'now';
      // Hapus seluruh data tanggal & jam dari antrean agar tidak ada jadwal tersimpan
      this.videoQueue.forEach(item => {
        item.scheduledDate = '';
        item.scheduledTime = '';
      });
      updateModeUI();
      this.saveConfig();
      this.renderCards();
    });

    btnModeSchedule.addEventListener('click', () => {
      this.config.mode = 'schedule';
      this.calculateStagger(false);
      updateModeUI();
      this.saveConfig();
      this.renderCards();
    });

    updateModeUI();

    // Reset All Status to 'waiting'
    document.getElementById('btnResetAllStatus').addEventListener('click', async () => {
      if (this.videoQueue.length === 0) return alert("Antrean video kosong.");
      if (confirm("Reset status semua video kembali ke 'Menunggu' agar bisa diupload ulang?")) {
        this.videoQueue.forEach(item => {
          item.status = 'waiting';
        });
        await this.saveConfig();
        this.renderCards();
        alert("✓ Status semua video berhasil di-reset ke 'Menunggu'!");
      }
    });

    // Reset All Schedule (Hapus Semua Jadwal)
    document.getElementById('btnResetAllSchedule').addEventListener('click', async () => {
      if (confirm("Hapus semua tanggal dan jam jadwal khusus pada antrean (Ubah ke Langsung Post)?")) {
        this.config.mode = 'now';
        this.videoQueue.forEach(item => {
          item.scheduledDate = '';
          item.scheduledTime = '';
        });
        updateModeUI();
        await this.saveConfig();
        this.renderCards();
        alert("✓ Semua jadwal berhasil di-reset dan dihapus!");
      }
    });

    // Clean Completed / Done Videos
    const btnCleanDone = document.getElementById('btnCleanDoneVideos');
    if (btnCleanDone) {
      btnCleanDone.addEventListener('click', async () => {
        const doneCount = this.videoQueue.filter(v => v.status === 'done').length;
        if (doneCount === 0) return alert("Tidak ada video dengan status 'Selesai' di antrean.");

        if (confirm(`Hapus ${doneCount} video yang sudah selesai terposting dari antrean?`)) {
          this.videoQueue = this.videoQueue.filter(v => v.status !== 'done');
          await this.saveConfig();
          this.renderCards();
          alert(`✓ ${doneCount} video yang telah selesai berhasil dihapus dari antrean!`);
        }
      });
    }

    // Clear All Videos (Total Database Cleanup)
    document.getElementById('btnClearAllQueue').addEventListener('click', async () => {
      if (confirm("Yakin ingin menghapus seluruh antrean video dari database?")) {
        this.videoQueue = [];
        await DashVideoDB.clearQueue();
        await chrome.storage.local.set({
          tt_queue_metadata: [],
          tt_batch_state: { isRunning: false, currentIndex: -1 }
        });
        await this.saveConfig();
        this.renderCards();
        alert("✓ Seluruh antrean video berhasil dikosongkan dan dihapus total!");
      }
    });

    // Cancel Active Start Delay Schedule
    document.getElementById('btnCancelActiveStartSchedule').addEventListener('click', async () => {
      await chrome.storage.local.set({
        tt_delay_state: { isActive: false, targetTimestamp: null }
      });
      chrome.runtime.sendMessage({ type: "CLEAR_START_ALARM" });
      alert("✓ Penjadwalan waktu mulai bot berhasil dibatalkan!");
    });

    // Start Mode Buttons
    const segImm = document.getElementById('segStartImmediate');
    const segDel = document.getElementById('segStartDelay');
    const segSpe = document.getElementById('segStartSpecific');
    const boxDel = document.getElementById('boxStartDelay');
    const boxSpe = document.getElementById('boxStartSpecific');

    segImm.addEventListener('click', () => {
      this.config.startMode = 'immediate';
      segImm.classList.add('active');
      segDel.classList.remove('active');
      segSpe.classList.remove('active');
      boxDel.style.display = 'none';
      boxSpe.style.display = 'none';
      this.saveConfig();
    });

    segDel.addEventListener('click', () => {
      this.config.startMode = 'delay';
      segDel.classList.add('active');
      segImm.classList.remove('active');
      segSpe.classList.remove('active');
      boxDel.style.display = 'flex';
      boxSpe.style.display = 'none';
      this.saveConfig();
    });

    segSpe.addEventListener('click', () => {
      this.config.startMode = 'specific_time';
      segSpe.classList.add('active');
      segImm.classList.remove('active');
      segDel.classList.remove('active');
      boxDel.style.display = 'none';
      boxSpe.style.display = 'flex';
      this.saveConfig();
    });

    const selectDelay = document.getElementById('dashSelectDelayMinutes');
    selectDelay.value = String(this.config.delayMinutes);
    selectDelay.addEventListener('change', (e) => {
      this.config.delayMinutes = parseInt(e.target.value, 10) || 60;
      this.saveConfig();
    });

    const inputSpecific = document.getElementById('dashInputSpecificTime');
    inputSpecific.value = this.config.specificStartTime;
    inputSpecific.addEventListener('change', (e) => {
      this.config.specificStartTime = e.target.value;
      this.saveConfig();
    });

    // General Form Toggles
    const toggleCatchup = document.getElementById('dashToggleCatchup');
    toggleCatchup.checked = this.config.autoCatchup !== false;
    toggleCatchup.addEventListener('change', (e) => {
      this.config.autoCatchup = e.target.checked;
      this.saveConfig();
    });

    const selectVisibility = document.getElementById('dashVisibility');
    selectVisibility.value = this.config.visibility || 'Public';
    selectVisibility.addEventListener('change', (e) => {
      this.config.visibility = e.target.value;
      this.saveConfig();
    });

    const inputDelayBetween = document.getElementById('dashDelayBetween');
    inputDelayBetween.value = this.config.delayBetween || 6;
    inputDelayBetween.addEventListener('change', (e) => {
      this.config.delayBetween = parseInt(e.target.value, 10) || 6;
      this.saveConfig();
    });

    const toggleAutoPost = document.getElementById('dashToggleAutoPost');
    toggleAutoPost.checked = this.config.autoPost !== false;
    toggleAutoPost.addEventListener('change', (e) => {
      this.config.autoPost = e.target.checked;
      this.saveConfig();
    });

    const toggleComment = document.getElementById('dashToggleComment');
    toggleComment.checked = this.config.allowComment !== false;
    toggleComment.addEventListener('change', (e) => {
      this.config.allowComment = e.target.checked;
      this.saveConfig();
    });

    const toggleDuet = document.getElementById('dashToggleDuet');
    toggleDuet.checked = this.config.allowDuet !== false;
    toggleDuet.addEventListener('change', (e) => {
      this.config.allowDuet = e.target.checked;
      this.saveConfig();
    });

    // Factory Reset Config
    document.getElementById('btnFactoryResetConfig').addEventListener('click', async () => {
      if (confirm("Reset seluruh pengaturan ke konfigurasi awal (Default)?")) {
        this.config = { ...this.defaultConfig };
        await this.saveConfig();
        location.reload();
      }
    });

    // History & Logs Tools
    document.getElementById('inputSearchHistory').addEventListener('input', (e) => {
      this.historySearchTerm = e.target.value.toLowerCase();
      this.renderHistoryTable();
    });

    document.getElementById('btnExportHistoryJson').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(this.historyList, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tiktok_upload_history_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    document.getElementById('btnDownloadLogs').addEventListener('click', () => {
      const logLines = this.systemLogs.map(l => `[${l.time}][${l.level?.toUpperCase()}] ${l.text}`).join('\n');
      const blob = new Blob([logLines], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tiktok_bot_logs_${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    });

    document.getElementById('btnClearHistory').addEventListener('click', async () => {
      if (confirm("Yakin ingin menghapus seluruh riwayat upload?")) {
        this.historyList = [];
        await chrome.storage.local.set({ tt_upload_history: [] });
        this.renderHistoryTable();
      }
    });

    document.getElementById('btnClearDashboardLogs').addEventListener('click', async () => {
      this.systemLogs = [];
      await chrome.storage.local.set({ tt_system_logs: [] });
      this.renderLogs();
    });

    document.querySelectorAll('.btn-filter-log').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.btn-filter-log').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.logFilter = btn.getAttribute('data-filter');
        this.renderLogs();
      });
    });

    // AI Form
    const selectAiModel = document.getElementById('dashAiModel');
    selectAiModel.value = this.config.aiModel || 'gemini-flash-lite-latest';
    selectAiModel.addEventListener('change', (e) => {
      this.config.aiModel = e.target.value;
      this.saveConfig();
    });

    const inputMaxTags = document.getElementById('dashMaxHashtags');
    inputMaxTags.value = this.config.maxHashtags || 5;
    inputMaxTags.addEventListener('change', (e) => {
      this.config.maxHashtags = parseInt(e.target.value, 10) || 5;
      this.saveConfig();
    });

    // Test Key Speed
    document.getElementById('btnTestKeySpeed').addEventListener('click', async () => {
      if (this.apiKeys.length === 0) return alert("Daftar API key kosong.");
      const btn = document.getElementById('btnTestKeySpeed');
      btn.textContent = "⏳ Menguji...";
      btn.disabled = true;

      try {
        const t0 = Date.now();
        const model = this.config.aiModel || 'gemini-flash-lite-latest';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKeys[0]}`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'Halo' }] }] })
        });
        const dt = Date.now() - t0;
        if (resp.ok) {
          alert(`✓ API Key #1 aktif & merespon dalam ${dt}ms (${model})!`);
        } else {
          alert(`✕ Response Status ${resp.status}: ${await resp.text()}`);
        }
      } catch (err) {
        alert("✕ Error koneksi: " + err.message);
      } finally {
        btn.textContent = "⚡ Tes Kecepatan Key";
        btn.disabled = false;
      }
    });
  }

  addFiles(files) {
    const videoFiles = files.filter(f => f.type.startsWith('video/') || f.name.match(/\.(mp4|mov|webm)$/i));

    for (const file of videoFiles) {
      if (!this.videoQueue.some(item => item.file?.name === file.name && item.file?.size === file.size)) {
        const cleanName = file.name.replace(/\.[^/.]+$/, "");
        this.videoQueue.push({
          file: file,
          status: 'waiting',
          scheduledDate: '',
          scheduledTime: '',
          customCaption: cleanName
        });
      }
    }

    if (this.config.mode === 'schedule') {
      this.calculateStagger(false);
    } else {
      this.videoQueue.forEach(item => {
        item.scheduledDate = '';
        item.scheduledTime = '';
      });
    }

    this.saveConfig();
    this.renderCards();
  }

  readFileAsDataURL(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  }

  async applyBatchCovers(imageFiles) {
    if (this.videoQueue.length === 0) {
      alert("Antrean video masih kosong. Silakan tambahkan file video terlebih dahulu.");
      return;
    }

    let matched = 0;
    const cleanImgNames = imageFiles.map(img => ({
      file: img,
      baseName: img.name.replace(/\.[^/.]+$/, "").trim().toLowerCase()
    }));

    for (let i = 0; i < this.videoQueue.length; i++) {
      const vItem = this.videoQueue[i];
      const vBaseName = (vItem.file?.name || "").replace(/\.[^/.]+$/, "").trim().toLowerCase();

      // Cari gambar yang namanya sama persis dengan video
      let found = cleanImgNames.find(img => img.baseName === vBaseName);

      // Jika tidak ada nama yang sama persis, gunakan urutan indeks jika tersedia
      if (!found && cleanImgNames[i]) {
        found = cleanImgNames[i];
      }

      if (found) {
        vItem.coverFile = found.file;
        vItem.coverPreviewUrl = await this.readFileAsDataURL(found.file);
        matched++;
      }
    }

    await this.saveConfig();
    this.renderCards();
    alert(`✓ ${matched} gambar sampul berhasil dipasangkan ke video antrean!`);
  }

  calculateStagger(forceAll = false) {
    const inDate = document.getElementById('dashStartDate');
    const inTime = document.getElementById('dashStartTime');
    const inInterval = document.getElementById('dashIntervalMinutes');

    const startDateStr = (inDate && inDate.value) || this.config.startDate || new Date().toISOString().split('T')[0];
    const startTimeStr = (inTime && inTime.value) || this.config.startTime || "12:00";
    const interval = (inInterval && parseInt(inInterval.value, 10)) || this.config.intervalMinutes || 120;

    this.config.startDate = startDateStr;
    this.config.startTime = startTimeStr;
    this.config.intervalMinutes = interval;

    const [sYear, sMonth, sDay] = startDateStr.split('-').map(Number);
    const [startH, startM] = startTimeStr.split(':').map(Number);
    const baseDateTime = new Date(sYear, (sMonth || 1) - 1, sDay || 1, startH || 0, startM || 0, 0);

    this.videoQueue.forEach((item, idx) => {
      if (forceAll || !item.scheduledDate || !item.scheduledTime) {
        const itemDateTime = new Date(baseDateTime.getTime() + (idx * interval * 60000));
        const y = itemDateTime.getFullYear();
        const m = String(itemDateTime.getMonth() + 1).padStart(2, '0');
        const d = String(itemDateTime.getDate()).padStart(2, '0');
        const h = String(itemDateTime.getHours()).padStart(2, '0');
        const min = String(itemDateTime.getMinutes()).padStart(2, '0');

        item.scheduledDate = `${y}-${m}-${d}`;
        item.scheduledTime = `${h}:${min}`;
      }
    });
  }

  async generateAiCaption(file) {
    if (this.apiKeys.length === 0) throw new Error("API Keys kosong.");
    const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
    const model = this.config.aiModel || 'gemini-flash-lite-latest';
    const key = this.apiKeys[Math.floor(Math.random() * this.apiKeys.length)];

    const systemPrompt = `Kamu adalah Content Strategist TikTok Indonesia.
Analisis judul file: "${cleanName}".
Buatkan 1 caption TikTok menarik, santai, hook kuat di baris pertama, dan sertakan MAKSIMAL 3 SAMPAI 5 HASHTAG VIRAL saja (contoh: #fyp #viral #tiktok).
Aturan: Maksimal 5 hashtag. Langsung berikan hasil teks caption tanpa tanda kutip.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 180 }
      })
    });

    if (resp.ok) {
      const data = await resp.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text.trim().replace(/^["']|["']$/g, '');
    }
    return cleanName;
  }

  exportDatabaseJSON() {
    const payload = {
      app: "TikTok Studio Auto Uploader Pro",
      version: "3.9.0",
      exported_at: new Date().toISOString(),
      config: this.config,
      history: this.historyList,
      queue: this.videoQueue.map((item, idx) => ({
        index: idx + 1,
        filename: item.file?.name || `video_${idx+1}.mp4`,
        size_mb: item.file?.size ? (item.file.size / 1024 / 1024).toFixed(2) : 0,
        status: item.status || 'waiting',
        scheduled_date: item.scheduledDate,
        scheduled_time: item.scheduledTime,
        custom_caption: item.customCaption
      }))
    };

    const jsonStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tiktok_bot_master_db_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async importDatabaseJSON(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (data.config) {
        this.config = { ...this.config, ...data.config };
      }

      if (Array.isArray(data.history)) {
        this.historyList = data.history;
        await chrome.storage.local.set({ tt_upload_history: this.historyList });
      }

      if (Array.isArray(data.queue) && data.queue.length > 0) {
        data.queue.forEach((qItem, idx) => {
          if (this.videoQueue[idx]) {
            if (qItem.custom_caption) this.videoQueue[idx].customCaption = qItem.custom_caption;
            if (qItem.scheduled_date) this.videoQueue[idx].scheduledDate = qItem.scheduled_date;
            if (qItem.scheduled_time) this.videoQueue[idx].scheduledTime = qItem.scheduled_time;
          }
        });
      }

      await this.saveConfig();
      this.render();
      alert("✓ Database JSON berhasil dipulihkan!");
    } catch (err) {
      alert("✕ Gagal membaca file JSON: " + err.message);
    }
  }

  render() {
    this.renderCards();
    this.renderHistoryTable();
    this.renderLogs();
  }

  renderCards() {
    const summaryBar = document.getElementById('dashQueueSummary');
    const container = document.getElementById('dashCardsContainer');
    const totalCountText = document.getElementById('dashTotalVideoText');
    const navQueueCount = document.getElementById('navQueueCount');

    if (navQueueCount) navQueueCount.textContent = `${this.videoQueue.length} Video Siap`;

    if (this.videoQueue.length === 0) {
      summaryBar.style.display = 'none';
      container.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: #94A3B8; background: #FFFFFF; border: 1px dashed #CBD5E1; border-radius: 10px;">
          Belum ada video dalam antrean. Silakan tarik atau klik kotak di atas untuk menambahkan video massal.
        </div>
      `;
      return;
    }

    summaryBar.style.display = 'flex';
    totalCountText.textContent = this.videoQueue.length;

    container.innerHTML = this.videoQueue.map((item, idx) => {
      const sizeMB = item.file?.size ? (item.file.size / 1024 / 1024).toFixed(1) + ' MB' : '';

      let statusBadge = '<span class="status-pill pill-wait">Menunggu</span>';
      if (item.status === 'active') statusBadge = '<span class="status-pill pill-warn">Proses</span>';
      if (item.status === 'done') statusBadge = '<span class="status-pill pill-success">✓ Selesai</span>';
      if (item.status === 'skipped') statusBadge = '<span class="status-pill pill-warn">⚠️ Dibatasi</span>';
      if (item.status === 'error') statusBadge = '<span class="status-pill pill-error">✕ Gagal</span>';

      const isSchedule = this.config.mode === 'schedule';

      const scheduleHtml = isSchedule ? `
        <!-- Schedule Row -->
        <div class="card-schedule-row">
          <div class="card-input-box">
            <label>📅 Tanggal Post</label>
            <input type="date" class="item-date-input" data-index="${idx}" value="${item.scheduledDate || this.config.startDate}">
          </div>
          <div class="card-input-box">
            <label>🕒 Jam Post</label>
            <input type="time" class="item-time-input" data-index="${idx}" value="${item.scheduledTime || this.config.startTime}">
          </div>
        </div>
      ` : `
        <div style="display:flex; align-items:center; gap:6px; font-size:10.5px; color:#059669; font-weight:700; background:#ECFDF5; padding:5px 8px; border-radius:5px; border:1px solid #A7F3D0;">
          <span>⚡ Publikasi: Langsung Post (Tanpa Jadwal)</span>
        </div>
      `;

      return `
        <div class="dash-card">
          <div class="card-top">
            <div class="card-id-name">
              <span class="card-badge-num">#${idx + 1}</span>
              <span class="card-filename" title="${item.file?.name || ''}">${item.file?.name || ''}</span>
            </div>
            <div class="card-meta-right">
              ${statusBadge}
              <span class="card-filesize">${sizeMB}</span>
              <button class="btn-card-del" data-index="${idx}" title="Hapus video ini">✕</button>
            </div>
          </div>

          ${scheduleHtml}

          <!-- Cover (Thumbnail) Box -->
          <div class="card-cover-box">
            <div class="card-cover-head">
              <label>🖼️ Custom Sampul (Thumbnail):</label>
              ${(item.coverFile || item.coverPreviewUrl) ? `<button type="button" class="btn-clear-cover" data-index="${idx}" title="Hapus Sampul">✕ Hapus</button>` : ''}
            </div>
            <div class="card-cover-body">
              ${item.coverPreviewUrl ? `
                <div class="cover-preview-wrapper">
                  <img src="${item.coverPreviewUrl}" class="cover-img-preview" alt="Sampul">
                  <span class="cover-filename" title="${item.coverFile?.name || 'custom_cover.jpg'}">${item.coverFile?.name || 'custom_cover.jpg'}</span>
                </div>
              ` : `
                <label class="btn-upload-cover">
                  <input type="file" class="item-cover-input" data-index="${idx}" accept="image/png,image/jpeg,image/jpg,image/webp" style="display:none;">
                  <span>+ Pilih Gambar Sampul (.jpg / .png)</span>
                </label>
              `}
            </div>
          </div>

          <!-- Caption & Single AI -->
          <div class="card-caption-group">
            <div class="card-caption-head">
              <label>✍️ Caption & Hashtags:</label>
              <button type="button" class="btn-card-ai" data-index="${idx}" title="Generate AI Caption (Maks 5 Hashtag)">✨</button>
            </div>
            <textarea class="card-caption-textarea" data-index="${idx}" placeholder="Caption video #${idx + 1}...">${item.customCaption || ''}</textarea>
          </div>
        </div>
      `;
    }).join('');

    // Bind inputs (Realtime change & input)
    container.querySelectorAll('.item-date-input').forEach(inp => {
      const updateDate = (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'), 10);
        if (this.videoQueue[idx]) {
          this.videoQueue[idx].scheduledDate = e.target.value;
          this.saveConfig();
        }
      };
      inp.addEventListener('change', updateDate);
      inp.addEventListener('input', updateDate);
    });

    container.querySelectorAll('.item-time-input').forEach(inp => {
      const updateTime = (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'), 10);
        if (this.videoQueue[idx]) {
          this.videoQueue[idx].scheduledTime = e.target.value;
          this.saveConfig();
        }
      };
      inp.addEventListener('change', updateTime);
      inp.addEventListener('input', updateTime);
    });

    // Bind Cover Inputs
    container.querySelectorAll('.item-cover-input').forEach(inp => {
      inp.addEventListener('change', async (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'), 10);
        if (e.target.files && e.target.files[0] && this.videoQueue[idx]) {
          const file = e.target.files[0];
          this.videoQueue[idx].coverFile = file;
          this.videoQueue[idx].coverPreviewUrl = await this.readFileAsDataURL(file);
          await this.saveConfig();
          this.renderCards();
        }
      });
    });

    // Bind Clear Cover Buttons
    container.querySelectorAll('.btn-clear-cover').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'), 10);
        if (this.videoQueue[idx]) {
          this.videoQueue[idx].coverFile = null;
          this.videoQueue[idx].coverPreviewUrl = '';
          await this.saveConfig();
          this.renderCards();
        }
      });
    });

    container.querySelectorAll('.card-caption-textarea').forEach(tx => {
      tx.addEventListener('input', (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'), 10);
        if (this.videoQueue[idx]) {
          this.videoQueue[idx].customCaption = e.target.value;
          this.saveConfig();
        }
      });
    });

    container.querySelectorAll('.btn-card-ai').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'), 10);
        const item = this.videoQueue[idx];
        if (item) {
          btn.textContent = "⏳";
          btn.disabled = true;
          try {
            const cap = await this.generateAiCaption(item.file);
            item.customCaption = cap;
            await this.saveConfig();
            this.renderCards();
          } catch (err) {
            alert("✕ Gagal AI: " + err.message);
            btn.textContent = "✨";
            btn.disabled = false;
          }
        }
      });
    });

    container.querySelectorAll('.btn-card-del').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'), 10);
        this.videoQueue.splice(idx, 1);
        this.saveConfig();
        this.renderCards();
      });
    });
  }

  renderHistoryTable() {
    const tbody = document.getElementById('tbodyHistory');
    const countText = document.getElementById('historyItemCountText');
    const navHistoryCount = document.getElementById('navHistoryCount');

    if (countText) countText.textContent = this.historyList.length;
    if (navHistoryCount) navHistoryCount.textContent = `${this.historyList.length} Video Terposting`;

    let filtered = this.historyList;
    if (this.historySearchTerm) {
      filtered = filtered.filter(item => 
        (item.filename || '').toLowerCase().includes(this.historySearchTerm) ||
        (item.caption || '').toLowerCase().includes(this.historySearchTerm)
      );
    }

    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center; color:#94A3B8; padding:30px;">
            ${this.historySearchTerm ? 'Tidak ditemukan riwayat yang sesuai pencarian.' : 'Belum ada riwayat video yang diupload.'}
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map((item, idx) => {
      let statusBadge = '<span class="status-pill pill-success">✓ Sukses</span>';
      if (item.status === 'skipped') statusBadge = '<span class="status-pill pill-warn">⚠️ Dibatasi</span>';
      if (item.status === 'error') statusBadge = '<span class="status-pill pill-error">✕ Gagal</span>';

      const timeStr = item.uploadedAt || item.time || '-';
      const schedStr = item.scheduledDate ? `${item.scheduledDate} ${item.scheduledTime}` : 'Langsung Post';
      const capSnippet = (item.caption || '').slice(0, 50) + ((item.caption || '').length > 50 ? '...' : '');

      return `
        <tr>
          <td><b>#${idx + 1}</b></td>
          <td style="color:#64748B; font-size:11px;">${timeStr}</td>
          <td><b>${item.filename || 'video.mp4'}</b></td>
          <td style="color:#475569;">${schedStr}</td>
          <td title="${item.caption || ''}" style="color:#64748B;">${capSnippet}</td>
          <td>${statusBadge}</td>
        </tr>
      `;
    }).join('');
  }

  renderLogs() {
    const terminal = document.getElementById('dashTerminalLogs');
    if (!terminal) return;

    let filtered = this.systemLogs;
    if (this.logFilter !== 'all') {
      filtered = filtered.filter(l => l.level === this.logFilter);
    }

    if (filtered.length === 0) {
      terminal.innerHTML = `<span style="color:#64748B;">[Console] Belum ada catatan aktivitas log.</span>`;
      return;
    }

    terminal.innerHTML = filtered.map(log => `
      <div class="log-row">
        <span class="log-row-time">${log.time || ''}</span>
        <span class="log-row-${log.level || 'info'}">${log.text || ''}</span>
      </div>
    `).join('');

    terminal.scrollTop = terminal.scrollHeight;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new MasterDashboardApp();
});
