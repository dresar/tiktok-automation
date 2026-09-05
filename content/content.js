/**
 * TikTok Studio Auto Uploader Pro - All-In-One Unified In-Page Studio HUD (v3.11.0)
 * Completely self-contained sidebar inside TikTok Studio.
 */

(function () {
  'use strict';

  // 1. IndexedDB Helper (Scoped to tiktok.com origin)
  const TTVideoDB = {
    dbName: 'TT_Unified_Automation_DB',
    storeName: 'video_queue',
    version: 1,

    async open() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(this.dbName, this.version);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(this.storeName)) {
            db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },

    async saveQueue(queue) {
      try {
        const db = await this.open();
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        store.clear();
        for (let i = 0; i < queue.length; i++) {
          const it = queue[i];
          store.add({
            id: i,
            file: it.file,
            coverFile: it.coverFile || null,
            coverPreviewUrl: it.coverPreviewUrl || '',
            status: it.status || 'waiting',
            scheduledDate: it.scheduledDate || '',
            scheduledTime: it.scheduledTime || '',
            customCaption: it.customCaption || ''
          });
        }
        return new Promise((resolve) => {
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        });
      } catch (e) {
        return false;
      }
    },

    async loadQueue() {
      try {
        const db = await this.open();
        const tx = db.transaction(this.storeName, 'readonly');
        const store = tx.objectStore(this.storeName);
        const req = store.getAll();
        return new Promise((resolve) => {
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        });
      } catch (e) {
        return [];
      }
    },

    async clearQueue() {
      try {
        const db = await this.open();
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        store.clear();
        return new Promise((resolve) => {
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        });
      } catch (e) {
        return false;
      }
    }
  };

  // 2. Main Studio HUD Class
  class TikTokStudioHUD {
    constructor() {
      this.isCollapsed = false;
      this.sidebarWidth = 420;
      this.activeTab = 'queue'; // 'queue' | 'schedule' | 'settings' | 'history'
      this.isRunning = false;
      this.isProcessingLock = false;
      this.currentIndex = -1;
      this.videoQueue = [];
      this.apiKeys = [];
      this.systemLogs = [];
      this.uploadHistory = [];

      this.config = {
        profileLabel: 'Akun 1',
        mode: 'schedule', // 'direct' | 'schedule'
        startMode: 'immediate', // 'immediate' | 'delay' | 'specific_time'
        delayMinutes: 30,
        specificStartTime: '08:00',
        startDate: new Date().toISOString().split('T')[0],
        startTime: '06:15',
        intervalMinutes: 120,
        visibility: 'Public',
        allowComment: true,
        allowDuet: true,
        autoPost: true,
        delayBetween: 60,
        autoCatchup: true
      };

      this.isDelayCountdownActive = false;
      this.delayTargetTimestamp = null;
      this.countdownInterval = null;

      const EngineClass = window.TikTokStudioEngine || window.TikTokUploaderEngine;
      this.engine = EngineClass ? new EngineClass() : null;

      this.init();
    }

    async init() {
      console.log("[TikTok Studio Bot Pro] Inisialisasi All-In-One Sidebar HUD v3.12.0 (Multi-Chrome Tracking)...");
      await this.loadConfig();
      await this.loadQueueFromDB();
      await this.loadHistory();
      
      // Load persistent system logs
      try {
        const storedLogs = await chrome.storage.local.get(['tt_system_logs']);
        if (storedLogs.tt_system_logs && Array.isArray(storedLogs.tt_system_logs)) {
          this.systemLogs = storedLogs.tt_system_logs;
        }
      } catch (e) {}

      this.createUI();
      this.setupAlarms();
      this.setupUrlWatcher();
      this.updateProcessMarker(0, 0, `Siap (${this.videoQueue.length} Video)`, "🛑");

      // Check if batch execution was active before reload / navigation
      try {
        const storedState = await chrome.storage.local.get(['tt_batch_state']);
        if (storedState.tt_batch_state && storedState.tt_batch_state.isRunning) {
          const nextPending = this.videoQueue.findIndex(v => v.status === 'waiting');
          if (nextPending !== -1) {
            this.isRunning = true;
            this.currentIndex = nextPending;
            this.render();
            this.log(`🔄 Melanjutkan otomatis upload batch untuk Video #${nextPending + 1}...`, "info");
            setTimeout(async () => {
              try {
                if (this.engine) {
                  await this.engine.ensureUploadReady(45000, (msg, lvl) => this.log(msg, lvl));
                }
              } catch (e) {}
              this.processNextVideoInQueue();
            }, 2500);
          } else {
            await chrome.storage.local.set({ tt_batch_state: { isRunning: false, currentIndex: -1 } });
          }
        }
      } catch (e) {}
    }

    async loadConfig() {
      try {
        const stored = await chrome.storage.local.get(['tt_v2_config', 'tt_options_custom', 'tt_sidebar_width']);
        if (stored.tt_v2_config) {
          this.config = { ...this.config, ...stored.tt_v2_config };
        }
        if (stored.tt_options_custom) {
          this.config = { ...this.config, ...stored.tt_options_custom };
        }
        if (stored.tt_sidebar_width) {
          this.sidebarWidth = Math.max(340, Math.min(window.innerWidth - 40, stored.tt_sidebar_width));
        }
      } catch (e) {}
    }

    async saveConfig() {
      try {
        await chrome.storage.local.set({
          tt_v2_config: {
            profileLabel: this.config.profileLabel,
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
        await TTVideoDB.saveQueue(this.videoQueue);
      } catch (e) {}
    }

    async loadApiKeys() {
      try {
        const res = await fetch(chrome.runtime.getURL('api_keys.json'));
        const data = await res.json();
        if (data && Array.isArray(data.keys)) {
          this.apiKeys = data.keys;
          if (this.gemini) this.gemini.setApiKeys(this.apiKeys);
        }
      } catch (e) {}
    }

    async loadQueueFromDB() {
      try {
        const items = await TTVideoDB.loadQueue();
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
        } else {
          this.videoQueue = [];
        }
      } catch (e) {
        this.videoQueue = [];
      }
    }

    async loadHistory() {
      try {
        const stored = await chrome.storage.local.get(['tt_upload_history']);
        this.uploadHistory = Array.isArray(stored.tt_upload_history) ? stored.tt_upload_history : [];
      } catch (e) {}
    }

    createUI() {
      const existing = document.getElementById('tt-studio-hud-root');
      if (existing) existing.remove();

      this.hostElement = document.createElement('div');
      this.hostElement.id = 'tt-studio-hud-root';
      this.shadowRoot = this.hostElement.attachShadow({ mode: 'open' });

      // Inject CSS
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = chrome.runtime.getURL('content/content.css');
      this.shadowRoot.appendChild(link);

      // Create container
      this.container = document.createElement('div');
      this.shadowRoot.appendChild(this.container);

      document.body.appendChild(this.hostElement);
      this.render();
    }

    log(text, level = 'info') {
      const timeStr = new Date().toLocaleTimeString();
      const logEntry = { time: timeStr, text, level };
      this.systemLogs.push(logEntry);
      if (this.systemLogs.length > 50) this.systemLogs.shift();

      try {
        chrome.storage.local.set({ tt_system_logs: this.systemLogs });
      } catch (e) {}

      console.log(`[TikTok Bot][${timeStr}][${level.toUpperCase()}] ${text}`);
      this.updateStatus(text, level === 'info' || level === 'warn');

      const logBody = this.shadowRoot?.getElementById('tt-log-body');
      if (logBody) {
        const div = document.createElement('div');
        div.className = 'tt-log-entry';
        div.innerHTML = `<span class="tt-log-time">${timeStr}</span><span class="tt-log-${level}">${text}</span>`;
        logBody.appendChild(div);
        logBody.scrollTop = logBody.scrollHeight;
      }
    }

    updateStatus(text, isActive = false) {
      const box = this.shadowRoot?.getElementById('tt-status-box');
      const statusText = this.shadowRoot?.getElementById('tt-status-text');
      if (box && statusText) {
        if (isActive) box.classList.add('active');
        else box.classList.remove('active');
        statusText.textContent = text;
      }
    }

    updateProcessMarker(stepNumber, totalSteps, stepName, stepIcon = '⏳') {
      const profile = this.config.profileLabel ? `[${this.config.profileLabel}] ` : '';
      const queuePos = this.currentIndex >= 0 ? `[${this.currentIndex + 1}/${this.videoQueue.length}] ` : '';
      
      // 1. Update Browser Tab Title so all Chrome windows are visible from taskbar / tab bar
      document.title = `${profile}${queuePos}${stepIcon} ${stepName} | TikTok Studio`;

      // 2. Update HUD Status Bar Text
      const statusBox = this.shadowRoot?.getElementById('tt-status-text');
      if (statusBox) {
        statusBox.innerText = totalSteps > 0 
          ? `${profile}${queuePos}Langkah ${stepNumber}/${totalSteps}: ${stepName}`
          : `${profile}${queuePos}${stepIcon} ${stepName}`;
      }

      // 3. Update current active item step property and re-render step tag on card
      if (this.currentIndex >= 0 && this.videoQueue[this.currentIndex]) {
        this.videoQueue[this.currentIndex].currentStepText = `${stepIcon} [${stepNumber}/${totalSteps}] ${stepName}`;
        const activeCard = this.shadowRoot?.querySelector(`.tt-card[data-index="${this.currentIndex}"]`);
        if (activeCard) {
          const stepPill = activeCard.querySelector('.tt-step-indicator');
          if (stepPill) {
            stepPill.innerText = this.videoQueue[this.currentIndex].currentStepText;
          }
        }
      }

      // 4. Update Edge Tab
      const tabBadge = this.shadowRoot?.querySelector('.tt-tab-badge');
      if (tabBadge && this.currentIndex >= 0) {
        tabBadge.innerText = `${this.currentIndex + 1}/${this.videoQueue.length}`;
      }
    }

    render() {
      const total = this.videoQueue.length;
      const waiting = this.videoQueue.filter(v => v.status === 'waiting').length;

      let sizeLabel = '📐 Sedang';
      if (this.sidebarWidth >= 750) sizeLabel = '📐 Max';
      else if (this.sidebarWidth >= 550) sizeLabel = '📐 Lebar';
      else sizeLabel = '📐 Normal';

      this.container.innerHTML = `
        <!-- Floating Toggle Handle -->
        <div id="tt-sidebar-tab" class="${this.isCollapsed ? 'collapsed' : ''}" style="right: ${this.isCollapsed ? '0px' : this.sidebarWidth + 'px'};" title="Buka/Tutup TikTok Studio HUD">
          <svg viewBox="0 0 24 24">
            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298-.002.595.042.88.13V9.4a6.33 6.33 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.66a6.34 6.34 0 0 0 10.86 4.46c1.69-1.69 2.14-4.2 2.14-6.49v-4.5a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.18-.56z"/>
          </svg>
          <span class="tt-tab-text">STUDIO BOT</span>
          <span class="tt-tab-badge">${waiting}</span>
        </div>

        <!-- Docked Sidebar -->
        <div id="tt-sidebar-dock" class="${this.isCollapsed ? 'collapsed' : ''}" style="width: ${this.sidebarWidth}px;">
          <!-- Left Drag Resizer -->
          <div class="tt-resizer-handle" id="tt-resizer-handle" title="Tahan & geser untuk mengubah lebar sidebar"></div>

          <!-- Header -->
          <div class="tt-side-header">
            <div class="tt-side-brand">
              <svg viewBox="0 0 24 24" class="tt-brand-logo">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298-.002.595.042.88.13V9.4a6.33 6.33 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.66a6.34 6.34 0 0 0 10.86 4.46c1.69-1.69 2.14-4.2 2.14-6.49v-4.5a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.18-.56z"/>
              </svg>
              <span class="tt-brand-title">TikTok Studio Bot Pro</span>
            </div>
            <div class="tt-header-actions">
              <button type="button" class="tt-btn-hdr tt-profile-tag" id="tt-btn-profile-tag" title="Klik untuk ubah nama profil/akun Chrome ini">🏷️ ${this.config.profileLabel || 'Akun 1'}</button>
              <button type="button" class="tt-btn-hdr" id="tt-btn-toggle-size" title="Ubah Ukuran Lebar Panel">${sizeLabel}</button>
              <button type="button" class="tt-btn-hdr" id="tt-btn-export-json" title="Export Cadangan Database JSON">💾 Export</button>
              <button type="button" class="tt-btn-hdr" id="tt-btn-import-json-trigger" title="Import Database JSON">📥 Import</button>
              <input type="file" id="tt-file-import-json" accept=".json" style="display:none;">
              <button type="button" class="tt-btn-close-dock" id="tt-btn-collapse" title="Sembunyikan Panel">✕</button>
            </div>
          </div>

          <!-- Tabs Navigation -->
          <div class="tt-nav-tabs">
            <button type="button" class="tt-tab-btn ${this.activeTab === 'queue' ? 'active' : ''}" data-tab="queue">🎬 Antrean (${total})</button>
            <button type="button" class="tt-tab-btn ${this.activeTab === 'schedule' ? 'active' : ''}" data-tab="schedule">⏰ Jadwal</button>
            <button type="button" class="tt-tab-btn ${this.activeTab === 'settings' ? 'active' : ''}" data-tab="settings">⚙️ Setelan</button>
            <button type="button" class="tt-tab-btn ${this.activeTab === 'history' ? 'active' : ''}" data-tab="history">📜 Riwayat</button>
          </div>

          <!-- Body Content -->
          <div class="tt-side-body">
            
            <!-- PANE 1: ANTREAN -->
            <div class="tt-pane ${this.activeTab === 'queue' ? 'active' : ''}" id="pane-queue">
              <!-- Quick Tools Toolbar -->
              <div class="tt-tools-wrap">
                <button type="button" class="tt-btn-tool" id="tt-btn-batch-cover-trigger">🖼️ Sampul Massal</button>
                <input type="file" id="tt-input-batch-covers" multiple accept="image/jpeg,image/png,image/webp" style="display:none;">
                <button type="button" class="tt-btn-tool" id="tt-btn-clean-done">🧹 Hapus Selesai</button>
                <button type="button" class="tt-btn-tool" id="tt-btn-reset-status">🔄 Reset Status</button>
                <button type="button" class="tt-btn-tool" id="tt-btn-reset-schedule">🧹 Reset Jadwal</button>
                <button type="button" class="tt-btn-tool danger" id="tt-btn-clear-all">🗑️ Bersihkan Semua</button>
              </div>

              <!-- Post Mode Segmented Control -->
              <div class="tt-post-mode-bar">
                <button type="button" class="tt-mode-btn ${this.config.mode === 'direct' ? 'active' : ''}" id="tt-mode-direct">⚡ Langsung Post</button>
                <button type="button" class="tt-mode-btn ${this.config.mode === 'schedule' ? 'active' : ''}" id="tt-mode-schedule">📅 Jadwalkan Postingan</button>
              </div>

              <!-- Stagger Multi-Schedule Toolbar (If Mode = Schedule) -->
              <div class="tt-stagger-box" style="${this.config.mode === 'schedule' ? 'display:flex;' : 'display:none;'}">
                <div class="tt-stagger-grid">
                  <div class="tt-stagger-item">
                    <label>Tanggal Mulai</label>
                    <input type="date" id="tt-stagger-date" value="${this.config.startDate}">
                  </div>
                  <div class="tt-stagger-item">
                    <label>Jam Mulai</label>
                    <input type="time" id="tt-stagger-time" value="${this.config.startTime}">
                  </div>
                  <div class="tt-stagger-item">
                    <label>Jeda Tiap Video</label>
                    <select id="tt-stagger-interval">
                      <option value="15" ${this.config.intervalMinutes === 15 ? 'selected' : ''}>+15 Menit</option>
                      <option value="30" ${this.config.intervalMinutes === 30 ? 'selected' : ''}>+30 Menit</option>
                      <option value="60" ${this.config.intervalMinutes === 60 ? 'selected' : ''}>+1 Jam</option>
                      <option value="120" ${this.config.intervalMinutes === 120 ? 'selected' : ''}>+2 Jam</option>
                      <option value="180" ${this.config.intervalMinutes === 180 ? 'selected' : ''}>+3 Jam</option>
                      <option value="240" ${this.config.intervalMinutes === 240 ? 'selected' : ''}>+4 Jam</option>
                      <option value="1440" ${this.config.intervalMinutes === 1440 ? 'selected' : ''}>+1 Hari</option>
                    </select>
                  </div>
                </div>
                <button type="button" class="tt-btn-apply-stagger" id="tt-btn-apply-stagger">⚡ Terapkan Jadwal Berjenjang</button>
              </div>

              <!-- Direct Video Dropzone -->
              <div class="tt-drop-zone" id="tt-drop-zone">
                <input type="file" id="tt-file-input" multiple accept="video/mp4,video/quicktime,video/webm">
                <span class="tt-drop-title">📂 + Tambah / Seret File Video ke Sini</span>
                <span class="tt-drop-sub">Mendukung MP4, MOV, WebM (Bisa pilih banyak sekaligus)</span>
              </div>

              <!-- Video Card List -->
              <div class="tt-queue-list" id="tt-queue-list">
                ${total === 0 ? `
                  <div style="text-align:center; padding:20px 10px; color:#94A3B8; font-size:11px;">
                    Belum ada video di antrean.<br>Silakan seret atau pilih file video di atas.
                  </div>
                ` : this.videoQueue.map((item, idx) => {
                  let pillClass = 'tt-pill-wait';
                  let pillText = 'Menunggu';
                  if (item.status === 'active') { pillClass = 'tt-pill-proc'; pillText = 'Proses'; }
                  else if (item.status === 'done') { pillClass = 'tt-pill-done'; pillText = '✓ Selesai'; }
                  else if (item.status === 'skipped') { pillClass = 'tt-pill-warn'; pillText = '⚠️ Dibatasi'; }
                  else if (item.status === 'error') { pillClass = 'tt-pill-err'; pillText = '✕ Gagal'; }

                  const isSched = this.config.mode === 'schedule';

                  return `
                    <div class="tt-card ${item.status === 'active' ? 'active' : ''} ${item.status === 'done' ? 'done' : ''}" data-index="${idx}">
                      <!-- Card Top Row -->
                      <div class="tt-card-top">
                        <div class="tt-card-title-box">
                          <span class="tt-card-index">#${idx + 1}</span>
                          <span class="tt-card-filename" title="${item.file?.name || ''}">${item.file?.name || 'video.mp4'}</span>
                        </div>
                        <div class="tt-card-actions-top">
                          <span class="tt-status-pill ${pillClass}">${pillText}</span>
                          <button type="button" class="tt-btn-del-card" data-action="delete" title="Hapus Video">✕</button>
                        </div>
                      </div>

                      <!-- Realtime Step Progress Badge for Active Video -->
                      ${item.status === 'active' ? `
                        <div class="tt-active-step-bar">
                          <div class="tt-step-pulse"></div>
                          <span class="tt-step-indicator">${item.currentStepText || '⏳ Memulai proses upload...'}</span>
                        </div>
                      ` : ''}

                      <!-- Schedule Row (If schedule mode) -->
                      ${isSched ? `
                        <div class="tt-card-sched-row">
                          <input type="date" data-action="edit-date" value="${item.scheduledDate || this.config.startDate}">
                          <input type="time" data-action="edit-time" value="${item.scheduledTime || this.config.startTime}">
                        </div>
                      ` : ''}

                      <!-- Cover Row -->
                      <div class="tt-card-cover-row">
                        <div class="tt-cover-preview-box">
                          ${item.coverPreviewUrl ? `<img src="${item.coverPreviewUrl}" class="tt-cover-thumb">` : ''}
                          <span>${item.coverFile ? item.coverFile.name : (item.coverPreviewUrl ? 'Sampul Terpasang' : 'Sampul: Otomatis')}</span>
                        </div>
                        <label class="tt-btn-cover-select">
                          <input type="file" data-action="select-cover" accept="image/jpeg,image/png,image/webp" style="display:none;">
                          🖼️ Ganti Sampul
                        </label>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>

            <!-- PANE 2: JADWAL EKSEKUSI -->
            <div class="tt-pane ${this.activeTab === 'schedule' ? 'active' : ''}" id="pane-schedule">
              <div class="tt-card-box">
                <span style="font-weight:800; font-size:12px;">Waktu Mulai Eksekusi Bot</span>
                <div class="tt-form-field">
                  <label>Pilih Mode Mulai</label>
                  <select id="tt-start-mode">
                    <option value="immediate" ${this.config.startMode === 'immediate' ? 'selected' : ''}>⚡ Mulai Langsung</option>
                    <option value="delay" ${this.config.startMode === 'delay' ? 'selected' : ''}>⏳ Tunda Beberapa Menit</option>
                    <option value="specific_time" ${this.config.startMode === 'specific_time' ? 'selected' : ''}>⏰ Jam Tertentu</option>
                  </select>
                </div>

                <div class="tt-form-field" id="tt-box-delay" style="${this.config.startMode === 'delay' ? 'display:flex;' : 'display:none;'}">
                  <label>Durasi Tunda</label>
                  <select id="tt-delay-minutes">
                    <option value="15" ${this.config.delayMinutes === 15 ? 'selected' : ''}>15 Menit</option>
                    <option value="30" ${this.config.delayMinutes === 30 ? 'selected' : ''}>30 Menit</option>
                    <option value="60" ${this.config.delayMinutes === 60 ? 'selected' : ''}>1 Jam</option>
                    <option value="120" ${this.config.delayMinutes === 120 ? 'selected' : ''}>2 Jam</option>
                  </select>
                </div>

                <div class="tt-form-field" id="tt-box-specific" style="${this.config.startMode === 'specific_time' ? 'display:flex;' : 'display:none;'}">
                  <label>Mulai Pada Jam</label>
                  <input type="time" id="tt-specific-time" value="${this.config.specificStartTime || '08:00'}">
                </div>
              </div>
            </div>

            <!-- PANE 3: SETELAN -->
            <div class="tt-pane ${this.activeTab === 'settings' ? 'active' : ''}" id="pane-settings">
              <div class="tt-card-box">
                <span style="font-weight:800; font-size:12px;">Identitas Profil & Setelan Upload</span>
                
                <div class="tt-form-field">
                  <label>🏷️ Label / Nama Profil Chrome Ini (Multi-Chrome)</label>
                  <input type="text" id="tt-set-profile-label" value="${this.config.profileLabel || 'Akun 1'}" placeholder="Misal: Akun 1, Chrome 2, Edukasi...">
                </div>

                <div class="tt-form-field">
                  <label>Visibilitas Postingan</label>
                  <select id="tt-set-visibility">
                    <option value="Public" ${this.config.visibility === 'Public' ? 'selected' : ''}>Publik (Semua Orang)</option>
                    <option value="Friends" ${this.config.visibility === 'Friends' ? 'selected' : ''}>Teman (Pengikut)</option>
                    <option value="Private" ${this.config.visibility === 'Private' ? 'selected' : ''}>Pribadi (Hanya Saya)</option>
                  </select>
                </div>

                <div class="tt-form-field">
                  <label>Jeda Antar Video (Detik)</label>
                  <input type="number" id="tt-set-delay-between" value="${this.config.delayBetween || 60}" min="10" max="600">
                </div>

                <div class="tt-switch-row">
                  <div>
                    <div class="tt-switch-title">Auto Post Otomatis</div>
                    <div class="tt-switch-sub">Klik tombol Post secara otomatis setelah form siap</div>
                  </div>
                  <input type="checkbox" id="tt-set-autopost" ${this.config.autoPost ? 'checked' : ''}>
                </div>

                <div class="tt-switch-row">
                  <div>
                    <div class="tt-switch-title">Izinkan Komentar</div>
                  </div>
                  <input type="checkbox" id="tt-set-comment" ${this.config.allowComment ? 'checked' : ''}>
                </div>

                <div class="tt-switch-row">
                  <div>
                    <div class="tt-switch-title">Izinkan Duet & Stitch</div>
                  </div>
                  <input type="checkbox" id="tt-set-duet" ${this.config.allowDuet ? 'checked' : ''}>
                </div>
              </div>
            </div>

            <!-- PANE 4: RIWAYAT & LOG -->
            <div class="tt-pane ${this.activeTab === 'history' ? 'active' : ''}" id="pane-history">
              <div class="tt-card-box">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-weight:800; font-size:12px;">Riwayat Upload (${this.uploadHistory.length})</span>
                  <button type="button" class="tt-btn-tool danger" id="tt-btn-clear-history">Hapus Riwayat</button>
                </div>
                <div style="max-height:160px; overflow-y:auto; display:flex; flex-direction:column; gap:4px; font-size:10px;">
                  ${this.uploadHistory.length === 0 ? '<span style="color:#94A3B8;">Belum ada riwayat upload.</span>' : this.uploadHistory.map(h => `
                    <div style="padding:4px 6px; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:4px; display:flex; justify-content:space-between;">
                      <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:260px;">
                        <b>${h.filename}</b><br><span style="color:#64748B;">${h.uploadedAt} • ${h.scheduledDate} ${h.scheduledTime}</span>
                      </div>
                      <span style="color:${h.status === 'done' ? '#059669' : '#DC2626'}; font-weight:700;">${h.status === 'done' ? '✓ Sukses' : '✕ Gagal'}</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>

            <!-- Live Status Bar -->
            <div class="tt-status-bar ${this.isRunning ? 'active' : ''}" id="tt-status-box">
              <div class="tt-pulse-dot"></div>
              <span id="tt-status-text">${this.isRunning ? 'Sedang memproses upload batch...' : (waiting > 0 ? `${waiting} video siap dieksekusi.` : 'Antrean siap.')}</span>
            </div>

            <!-- Console Log Terminal -->
            <div class="tt-log-terminal">
              <div class="tt-log-header">
                <span>CONSOLE LOGS</span>
                <button class="tt-log-btn-clear" id="tt-btn-clear-logs" style="background:transparent; border:none; color:#94A3B8; cursor:pointer; font-size:9px;">Clear</button>
              </div>
              <div class="tt-log-body" id="tt-log-body">
                ${this.systemLogs.map(l => `<div class="tt-log-entry"><span class="tt-log-time">${l.time}</span><span class="tt-log-${l.level}">${l.text}</span></div>`).join('')}
              </div>
            </div>

          </div>

          <!-- Sticky Action Footer -->
          <div class="tt-side-footer">
            <button class="tt-btn-action tt-btn-start" id="tt-btn-start" style="${this.isRunning ? 'display:none;' : 'display:flex;'}" ${waiting === 0 ? 'disabled' : ''}>
              ▶ Mulai Upload Massal (${waiting})
            </button>
            <button class="tt-btn-action tt-btn-stop" id="tt-btn-stop" style="${this.isRunning ? 'display:flex;' : 'display:none;'}">
              ⏹ Berhenti / Batal
            </button>
          </div>
        </div>
      `;

      this.bindEvents();
    }

    bindEvents() {
      const root = this.shadowRoot;
      if (!root) return;

      // Drag-to-Resize Left Border Handle
      const resizer = root.getElementById('tt-resizer-handle');
      const dock = root.getElementById('tt-sidebar-dock');
      const tab = root.getElementById('tt-sidebar-tab');

      if (resizer && dock) {
        let isResizing = false;

        resizer.addEventListener('mousedown', (e) => {
          isResizing = true;
          resizer.classList.add('resizing');
          document.body.style.userSelect = 'none';
          document.body.style.cursor = 'col-resize';
        });

        window.addEventListener('mousemove', (e) => {
          if (!isResizing) return;
          const newWidth = Math.max(340, Math.min(window.innerWidth - 40, window.innerWidth - e.clientX));
          this.sidebarWidth = newWidth;
          dock.style.width = `${newWidth}px`;
          if (tab && !this.isCollapsed) {
            tab.style.right = `${newWidth}px`;
          }
        });

        window.addEventListener('mouseup', () => {
          if (isResizing) {
            isResizing = false;
            resizer.classList.remove('resizing');
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
            chrome.storage.local.set({ tt_sidebar_width: this.sidebarWidth });
            this.render();
          }
        });
      }

      // Quick Size Preset Button (Normal -> Lebar -> Max -> Normal)
      const btnToggleSize = root.getElementById('tt-btn-toggle-size');
      if (btnToggleSize) {
        btnToggleSize.addEventListener('click', () => {
          if (this.sidebarWidth < 500) {
            this.sidebarWidth = 580; // Lebar
          } else if (this.sidebarWidth < 700) {
            this.sidebarWidth = 850; // Max / Luas
          } else {
            this.sidebarWidth = 420; // Normal
          }
          chrome.storage.local.set({ tt_sidebar_width: this.sidebarWidth });
          this.render();
        });
      }

      // Toggle Dock
      const btnTab = root.getElementById('tt-sidebar-tab');
      const btnCollapse = root.getElementById('tt-btn-collapse');
      const toggleDock = () => {
        this.isCollapsed = !this.isCollapsed;
        const dockEl = root.getElementById('tt-sidebar-dock');
        if (dockEl && btnTab) {
          if (this.isCollapsed) {
            dockEl.classList.add('collapsed');
            btnTab.classList.add('collapsed');
            btnTab.style.right = '0px';
          } else {
            dockEl.classList.remove('collapsed');
            btnTab.classList.remove('collapsed');
            btnTab.style.right = `${this.sidebarWidth}px`;
          }
        }
      };
      if (btnTab) btnTab.addEventListener('click', toggleDock);
      if (btnCollapse) btnCollapse.addEventListener('click', toggleDock);

      // Multi-Chrome Profile Tag Trigger
      root.getElementById('tt-btn-profile-tag')?.addEventListener('click', () => {
        const current = this.config.profileLabel || 'Akun 1';
        const newLabel = prompt('🏷️ Masukkan nama/label untuk profil Chrome ini (Contoh: Akun 1, Toko 2, dll):', current);
        if (newLabel !== null && newLabel.trim() !== '') {
          this.config.profileLabel = newLabel.trim();
          this.saveConfig();
          this.render();
          this.updateProcessMarker(0, 0, `Siap (${this.videoQueue.length} Video)`, "🛑");
          this.log(`🏷️ Label profil Chrome diubah menjadi: "${this.config.profileLabel}"`, "success");
        }
      });

      // Tabs Navigation
      root.querySelectorAll('.tt-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          this.activeTab = e.currentTarget.dataset.tab;
          this.render();
        });
      });

      // Export / Import Database JSON
      root.getElementById('tt-btn-export-json').addEventListener('click', () => this.exportDatabaseJSON());
      const fileImport = root.getElementById('tt-file-import-json');
      root.getElementById('tt-btn-import-json-trigger').addEventListener('click', () => fileImport.click());
      fileImport.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) this.importDatabaseJSON(e.target.files[0]);
      });

      // Post Mode Buttons
      root.getElementById('tt-mode-direct').addEventListener('click', () => {
        this.config.mode = 'direct';
        this.saveConfig();
        this.render();
      });
      root.getElementById('tt-mode-schedule').addEventListener('click', () => {
        this.config.mode = 'schedule';
        this.saveConfig();
        this.render();
      });

      // Stagger Realtime Calculation
      const staggerDate = root.getElementById('tt-stagger-date');
      const staggerTime = root.getElementById('tt-stagger-time');
      const staggerInterval = root.getElementById('tt-stagger-interval');
      const btnApplyStagger = root.getElementById('tt-btn-apply-stagger');

      if (btnApplyStagger) {
        btnApplyStagger.addEventListener('click', () => {
          this.config.startDate = staggerDate.value;
          this.config.startTime = staggerTime.value;
          this.config.intervalMinutes = parseInt(staggerInterval.value, 10);
          this.calculateStagger();
          this.saveConfig();
          this.render();
          this.log("✓ Jadwal berjenjang berhasil diterapkan!", "success");
        });
      }

      // Drop Zone & File Input
      const dropZone = root.getElementById('tt-drop-zone');
      const fileInput = root.getElementById('tt-file-input');

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

      // Quick Tools
      const fileBatchCovers = root.getElementById('tt-input-batch-covers');
      root.getElementById('tt-btn-batch-cover-trigger').addEventListener('click', () => fileBatchCovers.click());
      fileBatchCovers.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          this.applyBatchCovers(Array.from(e.target.files));
          fileBatchCovers.value = '';
        }
      });

      root.getElementById('tt-btn-clean-done')?.addEventListener('click', () => this.cleanDoneVideos());
      root.getElementById('tt-btn-reset-status')?.addEventListener('click', () => this.resetAllStatus());
      root.getElementById('tt-btn-reset-schedule')?.addEventListener('click', () => this.resetAllSchedule());
      root.getElementById('tt-btn-clear-all')?.addEventListener('click', () => this.clearAllQueue());

      // Card Actions
      root.querySelectorAll('.tt-card').forEach(card => {
        const index = parseInt(card.dataset.index, 10);

        // Delete single card
        card.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
          this.videoQueue.splice(index, 1);
          this.saveConfig();
          this.render();
        });

        // Edit Date / Time
        card.querySelector('[data-action="edit-date"]')?.addEventListener('change', (e) => {
          this.videoQueue[index].scheduledDate = e.target.value;
          this.saveConfig();
        });
        card.querySelector('[data-action="edit-time"]')?.addEventListener('change', (e) => {
          this.videoQueue[index].scheduledTime = e.target.value;
          this.saveConfig();
        });

        // Select Cover
        card.querySelector('[data-action="select-cover"]')?.addEventListener('change', (e) => {
          if (e.target.files && e.target.files[0]) {
            const cover = e.target.files[0];
            this.videoQueue[index].coverFile = cover;
            const reader = new FileReader();
            reader.onload = (re) => {
              this.videoQueue[index].coverPreviewUrl = re.target.result;
              this.saveConfig();
              this.render();
            };
            reader.readAsDataURL(cover);
          }
        });
      });

      // Settings Fields
      root.getElementById('tt-set-profile-label')?.addEventListener('input', (e) => {
        this.config.profileLabel = e.target.value;
        this.saveConfig();
        const tagBtn = root.getElementById('tt-btn-profile-tag');
        if (tagBtn) tagBtn.innerText = `🏷️ ${this.config.profileLabel || 'Akun 1'}`;
        this.updateProcessMarker(0, 0, `Siap (${this.videoQueue.length} Video)`, "🛑");
      });
      root.getElementById('tt-set-visibility')?.addEventListener('change', (e) => {
        this.config.visibility = e.target.value;
        this.saveConfig();
      });
      root.getElementById('tt-set-delay-between')?.addEventListener('change', (e) => {
        this.config.delayBetween = parseInt(e.target.value, 10) || 60;
        this.saveConfig();
      });
      root.getElementById('tt-set-autopost')?.addEventListener('change', (e) => {
        this.config.autoPost = e.target.checked;
        this.saveConfig();
      });
      root.getElementById('tt-set-comment')?.addEventListener('change', (e) => {
        this.config.allowComment = e.target.checked;
        this.saveConfig();
      });
      root.getElementById('tt-set-duet')?.addEventListener('change', (e) => {
        this.config.allowDuet = e.target.checked;
        this.saveConfig();
      });
      root.getElementById('tt-set-ai-model')?.addEventListener('change', (e) => {
        this.config.aiModel = e.target.value;
        this.saveConfig();
      });
      root.getElementById('tt-set-api-keys')?.addEventListener('change', (e) => {
        this.apiKeys = e.target.value.split('\n').map(k => k.trim()).filter(k => k.length > 5);
        if (this.gemini) this.gemini.setApiKeys(this.apiKeys);
        this.saveConfig();
      });

      // Schedule Start Mode
      root.getElementById('tt-start-mode')?.addEventListener('change', (e) => {
        this.config.startMode = e.target.value;
        this.saveConfig();
        this.render();
      });
      root.getElementById('tt-delay-minutes')?.addEventListener('change', (e) => {
        this.config.delayMinutes = parseInt(e.target.value, 10);
        this.saveConfig();
      });
      root.getElementById('tt-specific-time')?.addEventListener('change', (e) => {
        this.config.specificStartTime = e.target.value;
        this.saveConfig();
      });

      // History Clear
      root.getElementById('tt-btn-clear-history')?.addEventListener('click', async () => {
        if (confirm("Hapus seluruh riwayat upload?")) {
          this.uploadHistory = [];
          await chrome.storage.local.set({ tt_upload_history: [] });
          this.render();
        }
      });

      // Console Clear
      root.getElementById('tt-btn-clear-logs')?.addEventListener('click', async () => {
        this.systemLogs = [];
        await chrome.storage.local.set({ tt_system_logs: [] });
        const logBody = root.getElementById('tt-log-body');
        if (logBody) logBody.innerHTML = '';
      });

      // Main Action Buttons
      root.getElementById('tt-btn-start')?.addEventListener('click', () => this.handleStartClick());
      root.getElementById('tt-btn-stop')?.addEventListener('click', () => this.stopBatchExecution());
    }

    async addFiles(files) {
      for (let idx = 0; idx < files.length; idx++) {
        const file = files[idx];
        this.videoQueue.push({
          file: file,
          coverFile: null,
          coverPreviewUrl: '',
          status: 'waiting',
          scheduledDate: '',
          scheduledTime: ''
        });
      }

      if (this.config.mode === 'schedule') {
        this.calculateStagger();
      }

      await this.saveConfig();
      this.render();
      this.log(`📂 +${files.length} file video ditambahkan ke antrean! Total: ${this.videoQueue.length} video.`, "success");
    }

    calculateStagger() {
      if (!this.config.startDate || !this.config.startTime) return;

      const [startHour, startMinute] = this.config.startTime.split(':').map(Number);
      const interval = parseInt(this.config.intervalMinutes, 10) || 120;

      let currentDate = new Date(`${this.config.startDate}T${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}:00`);

      for (let i = 0; i < this.videoQueue.length; i++) {
        const item = this.videoQueue[i];
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getDate()).padStart(2, '0');
        const hours = String(currentDate.getHours()).padStart(2, '0');
        const minutes = String(currentDate.getMinutes()).padStart(2, '0');

        item.scheduledDate = `${year}-${month}-${day}`;
        item.scheduledTime = `${hours}:${minutes}`;

        currentDate = new Date(currentDate.getTime() + interval * 60000);
      }
    }

    async applyBatchCovers(files) {
      let matched = 0;
      for (let i = 0; i < this.videoQueue.length; i++) {
        const item = this.videoQueue[i];
        const videoBaseName = item.file?.name.replace(/\.[^/.]+$/, "").toLowerCase().trim();

        let coverMatch = files.find(f => {
          const coverBaseName = f.name.replace(/\.[^/.]+$/, "").toLowerCase().trim();
          return coverBaseName === videoBaseName;
        });

        if (!coverMatch && files[i]) coverMatch = files[i];

        if (coverMatch) {
          item.coverFile = coverMatch;
          item.coverPreviewUrl = await new Promise(r => {
            const reader = new FileReader();
            reader.onload = re => r(re.target.result);
            reader.readAsDataURL(coverMatch);
          });
          matched++;
        }
      }

      await this.saveConfig();
      this.render();
      this.log(`✓ ${matched} gambar sampul berhasil dipasangkan!`, "success");
    }

    async generateSingleCaptionAI(index) {
      const item = this.videoQueue[index];
      if (!item) return;

      this.log(`[AI] Membuat caption untuk video #${index + 1}...`, "info");
      const title = item.file?.name.replace(/\.[^/.]+$/, "") || "video";
      const prompt = `Buatkan caption TikTok viral, menarik, dan non-formal (bahasa gaul santai Indonesia) untuk video dengan topik: "${title}". Sertakan 3-5 hashtag relevan seperti #fyp #viral #trending. Hanya kembalikan teks caption saja tanpa tanda kutip.`;

      try {
        if (!this.gemini) throw new Error("Gemini Engine belum siap.");
        const caption = await this.gemini.generateText(prompt, this.config.aiModel);
        if (caption) {
          item.customCaption = caption.trim();
          await this.saveConfig();
          this.render();
          this.log(`[AI] ✓ Caption video #${index + 1} selesai!`, "success");
        }
      } catch (err) {
        this.log(`[AI] ⚠️ Gagal AI: ${err.message}`, "warn");
      }
    }

    async generateAllCaptionsAI() {
      const pending = this.videoQueue.filter(v => v.status === 'waiting');
      if (pending.length === 0) return;

      this.log(`[AI] Memproses ${pending.length} video dengan Gemini AI...`, "info");
      for (let i = 0; i < this.videoQueue.length; i++) {
        if (this.videoQueue[i].status === 'waiting') {
          await this.generateSingleCaptionAI(i);
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      this.log("🎉 Semua caption AI selesai dibuat!", "success");
    }

    copyFirstCaptionToAll() {
      if (this.videoQueue.length <= 1) return;
      const firstCap = this.videoQueue[0].customCaption || '';
      for (let i = 1; i < this.videoQueue.length; i++) {
        this.videoQueue[i].customCaption = firstCap;
      }
      this.saveConfig();
      this.render();
      this.log("✓ Caption #1 berhasil disalin ke semua video!", "success");
    }

    cleanDoneVideos() {
      this.videoQueue = this.videoQueue.filter(v => v.status !== 'done');
      this.saveConfig();
      this.render();
      this.log("🧹 Video yang selesai berhasil dibersihkan dari antrean!", "success");
    }

    resetAllStatus() {
      this.videoQueue.forEach(v => v.status = 'waiting');
      this.saveConfig();
      this.render();
      this.log("🔄 Semua status video berhasil di-reset menjadi Menunggu.", "success");
    }

    resetAllSchedule() {
      this.videoQueue.forEach(v => {
        v.scheduledDate = '';
        v.scheduledTime = '';
      });
      this.saveConfig();
      this.render();
      this.log("🧹 Semua jadwal video berhasil dibersihkan.", "success");
    }

    async clearAllQueue() {
      if (confirm("Bersihkan seluruh antrean video dari memori?")) {
        this.videoQueue = [];
        await TTVideoDB.clearQueue();
        this.systemLogs = [];
        await chrome.storage.local.set({
          tt_queue_metadata: [],
          tt_batch_state: { isRunning: false, currentIndex: -1 },
          tt_system_logs: []
        });
        this.render();
        this.log("🗑️ Antrean video telah dibersihkan total dari memori!", "success");
      }
    }

    exportDatabaseJSON() {
      const data = {
        config: this.config,
        exportedAt: new Date().toISOString(),
        queue: this.videoQueue.map((it, idx) => ({
          id: idx,
          filename: it.file?.name || '',
          scheduledDate: it.scheduledDate || '',
          scheduledTime: it.scheduledTime || '',
          customCaption: it.customCaption || '',
          status: it.status || 'waiting'
        }))
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tiktok_automation_backup_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.log("💾 Database berhasil diexport ke file JSON!", "success");
    }

    async importDatabaseJSON(file) {
      try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (data && Array.isArray(data.queue)) {
          if (data.config) this.config = { ...this.config, ...data.config };
          this.videoQueue = data.queue.map(q => ({
            file: { name: q.filename || 'video.mp4', size: 0, isPlaceholder: true },
            coverFile: null,
            coverPreviewUrl: '',
            status: 'waiting',
            scheduledDate: q.scheduledDate || '',
            scheduledTime: q.scheduledTime || '',
            customCaption: q.customCaption || ''
          }));

          await this.saveConfig();
          this.render();
          this.log(`📥 Berhasil mengimport ${this.videoQueue.length} data video dari JSON! Silakan pilih file videonya.`, "success");
        }
      } catch (err) {
        alert("Gagal membaca file JSON: " + err.message);
      }
    }

    // 3. Execution Engine
    async handleStartClick() {
      if (this.videoQueue.length === 0) return;

      if (this.config.startMode === 'delay' || this.config.startMode === 'specific_time') {
        let delayMs = 0;
        if (this.config.startMode === 'delay') {
          delayMs = (this.config.delayMinutes || 30) * 60 * 1000;
        } else {
          const now = new Date();
          const [h, m] = (this.config.specificStartTime || '08:00').split(':').map(Number);
          const target = new Date();
          target.setHours(h, m, 0, 0);
          if (target <= now) target.setDate(target.getDate() + 1);
          delayMs = target.getTime() - now.getTime();
        }

        this.delayTargetTimestamp = Date.now() + delayMs;
        this.isDelayCountdownActive = true;
        this.log(`⏳ Menunggu waktu eksekusi: ${new Date(this.delayTargetTimestamp).toLocaleTimeString()}...`, "info");
        
        try {
          chrome.alarms.create("START_SCHEDULED_UPLOAD", { when: this.delayTargetTimestamp });
        } catch (e) {}

        this.render();
        return;
      }

      this.startBatchExecution();
    }

    async startBatchExecution() {
      if (this.isRunning || this.videoQueue.length === 0) return;

      this.isRunning = true;
      if (this.engine) this.engine.resume();
      await chrome.storage.local.set({ tt_batch_state: { isRunning: true, currentIndex: this.currentIndex } });

      const firstPending = this.videoQueue.findIndex(v => v.status === 'waiting');
      if (firstPending !== -1) {
        this.currentIndex = firstPending;
        this.render();
        this.processNextVideoInQueue();
      }
    }

    async stopBatchExecution() {
      this.isRunning = false;
      this.isProcessingLock = false;
      if (this.engine) this.engine.abort();
      await chrome.storage.local.set({ tt_batch_state: { isRunning: false, currentIndex: -1 } });
      this.updateProcessMarker(0, 0, "Otomatisasi Dihentikan", "⏹");
      this.log("⏹ Eksekusi otomatisasi dihentikan oleh pengguna.", "warn");
      this.render();
    }

    async processNextVideoInQueue() {
      if (!this.isRunning || this.isProcessingLock) return;

      const index = this.videoQueue.findIndex(v => v.status === 'waiting');
      if (index === -1) {
        this.isRunning = false;
        await chrome.storage.local.set({ tt_batch_state: { isRunning: false, currentIndex: -1 } });
        this.updateProcessMarker(0, 0, "Semua Video Selesai", "🎉");
        this.log("🎉 SEMUA VIDEO DALAM ANTREAN SELESAI!", "success");
        this.render();
        return;
      }

      this.isProcessingLock = true;
      let item = this.videoQueue[index];
      this.currentIndex = index;
      await chrome.storage.local.set({ tt_batch_state: { isRunning: true, currentIndex: index } });

      // Validasi File Binary
      if (!item.file || !(item.file instanceof File || item.file instanceof Blob) || item.file.isPlaceholder) {
        this.isProcessingLock = false;
        this.isRunning = false;
        item.status = 'waiting';
        await chrome.storage.local.set({ tt_batch_state: { isRunning: false, currentIndex: -1 } });
        this.updateProcessMarker(0, 0, `File #${index + 1} Hilang`, "⚠️");
        this.render();
        alert(`File video #${index + 1} ('${item.file?.name || ''}') belum memiliki file binary lokal.\n\nSilakan seret atau masukkan file videonya langsung ke dropzone di atas.`);
        return;
      }

      item.status = 'active';
      item.currentStepText = '📤 [1/6] Menyiapkan Form...';
      this.render();
      await TTVideoDB.saveQueue(this.videoQueue);

      const isScheduled = this.config.mode === 'schedule';
      const targetDate = isScheduled ? (item.scheduledDate || this.config.startDate) : "";
      const targetTime = isScheduled ? (item.scheduledTime || this.config.startTime) : "";
      const modeLabel = isScheduled ? `Jadwal: ${targetDate} ${targetTime}` : `⚡ Mode: Langsung Post (Posting Sekarang)`;
      this.log(`[${index + 1}/${this.videoQueue.length}] Mulai: ${item.file?.name} (${modeLabel})`, "info");

      try {
        // 1. Form Upload Siap
        this.updateProcessMarker(1, 6, "Menyiapkan Form Upload", "📤");
        await this.engine.ensureUploadReady(35000, (msg, lvl) => this.log(`[${index + 1}/${this.videoQueue.length}] ${msg}`, lvl));

        // 2. Inject File Video
        this.updateProcessMarker(2, 6, "Memasukkan File Video", "📁");
        await this.engine.injectFile(item.file, (msg, lvl) => this.log(`[${index + 1}/${this.videoQueue.length}] ${msg}`, lvl));

        // 3. Tunggu Form Editor & Thumbnail
        this.updateProcessMarker(3, 6, "Menunggu Thumbnail & Editor", "🖼️");
        await this.engine.waitForFormReady(45000, (msg, lvl) => this.log(`[${index + 1}/${this.videoQueue.length}] ${msg}`, lvl));

        // 4. Caption Otomatis Bawaan Nama File (Zero Touch)
        this.log(`[${index + 1}/${this.videoQueue.length}] ✓ Menggunakan caption & hashtag nama file bawaan TikTok.`, "info");

        // 4.5. Custom Cover
        if (item.coverFile) {
          try {
            await this.engine.uploadCustomCover(item.coverFile, (msg, lvl) => this.log(`[${index + 1}/${this.videoQueue.length}] ${msg}`, lvl));
          } catch (coverErr) {
            this.log(`[${index + 1}/${this.videoQueue.length}] ⚠️ Info Sampul: ${coverErr.message}. Melanjutkan...`, "warn");
          }
        }

        // 5. Konfigurasi Jadwal vs Langsung Post
        if (isScheduled) {
          this.updateProcessMarker(4, 6, `Mengatur Jadwal (${targetDate} ${targetTime})`, "📅");
        } else {
          this.updateProcessMarker(4, 6, "Mode: Posting Sekarang (Langsung)", "⚡");
        }
        await this.engine.configureSchedule({
          isScheduled: isScheduled,
          scheduleDate: targetDate,
          scheduleTime: targetTime
        }, (msg, lvl) => this.log(`[${index + 1}/${this.videoQueue.length}] ${msg}`, lvl));

        // 6. Konfigurasi Setelan
        await this.engine.configureSettings({
          visibility: this.config.visibility,
          allowComment: this.config.allowComment,
          allowDuet: this.config.allowDuet,
          allowStitch: this.config.allowDuet
        }, (msg, lvl) => this.log(`[${index + 1}/${this.videoQueue.length}] ${msg}`, lvl));

        // 7. Polling Upload 100%
        this.updateProcessMarker(5, 6, "Memantau Polling Upload 100%", "📊");
        await this.engine.pollUploadProgress(300000, (msg, lvl) => this.log(`[${index + 1}/${this.videoQueue.length}] ${msg}`, lvl));

        // 8. Auto Post
        if (this.config.autoPost) {
          this.updateProcessMarker(6, 6, "Mengeksekusi Tombol Post", "🚀");
          const postSuccess = await this.engine.triggerPostClick((msg, lvl) => this.log(`[${index + 1}/${this.videoQueue.length}] ${msg}`, lvl));
          if (!postSuccess) throw new Error("Gagal mengklik tombol Post.");

          const finalSuccess = await this.engine.verifyPostSuccess(60000, (msg, lvl) => this.log(`[${index + 1}/${this.videoQueue.length}] ${msg}`, lvl));
          if (!finalSuccess) {
            item.status = 'skipped';
            item.currentStepText = '⚠️ Upload dibatasi / skipped';
            this.updateProcessMarker(6, 6, "Upload Dibatasi (Skipped)", "⚠️");
            this.log(`[${index + 1}/${this.videoQueue.length}] ⚠️ Upload dibatasi / skipped.`, "warn");
          } else {
            item.status = 'done';
            item.currentStepText = isScheduled ? `✓ Terjadwal: ${targetTime}` : '✓ Sukses Diposting!';
            this.updateProcessMarker(6, 6, isScheduled ? `✓ Sukses (${targetTime})` : `✓ Sukses Diposting`, "✓");
            this.log(`[${index + 1}/${this.videoQueue.length}] ✓ SUKSES DIPOSTING (${isScheduled ? 'Terjadwal' : 'Langsung'})!`, "success");
          }
        } else {
          item.status = 'done';
          item.currentStepText = '✓ Form Siap';
          this.updateProcessMarker(6, 6, "✓ Form Siap", "✓");
          this.log(`[${index + 1}/${this.videoQueue.length}] ✓ Form siap (Auto-Post dinonaktifkan).`, "success");
        }

        await this.recordUploadHistory(item, item.status, "Sukses diproses");

      } catch (err) {
        if (err.message === "Otomatisasi dihentikan." || this.engine.isAborted) {
          this.log("⏹ Otomatisasi dihentikan.", "warn");
          item.status = 'waiting';
          item.currentStepText = '⏹ Dihentikan';
          this.updateProcessMarker(0, 0, "Otomatisasi Dihentikan", "⏹");
        } else {
          this.log(`[${index + 1}/${this.videoQueue.length}] ✕ Error: ${err.message}`, "error");
          item.status = 'error';
          item.currentStepText = `✕ Error: ${err.message}`;
          this.updateProcessMarker(0, 0, `✕ Error: ${err.message}`, "✕");
          await this.recordUploadHistory(item, 'error', err.message);
        }
      } finally {
        this.isProcessingLock = false;
        this.render();
        await TTVideoDB.saveQueue(this.videoQueue);

        if (this.isRunning) {
          const delaySec = this.config.delayBetween || 60;
          this.updateProcessMarker(0, 0, `Jeda ${delaySec}s (Next: #${index + 2})`, "⏸️");
          this.log(`⏳ Menunggu jeda ${delaySec} detik sebelum video berikutnya...`, "info");
          await this.engine.sleep(delaySec * 1000);

          if (this.isRunning) {
            await this.engine.resetForNextVideo((msg, lvl) => this.log(msg, lvl));
            await this.engine.sleep(2500);

            if (this.isRunning && !this.isProcessingLock) {
              this.processNextVideoInQueue();
            }
          }
        }
      }
    }

    async recordUploadHistory(item, status, details = "") {
      try {
        const now = new Date();
        const record = {
          id: Date.now(),
          uploadedAt: now.toLocaleDateString() + ' ' + now.toLocaleTimeString(),
          filename: item.file?.name || 'video.mp4',
          scheduledDate: item.scheduledDate || '',
          scheduledTime: item.scheduledTime || '',
          caption: item.customCaption || item.file?.name || '',
          status: status,
          details: details
        };

        this.uploadHistory.unshift(record);
        if (this.uploadHistory.length > 200) this.uploadHistory.pop();
        await chrome.storage.local.set({ tt_upload_history: this.uploadHistory });
      } catch (e) {}
    }

    setupAlarms() {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === "TRIGGER_BATCH_START") {
          this.log("⏰ Sinyal alarm background diterima: Memulai upload batch...", "info");
          this.startBatchExecution();
        }
      });
    }

    setupUrlWatcher() {
      const checkUrl = () => {
        const currentUrl = window.location.href;
        if (currentUrl !== this.lastObservedUrl) {
          this.lastObservedUrl = currentUrl;
          if (this.isRunning && !this.isProcessingLock) {
            if (currentUrl.includes('/content') || currentUrl.includes('manage')) {
              const nextPending = this.videoQueue.findIndex(v => v.status === 'waiting');
              if (nextPending !== -1) {
                setTimeout(() => this.processNextVideoInQueue(), 2500);
              }
            }
          }
        }
      };

      window.addEventListener('popstate', checkUrl);
      window.addEventListener('hashchange', checkUrl);
      setInterval(checkUrl, 1000);
    }
  }

  // Initialize when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new TikTokStudioHUD());
  } else {
    new TikTokStudioHUD();
  }

})();
