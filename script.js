// ===============================
// script.js — LevelLoop
// ===============================

// Inisialisasi FFmpeg (global dari <script src="@ffmpeg/ffmpeg">)
let { createFFmpeg } = FFmpeg;

// (LAMA - contoh inisialisasi sederhana)
// const ffmpeg = createFFmpeg({ log: true });

/**
 * [PATCH 9/8/2025 - pelanggan hp memory kecil]
 * Masih pakai single-thread untuk hemat RAM.
 * (Kalau suatu saat mau pakai core-mt, aktifkan sesuai device high-RAM saja)
 */
const ffmpeg = createFFmpeg({ log: true });

// === DOM Elements ===
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const video = document.getElementById('video');
const controls = document.getElementById('controls');
const setLoopBtn = document.getElementById('set-loop');
const clearLoopBtn = document.getElementById('clear-loop');
const startTimeInput = document.getElementById('start-time');
const endTimeInput = document.getElementById('end-time');
const exportVideoBtn = document.getElementById('export-video');
const aiSuggestBtn = document.getElementById('ai-suggest');
const mobileDownloadBtn = document.getElementById('mobile-download'); // tombol manual download
const loadingEl = document.getElementById('loading');

let currentFile = null;
let objectUrl = null;
let lastBlobUrl = null;

// =====================================================
// Device & Memory Guards
// =====================================================

/**
 * [PATCH 9/8/2025 - pelanggan hp memory kecil]
 * Deteksi device & kapasitas RAM. navigator.deviceMemory bisa tidak ada
 * di hp lama → default 2GB supaya aman.
 */
const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const DEVICE_MEM_GB = (navigator.deviceMemory ? Number(navigator.deviceMemory) : 2);
const LOW_RAM = IS_MOBILE && DEVICE_MEM_GB <= 2;

// [PATCH 9/8/2025 - pelanggan hp memory kecil] batas ukuran file dinamis
const MAX_FILE_MB_DESKTOP = 50;
const MAX_FILE_MB_MOBILE_LOW = 25;

// =====================================================
// Utils
// =====================================================

// (LAMA) parse mm:ss sederhana
// function parseTimeToSeconds(t) { ... }

/**
 * Format "mm:ss" / "m:ss" / "HH:MM:SS" → "HH:MM:SS"
 * [PATCH 9/8/2025 - pelanggan hp memory kecil]
 */
function toHHMMSS(mmssValue) {
  if (typeof mmssValue !== 'string') return '00:00:00';
  const parts = mmssValue.split(':').map(x => parseInt(x || '0', 10));
  let m = 0, s = 0, h = 0;
  if (parts.length === 2) { [m, s] = parts; }
  else if (parts.length === 3) { [h, m, s] = parts; }
  s = Math.max(0, s|0); m = Math.max(0, m|0); h = Math.max(0, h|0);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * Parse "mm:ss" / "HH:MM:SS" → detik (Number)
 */
function timeToSeconds(txt) {
  if (!txt) return 0;
  const parts = txt.split(':').map(v => +v || 0);
  if (parts.length === 3) {
    return parts[0]*3600 + parts[1]*60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0]*60 + parts[1];
  }
  return +txt || 0;
}

function showLoading(on) {
  if (!loadingEl) return;
  loadingEl.style.display = on ? 'block' : 'none';
}

// =====================================================
// Drag & Drop / Upload
// =====================================================

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('active');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('active');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('active');
  const file = e.dataTransfer.files?.[0];
  if (file) handleFile(file);
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) handleFile(file);
});

/**
 * (LAMA) Validasi ukuran fix 50MB
 * if (file.size > 50 * 1024 * 1024) { alert('Video terlalu besar. Maksimal 50MB.'); return; }
 */

/**
 * [PATCH 9/8/2025 - pelanggan hp memory kecil]
 * Validasi dinamis: kalau device low-RAM (≈2GB) → limit 25MB.
 * Desktop tetap 50MB (sesuai UI).
 */
async function handleFile(file) {
  if (!file) return;

  // Validasi type
  if (!/video\/mp4/i.test(file.type)) {
    alert('Format tidak didukung. Gunakan file MP4.');
    return;
  }

  const fileMB = file.size / (1024 * 1024);
  const maxMB = LOW_RAM ? MAX_FILE_MB_MOBILE_LOW : MAX_FILE_MB_DESKTOP;
  if (fileMB > maxMB) {
    alert(
      LOW_RAM
        ? `File ${fileMB.toFixed(1)}MB terlalu besar untuk perangkat ini (maks ${maxMB}MB).\n` +
          `Tips: turunkan resolusi/bitrate lalu coba lagi, atau gunakan desktop.`
        : `Video terlalu besar. Maksimal ${maxMB}MB.`
    );
    return;
  }

  // tampilkan pratinjau
  currentFile = file;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);
  video.src = objectUrl;

  // tampilkan controls-section
  controls.style.display = 'block';

  // Set default range setelah metadata tersedia
  video.onloadedmetadata = () => {
    const dur = Math.max(0, video.duration || 0);
    const start = Math.max(0, Math.min(5, Math.floor(dur * 0.05)));
    const end = Math.max(start + 2, Math.min(dur, start + 10));
    startTimeInput.value = `${String(Math.floor(start/60)).padStart(2,'0')}:${String(Math.floor(start%60)).padStart(2,'0')}`;
    endTimeInput.value   = `${String(Math.floor(end/60)).padStart(2,'0')}:${String(Math.floor(end%60)).padStart(2,'0')}`;
  };
}

// =====================================================
// Loop range (preview di player)
// =====================================================

let loopActive = false;
let loopStart = 0;
let loopEnd = 0;

setLoopBtn.addEventListener('click', () => {
  loopStart = timeToSeconds(startTimeInput.value);
  loopEnd = timeToSeconds(endTimeInput.value);

  if (loopEnd <= loopStart) {
    alert('End harus lebih besar dari Start.');
    return;
  }

  loopActive = true;
  video.currentTime = loopStart;
  video.play();
});

clearLoopBtn.addEventListener('click', () => {
  loopActive = false;
});

video.addEventListener('timeupdate', () => {
  if (!loopActive) return;
  if (video.currentTime >= loopEnd) {
    video.currentTime = loopStart;
    video.play();
  }
});

// =====================================================
// Ekspor (FFmpeg)
// =====================================================

/**
 * (LAMA) Ekspor selalu re-encode → raw memory besar, bisa OOM di HP 2GB
 * async function downloadLoopedClip(filename) {
 *   await ffmpeg.load();
 *   const data = new Uint8Array(await currentFile.arrayBuffer());
 *   await ffmpeg.FS('writeFile', 'input.mp4', data);
 *   await ffmpeg.run('-ss', start, '-to', end, '-i', 'input.mp4', '-c:v', 'libx264', '-preset', 'medium', '-c:a', 'copy', 'out.mp4');
 *   ...
 * }
 */

/**
 * [PATCH 9/8/2025 - pelanggan hp memory kecil]
 * Strategi hemat memori:
 * 1) Di LOW_RAM → langsung coba "Lite mode" (stream copy: -c copy, -ss/-to sebelum -i).
 * 2) Di device lain → coba re-encode ringan, jika OOM fallback ke Lite.
 */
function getRangeHHMMSS() {
  const s = toHHMMSS(startTimeInput?.value || '00:01');
  const e = toHHMMSS(endTimeInput?.value   || '00:05');
  return { s, e };
}

async function exportLiteRange(ff, inputName, outName, startHHMMSS, endHHMMSS) {
  // tanpa re-encode
  await ff.run(
    '-ss', startHHMMSS,
    '-to', endHHMMSS,
    '-i', inputName,
    '-c', 'copy',
    outName
  );
}

async function exportSafeReencode(ff, inputName, outName, startHHMMSS, endHHMMSS) {
  // re-encode ringan: batasi resolusi & preset cepat
  await ff.run(
    '-ss', startHHMMSS, '-to', endHHMMSS, '-i', inputName,
    '-vf', 'scale=min(iw\\,1280):-2',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28',
    '-c:a', 'copy',
    outName
  );
}

async function downloadLoopedClip(filename) {
  try {
    if (!currentFile) throw new Error("Tidak ada file yang diupload.");

    showLoading(true);

    if (!ffmpeg.isLoaded()) {
      await ffmpeg.load(); // single-thread (lebih hemat RAM)
    }

    // tulis input ke FS
    const data = new Uint8Array(await currentFile.arrayBuffer());
    await ffmpeg.FS('writeFile', 'input.mp4', data);

    const { s, e } = getRangeHHMMSS();

    const OUT = 'out.mp4';
    const tryLite = async () => {
      await exportLiteRange(ffmpeg, 'input.mp4', OUT, s, e);
    };
    const tryReencode = async () => {
      await exportSafeReencode(ffmpeg, 'input.mp4', OUT, s, e);
    };

    try {
      if (LOW_RAM) {
        await tryLite(); // langsung lite untuk hp 2GB
      } else {
        await tryReencode();
      }
    } catch (err1) {
      const msg1 = String(err1?.message || err1);
      if (msg1.includes('WebAssembly.Memory') || msg1.includes('allocate memory')) {
        // fallback OOM → coba Lite
        await tryLite();
      } else {
        throw err1;
      }
    }

    // ambil output & siapkan download
    const outData = ffmpeg.FS('readFile', OUT);
    const blob = new Blob([outData.buffer], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);

    if (lastBlobUrl) URL.revokeObjectURL(lastBlobUrl);
    lastBlobUrl = url;

    // Desktop → auto download
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'looped.mp4';
    document.body.appendChild(a);
    a.click();
    a.remove();

    // Mobile → tampilkan tombol manual
    if (IS_MOBILE && mobileDownloadBtn) {
      mobileDownloadBtn.href = url;
      mobileDownloadBtn.style.display = 'block';
    }

  } catch (err) {
    console.error("❌ ERROR:", err);
    const msg = String(err?.message || err);
    if (msg.includes('WebAssembly.Memory') || msg.includes('allocate memory')) {
      alert(
        "Perangkat Anda kehabisan memori untuk memproses video ini.\n" +
        "Coba: Mode Lite (tanpa re-encode), turunkan resolusi/bitrate, atau gunakan desktop."
      );
    } else if (msg.includes('could not be read') || msg.includes('permission')) {
      alert(
        "Gagal memproses video: izin baca file ditolak oleh browser.\n" +
        "Coba re-upload atau pilih file dari penyimpanan lokal."
      );
    } else {
      alert("Gagal proses video: " + msg);
    }
  } finally {
    // beres-beres
    try { ffmpeg.FS('unlink', 'input.mp4'); } catch {}
    try { ffmpeg.FS('unlink', 'out.mp4'); } catch {}
    showLoading(false);
  }
}

// Tombol export
exportVideoBtn.addEventListener('click', async () => {
  if (LOW_RAM) {
    console.log('[INFO] Mode Lite diaktifkan (deteksi RAM ≈', DEVICE_MEM_GB, 'GB).');
  }
  await downloadLoopedClip('looped.mp4');
});

// =====================================================
// AI Suggest Loop (sederhana)
// =====================================================

/**
 * (LAMA) Belum ada / placeholder.
 */
// aiSuggestBtn.addEventListener('click', () => { ... });

/**
 * [PATCH 9/8/2025 - pelanggan hp memory kecil]
 * Sugesti sederhana: pilih 3–5 detik di tengah video
 */
aiSuggestBtn.addEventListener('click', () => {
  if (!video.duration || isNaN(video.duration)) {
    alert('Upload video terlebih dahulu.');
    return;
  }
  const d = video.duration;
  const seg = Math.min(5, Math.max(3, Math.floor(d * 0.15))); // 3-5 detik
  const start = Math.max(0, Math.floor(d/2 - seg/2));
  const end = Math.min(d, start + seg);

  const mm = v => String(Math.floor(v/60)).padStart(2,'0');
  const ss = v => String(Math.floor(v%60)).padStart(2,'0');

  startTimeInput.value = `${mm(start)}:${ss(start)}`;
  endTimeInput.value   = `${mm(end)}:${ss(end)}`;

  // auto-preview
  loopStart = start;
  loopEnd = end;
  loopActive = true;
  video.currentTime = loopStart;
  video.play();
});

// =====================================================
// Tombol manual download (mobile)
// =====================================================

mobileDownloadBtn.addEventListener("click", (e) => {
  if (!lastBlobUrl) {
    e.preventDefault();
    alert("⚠️ Tidak ada file untuk diunduh. Silakan proses video dulu.");
  }
});

// =====================================================
// (Opsional) Telemetry super ringan via webhook
// =====================================================

/**
 * (LAMA) tidak ada telemetry.
 */

/**
 * [PATCH 9/8/2025 - pelanggan hp memory kecil]
 * Kosongkan WEBHOOK jika tidak dipakai.
 */
async function notifyOps(text) {
  const WEBHOOK = ""; // isi dengan Discord/Telegram webhook jika diperlukan
  if (!WEBHOOK) return;
  try {
    await fetch(WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "LevelLoop: " + text })
    });
  } catch {}
}

window.addEventListener('error', e => notifyOps(e.message));
window.addEventListener('unhandledrejection', e => notifyOps(String(e.reason)));

