/*******************************************************
 * [PATCH 09/08/2025 - pelanggan HP memory kecil]
 * Server mode (Supabase + HuggingFace) + hardening DOM.
 *******************************************************/
document.addEventListener('DOMContentLoaded', () => {
  /* ==================== SUPABASE CONFIG ==================== */
  const SUPABASE_URL = "https://uaeksmqplskfrxxwwtbu.supabase.co";   // ganti punyamu kalau beda
  const SUPABASE_ANON_KEY = "sb_publishable_2wCBhyPtiw739jpS3McxRQ_xpYTQ2Mk";   

  if (!window.supabase) {
    alert("Supabase SDK belum dimuat. Tambahkan CDN supabase-js di index.html");
    return;
  }
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  
// (opsional debug) lihat 16 karakter awal key biar yakin yang dipakai sudah publishable
	console.log("[supabase key prefix]", SUPABASE_ANON_KEY.slice(0, 16));


  /* ==================== UTIL DOM ==================== */
  function ensureEl(selector, createFn) {
    let el = document.querySelector(selector);
    if (!el && typeof createFn === "function") {
      el = createFn();
    }
    return el;
  }

  // Pastikan elemen-elemen penting ada
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const video = ensureEl('#video', () => {
    const v = document.createElement('video');
    v.id = 'video';
    v.controls = true;
    document.body.appendChild(v);
    return v;
  });
  const controls = ensureEl('#controls', () => {
    const s = document.createElement('section');
    s.id = 'controls';
    s.className = 'controls-section';
    s.style.display = 'none';
    s.innerHTML = `
      <div class="time-controls">
        <label>Start (mm:ss): <input type="text" id="start-time" value="00:05"/></label>
        <label>End (mm:ss): <input type="text" id="end-time" value="00:15"/></label>
        <button id="set-loop">Set Loop</button>
        <button id="clear-loop">Clear</button>
        <button id="export-video">Export Loop</button>
      </div>
      <div class="video-container"><video id="video" controls></video></div>
      <a id="mobile-download" href="#" download style="display:none;">⬇️ Download Video</a>
    `;
    document.body.appendChild(s);
    return s;
  });

  const setLoopBtn = document.getElementById('set-loop');
  const clearLoopBtn = document.getElementById('clear-loop');
  const startTimeInput = document.getElementById('start-time');
  const endTimeInput = document.getElementById('end-time');
  const exportVideoBtn = document.getElementById('export-video');

  let mobileDownloadBtn = document.getElementById('mobile-download');
  if (!mobileDownloadBtn) {
    mobileDownloadBtn = document.createElement('a');
    mobileDownloadBtn.id = 'mobile-download';
    mobileDownloadBtn.textContent = '⬇️ Download Video';
    mobileDownloadBtn.style.display = 'none';
    mobileDownloadBtn.setAttribute('download', '');
    document.body.appendChild(mobileDownloadBtn);
  }

  let loadingEl = document.getElementById('loading');
  if (!loadingEl) {
    loadingEl = document.createElement('div');
    loadingEl.id = 'loading';
    loadingEl.style.cssText = 'display:none;text-align:center;margin:20px 0;';
    loadingEl.innerHTML = `<p>🎥 Memproses video... (jangan tutup halaman)</p><div class="spinner"></div>`;
    document.body.appendChild(loadingEl);
  }

  /* ==================== STATE ==================== */
  let loopStart = 1;
  let loopEnd = 5;
  let currentFile = null;
  let betaUserUsed = false;

  /* ==================== DEBUG PANEL ==================== */
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

  // Ganti fungsi invokeEdge jadi begini:
async function invokeEdge(name, payload) {
  const baseHeaders = {
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,   // publishable
    'apikey': SUPABASE_ANON_KEY,
    'Content-Type': 'application/json'
  };

  // 1) Coba via SDK tapi pakai headers kita
  try {
    const { data, error } = await sb.functions.invoke(name, {
      body: payload,
      headers: baseHeaders
    });
    if (error) throw error;
    return data;
  } catch (e1) {
    showDebug(`[invoke:${name}] SDK gagal: ${e1?.message || e1}`);
  }

  // 2) Fallback fetch manual (headers sama)
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: baseHeaders,
    body: JSON.stringify(payload)
  });
  const text = await resp.text();
  showDebug(`[invoke:${name}] Fallback status ${resp.status} -> ${text.slice(0,300)}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${text}`);
  return text ? JSON.parse(text) : {};
}


  /* ==================== SUPABASE HELPERS ==================== */
 // === EDGE INVOKER: SDK (dengan headers) → fallback fetch ===
async function invokeEdge(name, payload) {
  const baseHeaders = {
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,  // WAJIB publishable
    "apikey": SUPABASE_ANON_KEY,
    "Content-Type": "application/json"
  };

  // 1) Coba via SDK tapi pastikan headers ikut
  try {
    const { data, error } = await sb.functions.invoke(name, {
      body: payload,
      headers: baseHeaders
    });
    if (error) throw error;
    return data;
  } catch (e1) {
    showDebug(`[invoke:${name}] SDK gagal: ${e1?.message || e1}`);
  }

  // 2) Fallback langsung ke endpoint
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: baseHeaders,
    body: JSON.stringify(payload)
  });
  const text = await resp.text();
  showDebug(`[invoke:${name}] Fallback status ${resp.status} -> ${text.slice(0, 300)}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${text}`);
  return text ? JSON.parse(text) : {};
}


  /* ==================== UPLOAD UI ==================== */
  if (dropZone) dropZone.addEventListener('click', () => fileInput?.click());
  if (dropZone) dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('active'); });
  if (dropZone) dropZone.addEventListener('dragleave', () => dropZone.classList.remove('active'));
  if (dropZone) dropZone.addEventListener('drop', (e) => {
    e.preventDefault(); dropZone.classList.remove('active');
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  });
  if (fileInput) fileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  });

  function handleFile(file) {
    if (!file.type.startsWith('video/')) { alert('Format tidak didukung. Harap upload video.'); return; }
    if (!file.name.toLowerCase().endsWith('.mp4')) { alert('Hanya file .mp4 yang didukung.'); return; }
    if (file.size > 50 * 1024 * 1024) { alert('Video terlalu besar. Maksimal 50MB.'); return; }
    currentFile = file;
    const url = URL.createObjectURL(file);
    if (video) video.src = url;
    if (controls) controls.style.display = 'block';
  }

  /* ==================== LOOP PREVIEW ==================== */
  if (setLoopBtn) setLoopBtn.addEventListener('click', () => {
    const [minS, secS] = (startTimeInput?.value || '00:01').split(':').map(n => parseInt(n || '0', 10));
    const [minE, secE] = (endTimeInput?.value   || '00:05').split(':').map(n => parseInt(n || '0', 10));
    loopStart = minS * 60 + secS;
    loopEnd   = minE * 60 + secE;
    if (!Number.isFinite(loopStart) || !Number.isFinite(loopEnd)) { alert('Format waktu tidak valid (mm:ss).'); return; }
    if (loopStart >= loopEnd) { alert('Waktu mulai harus lebih kecil dari waktu selesai.'); return; }
    if (video) { video.currentTime = loopStart; video.play(); }
  });
  if (video) video.addEventListener('timeupdate', () => {
    if (video.currentTime >= loopEnd) video.currentTime = loopStart;
  });
  if (clearLoopBtn) clearLoopBtn.addEventListener('click', () => {
    const sti = document.getElementById('start-time');
    const eti = document.getElementById('end-time');
    if (sti) sti.value = '00:00';
    if (eti) eti.value = '00:30';
    loopStart = 0; loopEnd = 30;
  });

  /* ==================== EXPORT ==================== */
  if (exportVideoBtn) exportVideoBtn.addEventListener('click', () => {
    if (!currentFile) return alert('Upload dulu videonya!');
    exportViaServer("looped.mp4");
  });

  async function exportViaServer(filename) {
    try {
      if (!currentFile) throw new Error("Tidak ada file");
      loadingEl.style.display = 'block';
      mobileDownloadBtn.style.display = 'none';
      mobileDownloadBtn.removeAttribute('href');
      mobileDownloadBtn.removeAttribute('download');

      const up = await getSignedUpload(currentFile);
      showDebug(`signed-upload OK: ${up.path}`);

      await uploadWithToken(up.path, up.token, currentFile, up.contentType);
      showDebug(`uploadToSignedUrl OK`);

      const start = toMMSS(loopStart);
      const end   = toMMSS(loopEnd);
      const job = await requestCut(up.path, start, end);
      showDebug(`request-cut OK: output=${job.outputPath}`);

      const ready = await waitUntilReady(job.outputSignedDownloadUrl);
      if (!ready) throw new Error("Proses belum selesai atau gagal di server.");

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
      loadingEl.style.display = 'none';
    }
  }

  function toMMSS(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  // >>>> INI YANG TADI ERROR (null). Sekarang dipastikan ada sebelum dipakai.
  if (mobileDownloadBtn) {
    mobileDownloadBtn.addEventListener("click", (e) => {
      if (!mobileDownloadBtn.href) {
        e.preventDefault();
        alert("⚠️ Tidak ada file untuk diunduh. Silakan proses video dulu.");
      }
    });
  }
});
