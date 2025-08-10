/*******************************************************
 * LevelLoop — Server mode (Supabase Edge + HF)
 * FINAL — filename paksa "levelloop.mp4", tanpa log,
 * polling cepat (800ms)
 *******************************************************/
document.addEventListener('DOMContentLoaded', () => {
  /* =============== CONFIG =============== */
  const SUPABASE_URL = "https://uaeksmqplskfrxxwwtbu.supabase.co";   // <- punyamu
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_2wCBhyPtiw739jpS3McxRQ_xpYTQ2Mk"; // <- isi publishable key
  const STORAGE_BUCKET = "videos";

  // Bersihkan sisa debug lama bila ada
  const oldLog = document.getElementById('debug-log');
  if (oldLog) oldLog.remove();

  if (!window.supabase) { alert("Supabase SDK belum dimuat"); return; }
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

  /* =============== DOM =============== */
  const $ = (sel) => document.querySelector(sel);
  const dropZone = $('#drop-zone');
  const fileInput = $('#file-input');
  const video = $('#video');
  const controls = $('#controls');
  const setLoopBtn = $('#set-loop');
  const clearLoopBtn = $('#clear-loop');
  const startTimeInput = $('#start-time');
  const endTimeInput   = $('#end-time');
  const exportVideoBtn = $('#export-video');
  const loadingEl = $('#loading');
  const mobileDownloadBtn = $('#mobile-download');

  /* =============== STATE =============== */
  let loopStart = 1, loopEnd = 5, currentFile = null;

  /* =============== Edge invoker (fetch only) =============== */
  async function invokeEdge(name, payload){
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const text = await resp.text();
    if (!resp.ok) throw new Error(text || `HTTP ${resp.status}`);
    return text ? JSON.parse(text) : {};
  }

  /* =============== Helpers =============== */
  async function getSignedUpload(file){
    return await invokeEdge('signed-upload', {
      filename: file.name,
      contentType: file.type || 'video/mp4'
    });
  }

  async function uploadWithToken(path, token, file, contentType){
    const { error } = await sb.storage.from(STORAGE_BUCKET)
      .uploadToSignedUrl(path, token, file, { contentType });
    if (error) throw new Error(error.message || 'uploadToSignedUrl failed');
  }

  async function requestCut(path, start, end){
    return await invokeEdge('request-cut', { path, start, end });
  }

  // Poll outputCheckUrl sampai link siap
  async function waitForDownloadLink(job, tries = 300, intervalMs = 800){
    if (job.outputSignedDownloadUrl) return job.outputSignedDownloadUrl; // fallback kalau tersedia
    const checkUrl = job.outputCheckUrl;
    for (let i=0; i<tries; i++){
      try{
        const r = await fetch(checkUrl, { cache: 'no-store' });
        if (r.ok) {
          const j = await r.json();
          if (j.ready && j.url) return j.url;
        }
      }catch(_){}
      await new Promise(res => setTimeout(res, intervalMs));
    }
    throw new Error('Timeout menunggu output siap.');
  }

  // Paksa nama file dengan fetch -> blob -> ObjectURL
  async function forceDownload(url, filename){
    const resp = await fetch(url, { credentials: 'omit', cache: 'no-store' });
    if (!resp.ok) throw new Error(`Gagal ambil hasil (${resp.status})`);
    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;                 // <-- ini yang memaksa nama
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  }

  const toMMSS = (sec)=>`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(Math.floor(sec%60)).padStart(2,'0')}`;

  /* =============== Upload UI =============== */
  dropZone?.addEventListener('click', ()=> fileInput?.click());
  dropZone?.addEventListener('dragover', (e)=>{ e.preventDefault(); dropZone.classList.add('active'); });
  dropZone?.addEventListener('dragleave', ()=> dropZone.classList.remove('active'));
  dropZone?.addEventListener('drop', (e)=>{
    e.preventDefault(); dropZone.classList.remove('active');
    const f = e.dataTransfer.files?.[0]; if (f) handleFile(f);
  });
  fileInput?.addEventListener('change', (e)=>{
    const f = e.target.files?.[0]; if (f) handleFile(f);
  });

  function handleFile(file){
    if (!file.type.startsWith('video/'))                    { alert('Format tidak didukung. Harap upload video.'); return; }
    if (!file.name.toLowerCase().endsWith('.mp4'))          { alert('Hanya file .mp4 yang didukung.'); return; }
    if (file.size > 50 * 1024 * 1024)                       { alert('Video terlalu besar. Maksimal 50MB.'); return; }
    currentFile = file;
    const url = URL.createObjectURL(file);
    if (video)   video.src = url;
    if (controls) controls.style.display = 'block';
  }

  /* =============== Loop preview =============== */
  setLoopBtn?.addEventListener('click', ()=>{
    const [mS,sS] = (startTimeInput?.value || '00:01').split(':').map(n=>parseInt(n||'0',10));
    const [mE,sE] = (endTimeInput?.value   || '00:05').split(':').map(n=>parseInt(n||'0',10));
    loopStart = mS*60 + sS;
    loopEnd   = mE*60 + sE;
    if (!(isFinite(loopStart)&&isFinite(loopEnd))) return alert('Format waktu tidak valid (mm:ss).');
    if (loopStart >= loopEnd) return alert('Waktu mulai harus lebih kecil dari waktu selesai.');
    if (video){ video.currentTime = loopStart; video.play(); }
  });

  video?.addEventListener('timeupdate', ()=>{
    if (video.currentTime >= loopEnd) video.currentTime = loopStart;
  });

  clearLoopBtn?.addEventListener('click', ()=>{
    if (startTimeInput) startTimeInput.value = '00:00';
    if (endTimeInput)   endTimeInput.value   = '00:30';
    loopStart = 0; loopEnd = 30;
  });

  /* =============== Export =============== */
  exportVideoBtn?.addEventListener('click', ()=>{
    if (!currentFile) return alert('Upload dulu videonya!');
    exportViaServer('levelloop.mp4'); // nama fix di sini
  });

  async function exportViaServer(filename){
    try{
      if (!currentFile) throw new Error('Tidak ada file');
      loadingEl.style.display = 'block';
      mobileDownloadBtn.style.display = 'none';
      mobileDownloadBtn.removeAttribute('href');
      mobileDownloadBtn.removeAttribute('download');

      // 1) signed-upload
      const up = await getSignedUpload(currentFile);

      // 2) upload ke storage
      await uploadWithToken(up.path, up.token, currentFile, up.contentType);

      // 3) minta proses cut
      const job = await requestCut(up.path, toMMSS(loopStart), toMMSS(loopEnd));

      // 4) tunggu link siap
      const dlUrl = await waitForDownloadLink(job);

      // 5) paksa nama file
      await forceDownload(dlUrl, filename);

      // opsi: tampilkan tombol manual untuk HP kalau perlu
      mobileDownloadBtn.style.display = 'none';
    } catch (err){
      console.error("✖ ERROR (server export):", err);
      alert("Gagal memproses: " + (err.message || err));
    } finally {
      loadingEl.style.display = 'none';
    }
  }

  // Guard tombol download HP (kalau muncul)
  mobileDownloadBtn?.addEventListener('click', (e)=>{
    if (!mobileDownloadBtn.href) {
      e.preventDefault();
      alert("⚠️ Tidak ada file untuk diunduh. Silakan proses video dulu.");
    }
  });
});
