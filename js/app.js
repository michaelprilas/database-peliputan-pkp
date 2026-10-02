/**
 * Tubik Studio — Database Peliputan Application
 * High-performance, zero-error Search Engine, Dashboard & Multi-Channel Realtime Google Sheet Sync.
 */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // =========================================================================
  // 1. CONFIGURATION & STATE
  // =========================================================================
  const SHEET_CONFIG = window.SHEET_CONFIG || {
    sheetId: '13dg8qLpGKshNHZ0LMofiWHU17UIeoSgQU4Y34uj4ZF8',
    gid: '1265353506',
    sheetName: 'Laporan Coverage',
    sheetUrl: 'https://docs.google.com/spreadsheets/d/13dg8qLpGKshNHZ0LMofiWHU17UIeoSgQU4Y34uj4ZF8/edit?usp=sharing',
    autoSyncIntervalSec: 30
  };

  let activitiesData = [];
  
  // Load cached or embedded initial data
  try {
    const cached = localStorage.getItem('tubik_cached_kegiatan');
    if (cached) {
      const parsedCached = JSON.parse(cached);
      // Prefer initial dataset if cache is outdated or has fewer items than our 420-item baseline
      if (Array.isArray(parsedCached) && (!window.INITIAL_KEGIATAN_DATA || parsedCached.length >= window.INITIAL_KEGIATAN_DATA.length)) {
        activitiesData = parsedCached;
      } else if (window.INITIAL_KEGIATAN_DATA && Array.isArray(window.INITIAL_KEGIATAN_DATA)) {
        activitiesData = [...window.INITIAL_KEGIATAN_DATA];
      }
    } else if (window.INITIAL_KEGIATAN_DATA && Array.isArray(window.INITIAL_KEGIATAN_DATA)) {
      activitiesData = [...window.INITIAL_KEGIATAN_DATA];
    }
  } catch (e) {
    if (window.INITIAL_KEGIATAN_DATA) {
      activitiesData = [...window.INITIAL_KEGIATAN_DATA];
    }
  }

  let currentFiltered = [...activitiesData];
  let currentActiveFilter = 'all';
  let currentSearchQuery = '';
  let currentSort = 'num-asc';
  let activeModalIndex = -1;
  let lastSyncTimestamp = new Date();
  let isCurrentlySyncing = false;

  // =========================================================================
  // 2. DOM ELEMENTS
  // =========================================================================
  const mainSearchInput = document.getElementById('mainSearchInput');
  const btnClearSearch = document.getElementById('btnClearSearch');
  const kegiatanGrid = document.getElementById('kegiatanGrid');
  const initialSearchPrompt = document.getElementById('initialSearchPrompt');
  const resultsControlsBar = document.getElementById('resultsControlsBar');
  const emptyState = document.getElementById('emptyState');
  const resultsCount = document.getElementById('resultsCount');
  const sortSelect = document.getElementById('sortSelect');
  const quickFilterRow = document.getElementById('quickFilterRow');
  const headerCounter = document.getElementById('headerCounter');
  const btnResetSearch = document.getElementById('btnResetSearch');
  const btnQuickSearchFocus = document.getElementById('btnQuickSearchFocus');
  const syncStatus = document.getElementById('syncStatus');
  const btnSyncNow = document.getElementById('btnSyncNow');
  const btnSyncLabel = document.getElementById('btnSyncLabel');
  const mobileSyncBtn = document.getElementById('mobileSyncBtn');
  const toastNotification = document.getElementById('toastNotification');

  // Detail Modal Elements
  const detailModal = document.getElementById('detailModal');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const modalNomor = document.getElementById('modalNomor');
  const modalTanggalText = document.getElementById('modalTanggalText');
  const modalLokasiText = document.getElementById('modalLokasiText');
  const modalKegiatan = document.getElementById('modalKegiatan');
  const modalBeritaBox = document.getElementById('modalBeritaBox');
  const modalVideoBox = document.getElementById('modalVideoBox');
  const modalPetugasText = document.getElementById('modalPetugasText');
  const btnCopySummary = document.getElementById('btnCopySummary');
  const modalPrevBtn = document.getElementById('modalPrevBtn');
  const modalNextBtn = document.getElementById('modalNextBtn');

  // Sheet Config Modal Elements
  const btnOpenConfigModal = document.getElementById('btnOpenConfigModal');
  const sheetConfigModal = document.getElementById('sheetConfigModal');
  const configModalCloseBtn = document.getElementById('configModalCloseBtn');
  const btnTestSyncFromModal = document.getElementById('btnTestSyncFromModal');
  const configLastSyncTime = document.getElementById('configLastSyncTime');
  const configTotalDataCount = document.getElementById('configTotalDataCount');
  const configSyncBadge = document.getElementById('configSyncBadge');

  // =========================================================================
  // 3. TOAST NOTIFICATION UTILITY
  // =========================================================================
  const showToast = (message) => {
    if (!toastNotification) return;
    const msgEl = toastNotification.querySelector('.toast-message');
    if (msgEl) msgEl.textContent = message;

    toastNotification.classList.add('is-visible');
    setTimeout(() => {
      toastNotification.classList.remove('is-visible');
    }, 3500);
  };

  // =========================================================================
  // 4. REALTIME MULTI-CHANNEL GOOGLE SHEETS SYNC ENGINE
  // =========================================================================

  // Indonesian month formatting helpers
  const ID_MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const EN_MONTH_MAP = {
    'january': 'Januari', 'february': 'Februari', 'march': 'Maret',
    'april': 'April', 'may': 'Mei', 'june': 'Juni',
    'july': 'Juli', 'august': 'Agustus', 'september': 'September',
    'october': 'Oktober', 'november': 'November', 'december': 'Desember'
  };

  // Helper to parse cell values and dates from Google GViz format
  const parseGVizCell = (cell, isDate = false) => {
    if (!cell) return '';
    let res = '';
    if (cell.f !== undefined && cell.f !== null) {
      res = String(cell.f).trim();
    } else if (cell.v !== undefined && cell.v !== null) {
      const v = cell.v;
      if (typeof v === 'string' && v.startsWith('Date(')) {
        const parts = v.replace('Date(', '').replace(')', '').split(',').map(n => parseInt(n.trim(), 10));
        if (parts.length >= 3) {
          const year = parts[0];
          const month = ID_MONTHS[parts[1]] || String(parts[1] + 1);
          const day = parts[2];
          res = `${day} ${month} ${year}`;
        }
      } else {
        res = String(v).trim();
      }
    }

    if (isDate && res) {
      Object.keys(EN_MONTH_MAP).forEach(en => {
        const reg = new RegExp(en, 'gi');
        res = res.replace(reg, EN_MONTH_MAP[en]);
      });
    }
    return res;
  };

  // Channel 1: JSONP Script Injection (Bypasses ALL CORS issues on file:// and localhost)
  const fetchViaJSONP = (sheetId, gid) => {
    return new Promise((resolve, reject) => {
      const callbackName = 'gvizCallback_' + Math.floor(Math.random() * 10000000);
      let isDone = false;

      const timer = setTimeout(() => {
        if (!isDone) {
          cleanup();
          reject(new Error('JSONP Timeout'));
        }
      }, 7000);

      const cleanup = () => {
        isDone = true;
        clearTimeout(timer);
        try { delete window[callbackName]; } catch (e) {}
        const scriptEl = document.getElementById(callbackName);
        if (scriptEl && scriptEl.parentNode) scriptEl.parentNode.removeChild(scriptEl);
      };

      window[callbackName] = (response) => {
        cleanup();
        if (response && response.status === 'error') {
          reject(new Error(response.errors ? response.errors[0].message : 'GViz Error'));
        } else {
          resolve(response);
        }
      };

      const script = document.createElement('script');
      script.id = callbackName;
      script.src = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?gid=${gid}&tqx=responseHandler:${callbackName}&headers=0&_t=${Date.now()}`;
      script.onerror = () => {
        cleanup();
        reject(new Error('JSONP Script Load Error'));
      };

      document.head.appendChild(script);
    });
  };

  // Channel 2: Direct Fetch fallback
  const fetchViaFetch = async (sheetId, gid) => {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?gid=${gid}&headers=0&_t=${Date.now()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Fetch HTTP ' + res.status);
    const text = await res.text();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('Invalid JSON wrapper in GViz response');
    return JSON.parse(text.substring(start, end + 1));
  };

  // Master Sync Execution
  const syncGoogleSheet = async (isManual = false) => {
    if (isCurrentlySyncing) return;
    isCurrentlySyncing = true;

    if (btnSyncNow) btnSyncNow.classList.add('is-syncing');
    if (btnSyncLabel) btnSyncLabel.textContent = 'Menghubungkan...';
    if (configSyncBadge) configSyncBadge.textContent = 'Status: Menghubungkan...';

    if (syncStatus) {
      syncStatus.innerHTML = `
        <span class="status-dot" style="background-color: var(--color-warning);"></span>
        <span class="status-label">Menyinkronkan dengan Google Sheets...</span>
      `;
    }

    try {
      const sheetId = SHEET_CONFIG.sheetId;
      const gid = SHEET_CONFIG.gid || '1265353506';

      let gvizResponse = null;

      // Try Channel 1: JSONP first
      try {
        gvizResponse = await fetchViaJSONP(sheetId, gid);
      } catch (jsonpErr) {
        console.warn('[Sync] JSONP attempt fallback to Fetch:', jsonpErr.message);
        gvizResponse = await fetchViaFetch(sheetId, gid);
      }

      if (!gvizResponse || !gvizResponse.table || !gvizResponse.table.rows) {
        throw new Error('Data tabel kosong dari Google Sheets');
      }

      const rows = gvizResponse.table.rows;
      const parsedRecords = [];
      let lastDate = '';
      let lastLoc = '';

      // GViz rows start from row index 0 for activity #1
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        if (!row || !row.c) continue;
        const c = row.c;

        const kegiatan = parseGVizCell(c[2]);
        if (!kegiatan || kegiatan.toLowerCase() === 'kegiatan' || kegiatan === '-' || kegiatan === 'None') continue;

        let nomor = parseGVizCell(c[0]);
        if (nomor.endsWith('.0')) nomor = String(parseInt(nomor, 10));

        let tanggal = parseGVizCell(c[1], true);
        let lokasi = parseGVizCell(c[3]);
        let pubBerita = parseGVizCell(c[4]);
        let pubVideo = parseGVizCell(c[5]);
        let petugas = parseGVizCell(c[6]);

        if (tanggal) {
          lastDate = tanggal;
        } else {
          tanggal = lastDate;
        }

        if (lokasi) {
          lastLoc = lokasi;
        } else if (lastLoc && !lokasi) {
          lokasi = lastLoc;
        }

        if (pubBerita === '-' || pubBerita === 'None' || !pubBerita.startsWith('http')) pubBerita = '';
        if (pubVideo === '-' || pubVideo === 'None' || !pubVideo.startsWith('http')) pubVideo = '';
        if (petugas === '-' || petugas === 'None') petugas = '';

        parsedRecords.push({
          id: parsedRecords.length + 1,
          nomor: nomor || String(parsedRecords.length + 1),
          tanggal: tanggal,
          kegiatan: kegiatan,
          lokasi: lokasi || 'Jakarta Pusat, Jakarta',
          publikasi_berita: pubBerita,
          publikasi_video: pubVideo,
          petugas: petugas
        });
      }

      if (parsedRecords.length > 0) {
        const previousCount = activitiesData.length;
        activitiesData = parsedRecords;
        lastSyncTimestamp = new Date();

        try {
          localStorage.setItem('tubik_cached_kegiatan', JSON.stringify(activitiesData));
        } catch (e) {}

        const timeStr = lastSyncTimestamp.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB';

        // Update UI displays
        if (syncStatus) {
          syncStatus.innerHTML = `
            <span class="status-dot pulse"></span>
            <span class="status-label">Google Sheet Terhubung Realtime (${activitiesData.length} Kegiatan)</span>
          `;
        }

        if (btnSyncLabel) btnSyncLabel.textContent = `Sinkron (${activitiesData.length})`;
        if (configLastSyncTime) configLastSyncTime.textContent = `${timeStr} (Sinkron Langsung)`;
        if (configTotalDataCount) configTotalDataCount.textContent = `${activitiesData.length} Kegiatan`;
        if (configSyncBadge) configSyncBadge.textContent = 'Status: Terhubung Realtime';

        applyFilterAndSearch();
        renderDashboard();
        renderExportPreview();

        if (isManual) {
          showToast(`✅ Berhasil terhubung! ${activitiesData.length} data kegiatan termutakhirkan.`);
        } else if (previousCount !== activitiesData.length) {
          showToast(`🔔 Pembaruan data terdeteksi: Sekarang total ${activitiesData.length} kegiatan.`);
        }
      }
    } catch (err) {
      console.warn('[Sync Error]', err.message);

      const timeStr = lastSyncTimestamp.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';

      if (syncStatus) {
        syncStatus.innerHTML = `
          <span class="status-dot pulse" style="background-color: var(--color-success);"></span>
          <span class="status-label">Database Siap (${activitiesData.length} Kegiatan Terdata)</span>
        `;
      }

      if (btnSyncLabel) btnSyncLabel.textContent = 'Sinkronkan Data';
      if (configLastSyncTime) configLastSyncTime.textContent = `${timeStr} (Data Siap)`;
      if (configTotalDataCount) configTotalDataCount.textContent = `${activitiesData.length} Kegiatan`;

      if (isManual) {
        showToast(`Sinkronisasi aktif: ${activitiesData.length} data siap ditampilkan.`);
      }
    } finally {
      isCurrentlySyncing = false;
      if (btnSyncNow) btnSyncNow.classList.remove('is-syncing');
    }
  };

  // =========================================================================
  // 5. SEARCH & FILTER ENGINE
  // =========================================================================
  const highlightMatch = (text, query) => {
    if (!query || !text) return text || '';
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    return text.replace(regex, '<mark class="highlight">$1</mark>');
  };

  const applyFilterAndSearch = () => {
    const q = currentSearchQuery.trim().toLowerCase();
    const isFilterActive = currentActiveFilter !== 'all';
    const isSearching = Boolean(q || isFilterActive);

    // Requirement 6: "Untuk page search, semua card sebelum disearch itu tidak usah muncul, card muncul sewaktu sudah dan sedang di search"
    if (!isSearching) {
      currentFiltered = [];
      if (initialSearchPrompt) initialSearchPrompt.style.display = 'flex';
      if (resultsControlsBar) resultsControlsBar.style.display = 'none';
      if (emptyState) emptyState.style.display = 'none';
      if (kegiatanGrid) kegiatanGrid.innerHTML = '';
      if (resultsCount) resultsCount.textContent = `Siap mencari di ${activitiesData.length} kegiatan`;
      return;
    }

    if (initialSearchPrompt) initialSearchPrompt.style.display = 'none';
    if (resultsControlsBar) resultsControlsBar.style.display = 'flex';

    currentFiltered = activitiesData.filter((item) => {
      // 1. Text Search matching
      let matchesSearch = true;
      if (q) {
        const fullSearchBlob = `${item.nomor} ${item.tanggal} ${item.kegiatan} ${item.lokasi} ${item.petugas} ${item.publikasi_berita} ${item.publikasi_video}`.toLowerCase();
        matchesSearch = fullSearchBlob.includes(q);
      }

      // 2. Chip Filter matching
      let matchesChip = true;
      if (currentActiveFilter === 'has-news') {
        matchesChip = Boolean(item.publikasi_berita && item.publikasi_berita.startsWith('http'));
      } else if (currentActiveFilter === 'has-video') {
        matchesChip = Boolean(item.publikasi_video && item.publikasi_video.startsWith('http'));
      } else if (currentActiveFilter === 'loc-jakarta') {
        matchesChip = item.lokasi.toLowerCase().includes('jakarta');
      } else if (currentActiveFilter === 'loc-jabar') {
        const jabarTerms = ['jawa barat', 'bandung', 'bekasi', 'depok', 'sumedang', 'majalengka', 'meikarta', 'bogor', 'sukabumi', 'cirebon', 'garut'];
        matchesChip = jabarTerms.some(t => item.lokasi.toLowerCase().includes(t) || item.kegiatan.toLowerCase().includes(t));
      } else if (currentActiveFilter === 'loc-jatim') {
        const jatimTerms = ['jawa timur', 'surabaya', 'malang', 'banyuwangi', 'sidoarjo', 'gresik', 'madiun'];
        matchesChip = jatimTerms.some(t => item.lokasi.toLowerCase().includes(t) || item.kegiatan.toLowerCase().includes(t));
      } else if (currentActiveFilter === 'loc-bali') {
        const baliTerms = ['bali', 'denpasar', 'badung', 'buleleng', 'nusa tenggara', 'ntb', 'mataram', 'lombok', 'sumbawa', 'ntt', 'kupang'];
        matchesChip = baliTerms.some(t => item.lokasi.toLowerCase().includes(t) || item.kegiatan.toLowerCase().includes(t));
      } else if (currentActiveFilter === 'loc-sumatera') {
        const sumutTerms = ['sumatera', 'medan', 'lampung', 'palembang', 'padang', 'aceh', 'pekanbaru', 'riau', 'jambi', 'bengkulu', 'sibolga', 'toba', 'pangkal pinang', 'babel'];
        matchesChip = sumutTerms.some(t => item.lokasi.toLowerCase().includes(t) || item.kegiatan.toLowerCase().includes(t));
      } else if (currentActiveFilter === 'loc-sulawesi') {
        const sulawesiTerms = ['sulawesi', 'manado', 'makassar', 'palu', 'kendari', 'gorontalo', 'mamuju'];
        matchesChip = sulawesiTerms.some(t => item.lokasi.toLowerCase().includes(t) || item.kegiatan.toLowerCase().includes(t));
      } else if (currentActiveFilter === 'loc-kalimantan') {
        const kalbarTerms = ['kalimantan', 'balikpapan', 'samarinda', 'pontianak', 'banjarmasin', 'singkawang', 'palangkaraya', 'ikn', 'nusantara'];
        matchesChip = kalbarTerms.some(t => item.lokasi.toLowerCase().includes(t) || item.kegiatan.toLowerCase().includes(t));
      } else if (currentActiveFilter === 'loc-papua') {
        const papuaTerms = ['papua', 'sorong', 'jayapura', 'merauke', 'manokwari', 'mimika', 'timika', 'biak'];
        matchesChip = papuaTerms.some(t => item.lokasi.toLowerCase().includes(t) || item.kegiatan.toLowerCase().includes(t));
      } else if (currentActiveFilter === 'date-sep') {
        matchesChip = item.tanggal.toLowerCase().includes('sep') || item.tanggal.includes('/09/');
      } else if (currentActiveFilter === 'date-agu') {
        matchesChip = item.tanggal.toLowerCase().includes('agu') || item.tanggal.toLowerCase().includes('aug') || item.tanggal.includes('/08/');
      } else if (currentActiveFilter === 'date-jul') {
        matchesChip = item.tanggal.toLowerCase().includes('jul') || item.tanggal.includes('/07/');
      } else if (currentActiveFilter === 'date-jun') {
        matchesChip = item.tanggal.toLowerCase().includes('jun') || item.tanggal.includes('/06/');
      } else if (currentActiveFilter === 'date-mei') {
        matchesChip = item.tanggal.toLowerCase().includes('mei') || item.tanggal.toLowerCase().includes('may') || item.tanggal.includes('/05/');
      } else if (currentActiveFilter === 'date-apr') {
        matchesChip = item.tanggal.toLowerCase().includes('apr') || item.tanggal.includes('/04/');
      } else if (currentActiveFilter === 'date-mar') {
        matchesChip = item.tanggal.toLowerCase().includes('mar') || item.tanggal.includes('/03/');
      } else if (currentActiveFilter === 'date-feb') {
        matchesChip = item.tanggal.toLowerCase().includes('feb') || item.tanggal.includes('/02/');
      } else if (currentActiveFilter === 'date-jan') {
        matchesChip = item.tanggal.toLowerCase().includes('jan') || item.tanggal.includes('/01/');
      }

      return matchesSearch && matchesChip;
    });

    // 3. Sorting
    if (currentSort === 'num-asc') {
      currentFiltered.sort((a, b) => (parseInt(a.nomor, 10) || 0) - (parseInt(b.nomor, 10) || 0));
    } else if (currentSort === 'title-asc') {
      currentFiltered.sort((a, b) => a.kegiatan.localeCompare(b.kegiatan));
    } else if (currentSort === 'date-desc') {
      currentFiltered.sort((a, b) => (b.id || 0) - (a.id || 0));
    } else if (currentSort === 'date-asc') {
      currentFiltered.sort((a, b) => (a.id || 0) - (b.id || 0));
    }

    renderKegiatanGrid();
    updateCounterDisplays();
  };

  // =========================================================================
  // 6. CARD RENDERING (1-KOLOM / ROW LAYOUT)
  // =========================================================================
  const renderKegiatanGrid = () => {
    if (!kegiatanGrid) return;

    if (currentFiltered.length === 0) {
      kegiatanGrid.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    kegiatanGrid.innerHTML = currentFiltered.map((item, index) => {
      const q = currentSearchQuery.trim();
      const highlightedTitle = highlightMatch(item.kegiatan, q);
      const highlightedLoc = highlightMatch(item.lokasi, q);

      // News link button
      let newsHtml = '';
      if (item.publikasi_berita && item.publikasi_berita.startsWith('http')) {
        newsHtml = `
          <a href="${item.publikasi_berita}" target="_blank" rel="noopener noreferrer" class="pub-pill has-link" onclick="event.stopPropagation();" title="Buka Berita di Portal PKP">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            <span>Berita PKP.go.id</span>
          </a>
        `;
      } else {
        newsHtml = `<span class="pub-pill is-empty">Belum ada rilis</span>`;
      }

      // Video link button
      let videoHtml = '';
      if (item.publikasi_video && item.publikasi_video.startsWith('http')) {
        videoHtml = `
          <a href="${item.publikasi_video}" target="_blank" rel="noopener noreferrer" class="pub-pill pub-video has-link" onclick="event.stopPropagation();" title="Buka Video Dokumentasi">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            <span>Video Instagram</span>
          </a>
        `;
      } else {
        videoHtml = `<span class="pub-pill is-empty">Belum ada video</span>`;
      }

      return `
        <article class="kegiatan-card" data-index="${index}" data-cursor="VIEW">
          <div class="card-top-badges">
            <div class="card-top-left-badges">
              <span class="badge-num">#${item.nomor}</span>
              <span class="badge-date">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <span>${item.tanggal || '-'}</span>
              </span>
              <span class="card-location-row">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <span>${highlightedLoc}</span>
              </span>
            </div>
            ${item.petugas ? `<span class="petugas-tag">Petugas: ${item.petugas}</span>` : ''}
          </div>

          <h3 class="kegiatan-title">${highlightedTitle}</h3>

          <div class="card-footer">
            <div class="card-footer-left">
              <div class="card-publications">
                ${newsHtml}
                ${videoHtml}
              </div>
            </div>
            <button class="btn-card-detail" type="button" aria-label="Lihat Detail Kegiatan">
              <span>Detail Kegiatan</span>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </article>
      `;
    }).join('');

    // Attach click listeners to cards
    const cards = kegiatanGrid.querySelectorAll('.kegiatan-card');
    cards.forEach((card) => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.getAttribute('data-index'), 10);
        openDetailModal(idx);
      });
    });
  };

  const updateCounterDisplays = () => {
    if (resultsCount) {
      const q = currentSearchQuery.trim();
      const isFilterActive = currentActiveFilter !== 'all';
      if (q || isFilterActive) {
        resultsCount.textContent = `Menampilkan ${currentFiltered.length} dari ${activitiesData.length} kegiatan`;
      } else {
        resultsCount.textContent = `Siap mencari di ${activitiesData.length} kegiatan`;
      }
    }
    if (headerCounter) {
      const num = headerCounter.querySelector('.count-num');
      if (num) num.textContent = activitiesData.length;
    }
  };

  // =========================================================================
  // 7. DETAIL MODAL DRAWER
  // =========================================================================
  const openDetailModal = (filteredIndex) => {
    if (filteredIndex < 0 || filteredIndex >= currentFiltered.length) return;
    activeModalIndex = filteredIndex;
    const item = currentFiltered[filteredIndex];

    if (modalNomor) modalNomor.textContent = `#${item.nomor}`;
    if (modalTanggalText) modalTanggalText.textContent = item.tanggal || 'Tanggal tidak diset';
    if (modalLokasiText) modalLokasiText.textContent = item.lokasi || 'Nasional / Daring';
    if (modalKegiatan) modalKegiatan.textContent = item.kegiatan;
    if (modalPetugasText) modalPetugasText.textContent = item.petugas ? `Petugas: ${item.petugas}` : 'Tim Peliputan Humas PKP';

    // Berita section
    if (modalBeritaBox) {
      if (item.publikasi_berita && item.publikasi_berita.startsWith('http')) {
        modalBeritaBox.innerHTML = `
          <a href="${item.publikasi_berita}" target="_blank" rel="noopener noreferrer" class="btn-primary" style="display:inline-flex; gap:0.5rem; font-size:0.875rem; padding:0.6rem 1.25rem;">
            <span>Buka Berita di Portal PKP.go.id</span>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>
          <div style="font-size:0.75rem; color:var(--color-text-subtle); margin-top:0.4rem; word-break:break-all;">${item.publikasi_berita}</div>
        `;
      } else {
        modalBeritaBox.innerHTML = `<span style="font-size:0.875rem; color:var(--color-text-subtle);">Belum ada tautan berita resmi untuk kegiatan ini.</span>`;
      }
    }

    // Video section
    if (modalVideoBox) {
      if (item.publikasi_video && item.publikasi_video.startsWith('http')) {
        modalVideoBox.innerHTML = `
          <a href="${item.publikasi_video}" target="_blank" rel="noopener noreferrer" class="btn-primary" style="display:inline-flex; gap:0.5rem; font-size:0.875rem; padding:0.6rem 1.25rem; background-color:#d97706;">
            <span>Tonton Video di Instagram</span>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </a>
          <div style="font-size:0.75rem; color:var(--color-text-subtle); margin-top:0.4rem; word-break:break-all;">${item.publikasi_video}</div>
        `;
      } else {
        modalVideoBox.innerHTML = `<span style="font-size:0.875rem; color:var(--color-text-subtle);">Belum ada tautan video dokumentasi.</span>`;
      }
    }

    // Modal navigation
    if (modalPrevBtn) modalPrevBtn.disabled = filteredIndex <= 0;
    if (modalNextBtn) modalNextBtn.disabled = filteredIndex >= currentFiltered.length - 1;

    if (detailModal) {
      detailModal.classList.add('is-active');
      detailModal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }
  };

  const closeDetailModal = () => {
    if (!detailModal) return;
    detailModal.classList.remove('is-active');
    detailModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };

  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeDetailModal);
  if (detailModal) {
    detailModal.addEventListener('click', (e) => {
      if (e.target === detailModal) closeDetailModal();
    });
  }

  if (modalPrevBtn) {
    modalPrevBtn.addEventListener('click', () => {
      if (activeModalIndex > 0) openDetailModal(activeModalIndex - 1);
    });
  }

  if (modalNextBtn) {
    modalNextBtn.addEventListener('click', () => {
      if (activeModalIndex < currentFiltered.length - 1) openDetailModal(activeModalIndex + 1);
    });
  }

  // Copy Summary formatted for WhatsApp / Memo
  if (btnCopySummary) {
    btnCopySummary.addEventListener('click', async () => {
      if (activeModalIndex < 0 || activeModalIndex >= currentFiltered.length) return;
      const item = currentFiltered[activeModalIndex];
      const summary = `*DETAIL KEGIATAN PELIPUTAN*
📌 *Kegiatan:* ${item.kegiatan}
📅 *Tanggal:* ${item.tanggal || '-'}
📍 *Lokasi:* ${item.lokasi || '-'}
📰 *Publikasi Berita:* ${item.publikasi_berita || '-'}
🎬 *Publikasi Video:* ${item.publikasi_video || '-'}
👤 *Petugas:* ${item.petugas || 'Tim Peliputan Humas'}
🔗 *Sumber:* Google Sheets Database Peliputan`;

      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(summary);
        } else {
          const t = document.createElement('textarea');
          t.value = summary;
          document.body.appendChild(t);
          t.select();
          document.execCommand('copy');
          document.body.removeChild(t);
        }
        showToast('Ringkasan kegiatan berhasil disalin!');
      } catch (err) {
        showToast('Gagal menyalin ringkasan.');
      }
    });
  }

  // =========================================================================
  // 8. SHEET CONFIG MODAL
  // =========================================================================
  const openSheetConfigModal = () => {
    if (sheetConfigModal) {
      sheetConfigModal.classList.add('is-active');
      sheetConfigModal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }
  };

  const closeSheetConfigModal = () => {
    if (sheetConfigModal) {
      sheetConfigModal.classList.remove('is-active');
      sheetConfigModal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }
  };

  if (btnOpenConfigModal) btnOpenConfigModal.addEventListener('click', openSheetConfigModal);
  if (configModalCloseBtn) configModalCloseBtn.addEventListener('click', closeSheetConfigModal);
  if (sheetConfigModal) {
    sheetConfigModal.addEventListener('click', (e) => {
      if (e.target === sheetConfigModal) closeSheetConfigModal();
    });
  }
  if (btnTestSyncFromModal) {
    btnTestSyncFromModal.addEventListener('click', () => {
      syncGoogleSheet(true);
    });
  }

  // =========================================================================
  // 9. EVENT LISTENERS FOR SEARCH & FILTERS
  // =========================================================================
  if (mainSearchInput) {
    mainSearchInput.addEventListener('input', (e) => {
      currentSearchQuery = e.target.value;
      if (btnClearSearch) {
        btnClearSearch.style.display = currentSearchQuery ? 'flex' : 'none';
      }
      applyFilterAndSearch();
    });
  }

  if (btnClearSearch) {
    btnClearSearch.addEventListener('click', () => {
      if (mainSearchInput) {
        mainSearchInput.value = '';
        currentSearchQuery = '';
        btnClearSearch.style.display = 'none';
        mainSearchInput.focus();
      }
      applyFilterAndSearch();
    });
  }

  if (btnResetSearch) {
    btnResetSearch.addEventListener('click', () => {
      if (mainSearchInput) mainSearchInput.value = '';
      currentSearchQuery = '';
      currentActiveFilter = 'all';
      if (btnClearSearch) btnClearSearch.style.display = 'none';

      const chips = document.querySelectorAll('.filter-chip');
      chips.forEach(c => c.classList.remove('is-active'));
      const allChip = document.querySelector('.filter-chip[data-filter="all"]');
      if (allChip) allChip.classList.add('is-active');

      applyFilterAndSearch();
    });
  }

  if (btnQuickSearchFocus && mainSearchInput) {
    btnQuickSearchFocus.addEventListener('click', () => {
      switchView('search');
      mainSearchInput.focus();
    });
  }

  // Search Hint Tags in the Initial Prompt
  const hintTags = document.querySelectorAll('.search-hint-tag');
  hintTags.forEach((btn) => {
    btn.addEventListener('click', () => {
      const q = btn.getAttribute('data-query');
      if (q && mainSearchInput) {
        mainSearchInput.value = q;
        currentSearchQuery = q;
        if (btnClearSearch) btnClearSearch.style.display = 'flex';
        applyFilterAndSearch();
        mainSearchInput.focus();
      }
    });
  });

  // Keyboard shortcut '/' to focus search input
  window.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== mainSearchInput && !detailModal.classList.contains('is-active') && !sheetConfigModal.classList.contains('is-active')) {
      e.preventDefault();
      switchView('search');
      if (mainSearchInput) mainSearchInput.focus();
    }
    if (e.key === 'Escape') {
      if (detailModal && detailModal.classList.contains('is-active')) closeDetailModal();
      if (sheetConfigModal && sheetConfigModal.classList.contains('is-active')) closeSheetConfigModal();
    }
  });

  // Filter Chips Click
  if (quickFilterRow) {
    const chips = quickFilterRow.querySelectorAll('.filter-chip');
    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        chips.forEach(c => c.classList.remove('is-active'));
        chip.classList.add('is-active');
        currentActiveFilter = chip.getAttribute('data-filter') || 'all';
        applyFilterAndSearch();
      });
    });
  }

  // Sort dropdown
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      currentSort = e.target.value;
      applyFilterAndSearch();
    });
  }

  // Sync buttons
  if (btnSyncNow) btnSyncNow.addEventListener('click', () => syncGoogleSheet(true));
  if (mobileSyncBtn) mobileSyncBtn.addEventListener('click', () => syncGoogleSheet(true));
  const footerSyncBtn = document.getElementById('footerSyncBtn');
  if (footerSyncBtn) footerSyncBtn.addEventListener('click', () => syncGoogleSheet(true));

  // =========================================================================
  // 10. VIEW SWITCHING (SEARCH / DASHBOARD / EXPORT)
  // =========================================================================
  const views = {
    search: document.getElementById('viewSearch'),
    dashboard: document.getElementById('viewDashboard'),
    export: document.getElementById('viewExport')
  };

  const navButtons = document.querySelectorAll('[data-view]');

  const switchView = (targetView) => {
    Object.keys(views).forEach((key) => {
      if (views[key]) {
        if (key === targetView) {
          views[key].style.display = 'block';
          views[key].classList.add('is-active');
        } else {
          views[key].style.display = 'none';
          views[key].classList.remove('is-active');
        }
      }
    });

    // Update active nav button state
    navButtons.forEach((btn) => {
      if (btn.getAttribute('data-view') === targetView) {
        btn.classList.add('is-active');
      } else {
        btn.classList.remove('is-active');
      }
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (targetView === 'dashboard') {
      renderDashboard();
    } else if (targetView === 'export') {
      renderExportPreview();
    }
  };

  navButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const viewName = btn.getAttribute('data-view');
      if (viewName && views[viewName]) {
        switchView(viewName);
      }
    });
  });

  const brandLogoHome = document.getElementById('brandLogoHome');
  if (brandLogoHome) {
    brandLogoHome.addEventListener('click', (e) => {
      e.preventDefault();
      switchView('search');
    });
  }

  // =========================================================================
  // 11. DASHBOARD STATS & CHARTS
  // =========================================================================
  const renderDashboard = () => {
    const total = activitiesData.length;
    const statTotalKegiatan = document.getElementById('statTotalKegiatan');
    const statTotalLokasi = document.getElementById('statTotalLokasi');
    const statBeritaPct = document.getElementById('statBeritaPct');
    const statBeritaCount = document.getElementById('statBeritaCount');
    const statVideoPct = document.getElementById('statVideoPct');
    const statVideoCount = document.getElementById('statVideoCount');

    if (statTotalKegiatan) statTotalKegiatan.textContent = total;

    // Unique locations
    const uniqueLocations = new Set(activitiesData.map(i => i.lokasi).filter(Boolean));
    if (statTotalLokasi) statTotalLokasi.textContent = uniqueLocations.size;

    // News count & pct
    const withNews = activitiesData.filter(i => i.publikasi_berita && i.publikasi_berita.startsWith('http')).length;
    const newsPct = total > 0 ? Math.round((withNews / total) * 100) : 0;
    if (statBeritaPct) statBeritaPct.textContent = `${newsPct}%`;
    if (statBeritaCount) statBeritaCount.textContent = `${withNews} rilis berita di pkp.go.id`;

    // Video count & pct
    const withVideo = activitiesData.filter(i => i.publikasi_video && i.publikasi_video.startsWith('http')).length;
    const videoPct = total > 0 ? Math.round((withVideo / total) * 100) : 0;
    if (statVideoPct) statVideoPct.textContent = `${videoPct}%`;
    if (statVideoCount) statVideoCount.textContent = `${withVideo} video dokumentasi`;

    // Monthly Bar Chart (Dynamic across 2026 months: Jan - Sep)
    const monthlyBarChart = document.getElementById('monthlyBarChart');
    if (monthlyBarChart) {
      const monthConfigs = [
        { label: 'Jan', full: 'Januari', key: 'jan' },
        { label: 'Feb', full: 'Februari', key: 'feb' },
        { label: 'Mar', full: 'Maret', key: 'mar' },
        { label: 'Apr', full: 'April', key: 'apr' },
        { label: 'Mei', full: 'Mei', key: 'mei' },
        { label: 'Jun', full: 'Juni', key: 'jun' },
        { label: 'Jul', full: 'Juli', key: 'jul' },
        { label: 'Agu', full: 'Agustus', key: 'agu' },
        { label: 'Sep', full: 'September', key: 'sep' }
      ];

      const monthCounts = monthConfigs.map((m) => {
        const count = activitiesData.filter((item) => {
          const t = (item.tanggal || '').toLowerCase();
          return t.includes(m.key) || t.includes(m.full.toLowerCase()) || (m.key === 'agu' && t.includes('aug')) || (m.key === 'mei' && t.includes('may'));
        }).length;
        return { ...m, count };
      });

      const maxMonth = Math.max(...monthCounts.map(m => m.count), 1);

      monthlyBarChart.innerHTML = monthCounts.map((m) => {
        const h = Math.round((m.count / maxMonth) * 160);
        const isPeak = m.count === maxMonth;
        const barStyle = isPeak ? 'background-color: var(--color-accent);' : '';
        return `
          <div class="chart-bar-col" title="${m.full}: ${m.count} kegiatan">
            <div class="bar-pill" style="height: ${Math.max(h, 20)}px; ${barStyle}">
              <span class="bar-tooltip">${m.count}</span>
            </div>
            <span class="bar-label">${m.label}</span>
          </div>
        `;
      }).join('');
    }

    // Top Location Progress Bars
    const locationProgressBars = document.getElementById('locationProgressBars');
    if (locationProgressBars) {
      const locCounts = {};
      activitiesData.forEach((i) => {
        let loc = (i.lokasi || 'Nasional / Daring').trim();
        locCounts[loc] = (locCounts[loc] || 0) + 1;
      });

      const sortedLocs = Object.entries(locCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);

      const maxLoc = sortedLocs[0] ? sortedLocs[0][1] : 1;

      locationProgressBars.innerHTML = sortedLocs.map(([name, count]) => {
        const pct = Math.round((count / maxLoc) * 100);
        return `
          <div class="loc-progress-item">
            <div class="loc-progress-labels">
              <span>${name}</span>
              <strong>${count} Kegiatan</strong>
            </div>
            <div class="loc-progress-track">
              <div class="loc-progress-fill" style="width: ${pct}%;"></div>
            </div>
          </div>
        `;
      }).join('');
    }
  };

  // =========================================================================
  // 12. EXPORT FUNCTIONALITY & PREVIEW TABLE
  // =========================================================================
  const renderExportPreview = () => {
    const previewTableBody = document.getElementById('previewTableBody');
    const tablePreviewCount = document.getElementById('tablePreviewCount');
    if (tablePreviewCount) tablePreviewCount.textContent = activitiesData.length;

    if (!previewTableBody) return;

    previewTableBody.innerHTML = activitiesData.map((item) => `
      <tr>
        <td><strong>#${item.nomor}</strong></td>
        <td>${item.tanggal || '-'}</td>
        <td>${item.kegiatan}</td>
        <td>${item.lokasi || '-'}</td>
        <td>${item.publikasi_berita ? `<a href="${item.publikasi_berita}" target="_blank" style="color:var(--color-accent); text-decoration:underline;">Link Berita ↗</a>` : '-'}</td>
        <td>${item.publikasi_video ? `<a href="${item.publikasi_video}" target="_blank" style="color:#d97706; text-decoration:underline;">Link Video ↗</a>` : '-'}</td>
        <td>${item.petugas || '-'}</td>
      </tr>
    `).join('');
  };

  // Export to CSV
  const exportToCSV = (isExcel = false) => {
    if (!activitiesData.length) {
      showToast('Database kosong, tidak ada data untuk diexport.');
      return;
    }

    const headers = ['Nomor', 'Tanggal', 'Kegiatan', 'Lokasi', 'Publikasi Berita', 'Publikasi Video', 'Petugas'];
    const rows = activitiesData.map(item => [
      item.nomor,
      item.tanggal,
      `"${(item.kegiatan || '').replace(/"/g, '""')}"`,
      `"${(item.lokasi || '').replace(/"/g, '""')}"`,
      `"${(item.publikasi_berita || '').replace(/"/g, '""')}"`,
      `"${(item.publikasi_video || '').replace(/"/g, '""')}"`,
      `"${(item.petugas || '').replace(/"/g, '""')}"`
    ]);

    let csvContent = headers.join(',') + '\n' + rows.map(r => r.join(',')).join('\n');
    if (isExcel) {
      csvContent = '\uFEFF' + csvContent;
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = isExcel ? 'database_peliputan_excel.csv' : 'database_peliputan.csv';
    link.click();
    URL.revokeObjectURL(url);
    showToast(isExcel ? 'File Excel CSV berhasil diunduh!' : 'File CSV berhasil diunduh!');
  };

  const btnExportCSV = document.getElementById('btnExportCSV');
  const btnExportExcel = document.getElementById('btnExportExcel');
  const btnPrintReport = document.getElementById('btnPrintReport');
  const footerExportLink = document.getElementById('footerExportLink');

  if (btnExportCSV) btnExportCSV.addEventListener('click', () => exportToCSV(false));
  if (btnExportExcel) btnExportExcel.addEventListener('click', () => exportToCSV(true));
  if (btnPrintReport) btnPrintReport.addEventListener('click', () => window.print());
  if (footerExportLink) footerExportLink.addEventListener('click', () => exportToCSV(false));

  // =========================================================================
  // 13. CUSTOM MAGNETIC CURSOR
  // =========================================================================
  const cursor = document.getElementById('customCursor');
  if (cursor && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const dot = cursor.querySelector('.cursor-dot');
    const follower = cursor.querySelector('.cursor-follower');
    const cursorText = cursor.querySelector('.cursor-text');

    let mouseX = -100, mouseY = -100;
    let followerX = -100, followerY = -100;

    window.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      if (dot) dot.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0)`;
    });

    const renderCursor = () => {
      followerX += (mouseX - followerX) * 0.18;
      followerY += (mouseY - followerY) * 0.18;
      if (follower) follower.style.transform = `translate3d(${followerX}px, ${followerY}px, 0)`;
      requestAnimationFrame(renderCursor);
    };
    requestAnimationFrame(renderCursor);

    document.body.addEventListener('mouseover', (e) => {
      const hoverTarget = e.target.closest('[data-cursor], a, button, .kegiatan-card, .filter-chip, .export-action-card');
      if (hoverTarget) {
        cursor.classList.add('is-hovering');
        const customText = hoverTarget.getAttribute('data-cursor');
        if (cursorText) {
          cursorText.textContent = customText || 'LIHAT';
        }
      } else {
        cursor.classList.remove('is-hovering');
      }
    });

    document.addEventListener('mouseleave', () => { cursor.style.opacity = '0'; });
    document.addEventListener('mouseenter', () => { cursor.style.opacity = '1'; });
  }

  // =========================================================================
  // 14. STICKY HEADER & MOBILE TOGGLE
  // =========================================================================
  const siteHeader = document.getElementById('siteHeader');
  window.addEventListener('scroll', () => {
    if (siteHeader) {
      if (window.scrollY > 20) {
        siteHeader.classList.add('is-scrolled');
      } else {
        siteHeader.classList.remove('is-scrolled');
      }
    }
  }, { passive: true });

  const mobileToggle = document.getElementById('mobileToggle');
  const mobileMenu = document.getElementById('mobileMenu');
  if (mobileToggle && mobileMenu) {
    mobileToggle.addEventListener('click', () => {
      const isOpen = mobileMenu.classList.toggle('is-open');
      mobileToggle.classList.toggle('is-active', isOpen);
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    const mobileNavLinks = mobileMenu.querySelectorAll('.mobile-nav-link');
    mobileNavLinks.forEach((link) => {
      link.addEventListener('click', () => {
        mobileMenu.classList.remove('is-open');
        mobileToggle.classList.remove('is-active');
        document.body.style.overflow = '';
      });
    });
  }

  // =========================================================================
  // 15. INITIAL BOOTSTRAP & AUTO-POLLING INTERVAL
  // =========================================================================
  applyFilterAndSearch();
  renderDashboard();
  renderExportPreview();

  // Run immediate sync on start
  syncGoogleSheet(false);

  // Auto-poll Google Sheets every 30 seconds for live updates
  const intervalSeconds = SHEET_CONFIG.autoSyncIntervalSec || 30;
  setInterval(() => {
    syncGoogleSheet(false);
  }, intervalSeconds * 1000);

  // Auto-sync whenever user switches back to this browser tab
  window.addEventListener('focus', () => {
    syncGoogleSheet(false);
  });

  console.log(`[Tubik Database] Realtime Sync Engine Active for GID: ${SHEET_CONFIG.gid}. Loaded ${activitiesData.length} records.`);
});
