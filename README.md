# Database Peliputan — Search Engine & Kegiatan Dashboard

Website portal pencarian database kegiatan peliputan resmi Kementerian PKP yang terhubung **secara realtime dengan Google Sheets**, dibangun dengan estetika mewah, modern brutalist-minimal, dan animasi kinetic typography khas **[Tubik Studio](https://tubikstudio.com)**.

🔗 **Sumber Google Sheets:** [Database Peliputan (Google Sheets)](https://docs.google.com/spreadsheets/d/13dg8qLpGKshNHZ0LMofiWHU17UIeoSgQU4Y34uj4ZF8/edit?usp=sharing)

---

## 🚀 Fitur Utama

### 1. 🔍 Search Engine Database Super Cepat (Zero Latency)
- **Instant Live Search**: Hasil muncul seketika saat Anda mengetik (tanpa reload / jeda).
- **Multi-field Matching**: Mencari berdasarkan nama kegiatan, topik, nomor urut, lokasi wilayah (contoh: *Bali, Meikarta, Bandung, Singkawang*), nama petugas, atau tanggal.
- **Keyword Highlighting**: Kata kunci yang dicocokkan otomatis diberi highlight visual yang elegan.
- **Pill Filters**: Filter cepat satu klik untuk:
  - *Semua Data*
  - *📰 Ada Berita (Portal PKP.go.id)*
  - *🎬 Ada Video (Instagram)*
  - *DKI Jakarta, Jawa Barat, Bali, Kalimantan, Sumatera*
  - *Filter per Bulan (Maret 2026, Februari 2026, Januari 2026)*
- **Sort Options**: Berdasarkan nomor urut, tanggal terbaru &rarr; terlama, terlama &rarr; terbaru, dan alfabetik A-Z.
- **Keyboard Shortcut**: Tekan tombol `/` di keyboard untuk langsung memfokuskan kursor ke kolom pencarian.

### 2. 🎴 Kartu Kegiatan Bergaya Tubik Studio
- Sudut membulat mewah (*rounded-lg*), elevasi hover dinamis, dan tipografi display berani (*Space Grotesk* & *Plus Jakarta Sans*).
- Nomor badge `#01` - `#94+`.
- Badge tanggal berikon kalender.
- Tag lokasi berikon pin peta.
- Tombol tautan langsung ke **Portal Berita PKP.go.id** (jika ada).
- Tombol tautan langsung ke **Video Dokumentasi Instagram** (jika ada).
- Info nama petugas peliputan.
- **Detail Modal / Drawer**: Klik kartu untuk membuka popup detail lengkap, termasuk opsi **"Salin Ringkasan Kegiatan"** yang siap ditempel ke WhatsApp / memo kedinasan!

### 3. 📊 Dashboard Analitik & Visualisasi
- **Statistik Utama**:
  - Total Kegiatan Terdata
  - Jumlah Wilayah / Kabupaten / Kota Unik
  - Persentase & Jumlah Publikasi Berita
  - Persentase & Jumlah Publikasi Video
- **Grafik Batang Interaktif**: Volume kegiatan per bulan (Januari, Februari, Maret 2026).
- **Progress Bar Wilayah Teratas**: Sebaran 5 provinsi/kota peliputan paling aktif.

### 4. 📥 Export Data Multi-Format
- **Unduh Format CSV**: Format standar komputasi data.
- **Unduh Format Excel (.csv UTF-8 BOM)**: Siap buka langsung di Microsoft Excel tanpa error karakter/tanda baca.
- **Unduh Format JSON**: Format data terstruktur siap integrasi API.
- **Cetak / Simpan PDF**: Layout cetak bersih *print-friendly* untuk laporan pimpinan.
- **Tabel Pratinjau**: Tabel lengkap 94+ baris dengan sticky header dan tautan aktif.

### 5. ⚡ Realtime Link dengan Google Sheets
- Terhubung otomatis dengan Google Sheets menggunakan Google Visualization API.
- Tombol **"Sinkronkan Sekarang"** untuk menarik data terbaru jika ada penambahan baris di Google Sheets.
- **Dual Layer Architecture**: Data awal tertanam (*offline cache*) sehingga website terbuka **0 milidetik** tanpa pernah layar putih/kosong, lalu secara otomatis memeriksa pembaruan di latar belakang.

---

## 💻 Cara Menjalankan Proyek

### Cara 1: Buka Langsung di Browser (Paling Mudah)
Cukup klik ganda (*double-click*) file:
```
/Users/michael/.gemini/antigravity/scratch/tubik-studio/index.html
```
Atau jalankan perintah ini di Terminal Mac:
```bash
open /Users/michael/.gemini/antigravity/scratch/tubik-studio/index.html
```

### Cara 2: Menjalankan Local Web Server
```bash
cd /Users/michael/.gemini/antigravity/scratch/tubik-studio
python3 -m http.server 3000
```
Buka browser di: **`http://localhost:3000`**

---

## 📁 Struktur File Proyek

```
tubik-studio/
├── index.html         # Struktur semantik HTML5 (Search Engine, Dashboard, Export, Modal)
├── css/
│   └── style.css      # Design system Tubik Studio, cards, charts, export, responsif
├── js/
│   ├── data.js        # Konfigurasi Google Sheets & 94 database awal kegiatan
│   └── app.js         # Logika realtime sync, search engine, modal, charts, export
├── package.json       # Script lokal
└── README.md          # Dokumentasi proyek
```
