# TikTok Studio Auto Uploader Pro (Chrome Extension Manifest V3)

Ekstensi Google Chrome resmi untuk otomatisasi upload video massal (batch upload) ke [TikTok Studio](https://www.tiktok.com/tiktokstudio/upload?from=webapp&tab=video).

## 🚀 Fitur Utama

- **100% Native Chrome Environment**: Menggunakan sesi login akun TikTok asli di Google Chrome tanpa bot webdriver flags.
- **In-Page Floating Control Panel**: UI melayang bergaya dark-mode TikTok yang draggable dan responsif.
- **Batch Video Queue**: Dukungan input puluhan video (.mp4, .mov, .webm) via file picker atau drag & drop.
- **Human-like Typing Simulation**: Ketikan caption dan hashtag per karakter dengan delay acak natural.
- **Privacy & Interaction Controller**: Pengaturan otomatis visibilitas (Public, Friends, Private) dan switch Komentar/Duet/Stitch.
- **Smart Upload & Copyright Polling**: Mendeteksi status 100% upload dan pengecekan hak cipta sebelum mempublikasikan.
- **Safety Interval Delay Countdown**: Jeda aman acak terukur antar video (45s - 90s) dengan animasi countdown interaktif.
- **Audio Chime & Windows Notification**: Pemberitahuan otomatis ketika seluruh batch video selesai diunggah.
- **Export & Import JSON**: Simpan dan muat preset antrean metadata dalam format JSON.

## 📁 Struktur Proyek

```text
tiktok-automation/
├── manifest.json            # Manifest V3 Configuration
├── background.js           # Background Service Worker
├── icons/                  # High-Resolution Extension Icons
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── popup/                  # Extension Toolbar Popup
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── content/                # In-Page Scripts & Styles
│   ├── content.css         # Dark Glassmorphic Theme
│   ├── uploader_engine.js  # DOM Automation Core Engine
│   └── content.js          # Floating Panel UI & Batch Controller
├── PANDUAN_PEMAKAIAN.md    # Panduan lengkap berbahasa Indonesia
└── README.md
```

## 🛠️ Cara Pasang di Google Chrome

1. Buka `chrome://extensions` di Google Chrome.
2. Aktifkan **Developer mode** di pojok kanan atas.
3. Klik **Load unpacked** di pojok kiri atas.
4. Pilih folder `C:\Users\NCN0C\Videos\tiktok-automation`.
5. Buka [TikTok Studio Upload](https://www.tiktok.com/tiktokstudio/upload?from=webapp&tab=video) dan panel otomasi akan langsung muncul!
