# Chrome Web Store Listing: TikTok Studio Auto Uploader Pro

## Store Listing Metadata

- **Name**: TikTok Studio Auto Uploader Pro
- **Short Name**: TT Auto Uploader
- **Version**: 1.0.0
- **Category**: Productivity / Social & Communication
- **Default Language**: Indonesian (Bahasa Indonesia)

### Short Description (Max 132 chars)
Otomatisasi batch upload video massal ke TikTok Studio dengan antrean file, simulasi ketikan natural, caption, hashtag & jeda aman.

### Detailed Description
Tingkatkan efisiensi dan produktivitas konten kreator dengan TikTok Studio Auto Uploader Pro! 

Ekstensi ini dirancang khusus untuk membantu kreator, agensi, dan affiliate marketer mengunggah puluhan video sekaligus ke TikTok Studio Web secara 100% otomatis, aman, dan tanpa repot.

Fitur Unggulan:
- 🚀 Batch Multi-Video Upload: Pilih puluhan video (.mp4, .mov, .webm) sekaligus melalui drag-and-drop.
- 🎯 In-Page Floating Control Center: Panel kendali melayang modern langsung di halaman TikTok Studio yang bisa digeser dan diminimalkan.
- ✍️ Natural Human-like Typing: Simulasi ketikan manusia per karakter untuk caption dan hashtag guna meminimalisir deteksi bot.
- 🔒 Kontrol Privasi & Interaksi: Atur izin Komentar, Duet, Stitch, serta visibilitas Publik/Teman/Privat untuk masing-masing video.
- ⏳ Smart Safety Delay: Jeda acak terkonfigurasi (45-90 detik) antar video untuk menjaga kesehatan dan keamanan akun Anda.
- 🔔 Notifikasi & Suara Chime: Notifikasi visual dan audio saat seluruh proses batch upload selesai.
- 💾 Ekspor/Impor JSON: Simpan dan gunakan kembali preset antrean metadata.

### Permissions Justification
- `storage`: Digunakan untuk menyimpan pengaturan preferensi pengguna (jeda acak, visibilitas default, status panel) dan antrean metadata secara lokal.
- `tabs`: Digunakan untuk mendeteksi dan membuka tab TikTok Studio Upload saat pengguna menekan tombol buka pada popup.
- `alarms`: Digunakan untuk mengatur timer hitung mundur jeda aman antar upload.
- `notifications`: Digunakan untuk mengirimkan notifikasi sistem ketika seluruh antrean batch video berhasil diunggah.
- `host_permissions` (`*://*.tiktok.com/*`): Diperlukan agar content script dapat berinteraksi dengan form upload di halaman resmi TikTok Studio.

### Privacy & Data Use
- Ekstensi ini TIDAK mengumpulkan, menyimpan, atau mentransmisikan data pribadi pengguna ke server eksternal mana pun.
- Seluruh proses otomatisasi berjalan 100% secara lokal pada browser pengguna.
