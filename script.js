/*******************************************************
 * [PATCH 09/08/2025 - pelanggan HP memory kecil]
 * Ubah arsitektur: proses video di SERVER (Supabase + HuggingFace),
 * bukan di browser (ffmpeg.wasm). FFmpeg WASM lama disimpan di bawah
 * sebagai komentar untuk rollback cepat.
 *******************************************************/

/* ==================== SUPABASE CONFIG ==================== */
// GANTI sesuai project-mu
const SUPABASE_URL = "https://uaeksmqplskfrxxwwtbu.supabase.co";   // TODO
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhZWtzbXFwbHNrZnJ4eHd3dGJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ3Mjk3MjcsImV4cCI6MjA3MDMwNTcyN30.j8SQcbk3lBfhnTgcpKH9cDtI6NgRcxiDhxWegDSxH24";                 // TODO

if (!window.supabase) {
  alert("Supabase SDK belum dimuat. Tambahkan CDN supabase-js di index.html");
}
const sb = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ==================== DOM ELEMENTS ==================== */
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
const mobileDownloadBtn = document.getElementById('mobile-download');
const loadingEl = document.getElementById('loading');

// (opsional, jika modal kode akses masih dipakai di HTML)
const codeModal = document.getElementById('code-modal');
const accessCodeInput = document.getElementById('access-code');
const cancelCodeBtn = document.getElementById('cancel-code');
const submitCodeBtn = document.getElementById('submit-code');

/* ==================== STATE ==================== */
let loopStart = 1;
let loopEnd = 5;
const VALID_CODES = ["COBA", "PRO2025", "LEVELLOOP", "BETAUSER"];
let betaUserUsed = false;
let currentFile = null;
let lastBlobUrl = null;

/* ==================== DEBUG PANEL KECIL ==================== */
function showDebug(msg) {
  let el = document.getElementById('debug-log');
  if (!el) {
    el = document.createElement('pre');
    el.id = 'debug-log';
    el.style.cssText = 'white-space:pre-wrap;background:#111;color:#0f0;padding:8px;border-radius:8px;max-height:200px;overflow:auto;margin:12px;';
    document.body.appendChild(el);
  }
  el.textContent += `\n${new Date().toLocaleTimeString()}  ${msg}`;
}

/* ==================== EDGE INVOKER (SDK → fallback fetch) ==================== */
async function invokeEdge(name, payload) {
  // 1) coba pakai SDK
  try {
    const { data, error } = await sb.functions.invoke(name, { body: payload });
    if (error) throw error;
    return data;
  } catch (e1) {
    showDebug(`[invoke:${name}] SDK gagal: ${e1?.message || e1}`);
    // 2) fallback fetch manual (atasi kasus CORS/SDK aneh di HP)
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY
        },
        body: JSON.stringify(payload)
      });
      const text = await resp.text();
      showDebug(`[invoke:${name}] Fallback status ${resp.status} -> ${text.slice(0,300)}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status} ${text}`);
      return text ? JSON.parse(text) : {};
    } catch (e2) {
      showDebug(`[invoke:${name}] Fallback gagal: ${e2?.message || e2}`);
      throw e2;
    }
  }
}

/* ==================== SUPABASE HELPERS ==================== */
async function getSignedUpload(file) {
  return await invokeEdge('signed-upload', {
    filename: file.name,
    contentType: file.type || 'video/mp4'
  });
}

async function uploadWithToken(path, token, file, contentType) {
  const { error } = await sb.storage
    .from('videos')
    .uploadToSignedUrl(path, token, file, { contentType });
  if (error) throw new Error(error.message || "uploadToSignedUrl failed");
}

async function requestCut(path, start, end) {
  return await invokeEdge('request-cut', { path, start, end });
}

async function waitUntilReady(url, tries = 120, intervalMs = 5000) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      if (r.ok) return true;
    } catch (_) {}
    await new Promise(res => setTimeout(res, intervalMs));
  }
  return false;
}

/* ==================== UPLOAD UI ==================== */
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('active'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('active'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault(); dropZone.classList.remove('active');
  const file = e.dataTransfer.files?.[0];
  if (file) handleFile(file);
});
fileInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) handleFile(file);
});

function handleFile(file) {
  if (!file.type.startsWith('video/')) { alert('Format tidak didukung. Harap upload video.'); return; }
  if (!file.name.toLowerCase().endsWith('.mp4')) { alert('Hanya file .mp4 yang didukung.'); return; }
  if (file.size > 50 * 1024 * 1024) { alert('Video terlalu besar. Maksimal 50MB.'); return; }

  currentFile = file;
  const url = URL.createObjectURL(file);
  video.src = url;
  controls.style.display = 'block';
}

/* ==================== LOOP PREVIEW ==================== */
setLoopBtn.addEventListener('click', () => {
  const [minS, secS] = startTimeInput.value.split(':').map(n => parseInt(n || '0', 10));
  const [minE, secE] = endTimeInput.value.split(':').map(n => parseInt(n || '0', 10));
  loopStart = minS * 60 + secS;
  loopEnd   = minE * 60 + secE;

  if (!Number.isFinite(loopStart) || !Number.isFinite(loopEnd)) { alert('Format waktu tidak valid (mm:ss).'); return; }
  if (loopStart >= loopEnd) { alert('Waktu mulai harus lebih kecil dari waktu selesai.'); return; }

  video.currentTime = loopStart;
  video.play();
});

video.addEventListener('timeupdate', () => {
  if (video.currentTime >= loopEnd) video.currentTime = loopStart;
});

clearLoopBtn.addEventListener('click', () => {
  startTimeInput.value = '00:00';
  endTimeInput.value = '00:30';
  loopStart = 0; loopEnd = 30;
});

/* ==================== AI SUGGEST (dummy) ==================== */
aiSuggestBtn.addEventListener('click', () => {
  startTimeInput.value = '00:05';
  endTimeInput.value = '00:08';
  alert("AI: Rentang loop disarankan");
});

/* ==================== EXPORT (pakai modal kode akses, jika ada) ==================== */
exportVideoBtn.addEventListener('click', () => {
  if (!currentFile) return alert('Upload dulu videonya!');
  if (codeModal) codeModal.style.display = 'flex';
  else exportViaServer("looped.mp4"); // kalau kamu tidak pakai modal
});

cancelCodeBtn?.addEventListener('click', () => {
  codeModal.style.display = 'none';
  accessCodeInput.value = '';
});

submitCodeBtn?.addEventListener('click', async () => {
  const code = accessCodeInput.value.trim().toUpperCase();
  if (!VALID_CODES.includes(code)) return alert("❌ Kode salah.");

  codeModal.style.display = 'none';
  if (code === "PRO2025") {
    await exportViaServer("looped-pro.mp4");
  } else if (code === "BETAUSER") {
    if (!betaUserUsed) {
      await exportViaServer("looped-beta.mp4");
      betaUserUsed = true;
    } else {
      alert("❌ Kode BETAUSER hanya bisa digunakan 1 kali.");
    }
  } else {
    await exportViaServer("looped.mp4");
  }
  accessCodeInput.value = '';
});

/* ==================== EXPORT VIA SERVER ==================== */
// [PATCH 09/08/2025 - pelanggan HP memory kecil → pindah proses ke server]
async function exportViaServer(filename) {
  try {
    if (!sb) throw new Error("Supabase belum siap");
    if (!currentFile) throw new Error("Tidak ada file");

    loadingEl && (loadingEl.style.display = 'block');
    mobileDownloadBtn.style.display = 'none';
    mobileDownloadBtn.removeAttribute('href');
    mobileDownloadBtn.removeAttribute('download');

    // 1) minta signed upload
    const up = await getSignedUpload(currentFile); // {path, token, contentType}
    showDebug(`signed-upload OK: ${up.path}`);

    // 2) upload file ke Storage
    await uploadWithToken(up.path, up.token, currentFile, up.contentType);
    showDebug(`uploadToSignedUrl OK`);

    // 3) request-cut (Supabase akan trigger HuggingFace)
    const start = toMMSS(loopStart);
    const end   = toMMSS(loopEnd);
    const job = await requestCut(up.path, start, end);
    showDebug(`request-cut OK: output=${job.outputPath}`);

    // 4) polling hasil
    const ready = await waitUntilReady(job.outputSignedDownloadUrl);
    if (!ready) throw new Error("Proses belum selesai atau gagal di server.");

    // 5) download
    const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
    if (isMobile) {
      alert("🎥 Video siap! Klik tombol hijau untuk download.");
      mobileDownloadBtn.href = job.outputSignedDownloadUrl;
      mobileDownloadBtn.download = filename;
      mobileDownloadBtn.style.display = 'block';
      mobileDownloadBtn.scrollIntoView({ behavior: 'smooth' });
    } else {
      const a = document.createElement('a');
      a.href = job.outputSignedDownloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  } catch (err) {
    console.error("❌ ERROR (server export):", err);
    alert("Gagal memproses: " + (err.message || err));
  } finally {
    loadingEl && (loadingEl.style.display = 'none');
  }
}

function toMMSS(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

/* ==================== MOBILE MANUAL DL ==================== */
mobileDownloadBtn.addEventListener("click", (e) => {
  if (!mobileDownloadBtn.href) {
    e.preventDefault();
    alert("⚠️ Tidak ada file untuk diunduh. Silakan proses video dulu.");
  }
});

/******************************************************************
 * ========== (DISABLE) KODE LAMA: ffmpeg.wasm di browser =========
 * Disimpan untuk referensi / rollback. Tidak dipakai lagi.
 ******************************************************************
// Inisialisasi FFmpeg
// let { createFFmpeg } = FFmpeg;
// const ffmpeg = createFFmpeg({ log: true });
//
// async function downloadLoopedClip(filename) {
//   try {
//     if (!ffmpeg.isLoaded()) {
//       alert("⏳ Memuat FFmpeg...");
//       await ffmpeg.load();
//     }
//     if (!currentFile) throw new Error("Tidak ada file");
//     const arrayBuffer = await currentFile.arrayBuffer();
//     const uint8Array = new Uint8Array(arrayBuffer);
//     ffmpeg.FS("writeFile", "input.mp4", uint8Array);
//     const startSec = loopStart;
//     const duration = loopEnd - loopStart;
//     await ffmpeg.run(
//       "-i","input.mp4","-ss",String(startSec),"-t",String(duration),
//       "-vf","scale=480:-1","-c:v","libx264","-crf","28","-preset","ultrafast",
//       "-tune","fastdecode","-c:a","aac","-b:a","64k","-threads","1","output.mp4"
//     );
//     const data = ffmpeg.FS("readFile","output.mp4");
//     const blob = new Blob([data.buffer],{type:"video/mp4"});
//     const url = URL.createObjectURL(blob);
//     const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/.test(navigator.userAgent);
//     if (isMobile) {
//       alert("🎥 Video siap! Klik tombol hijau untuk download.");
//       mobileDownloadBtn.href = url;
//       mobileDownloadBtn.download = filename;
//       mobileDownloadBtn.style.display = "block";
//       mobileDownloadBtn.scrollIntoView({ behavior: "smooth" });
//     } else {
//       const a = document.createElement("a");
//       a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
//     }
//     ffmpeg.FS("unlink","input.mp4"); ffmpeg.FS("unlink","output.mp4");
//   } catch (err) {
//     console.error("❌ ERROR:", err);
//     alert("Gagal proses video: " + (err.message || "Coba lagi"));
//   }
// }
*/
