/*******************************************************
 * Server mode: Supabase Edge Functions + HF
 * Patch 2025-08-10 — harden DOM + header publishable
 *******************************************************/
document.addEventListener('DOMContentLoaded', () => {
  // === SUPABASE CONFIG (pakai Publishable key, prefix sb_publishable_) ===
  const SUPABASE_URL = "https://uaeksmqplskfrxxwwtbu.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_2wCBhyPtiw739jpS3McxRQ_xpYTQ2Mk"; // <- ganti
  if (!window.supabase) { alert("Supabase SDK belum dimuat"); return; }
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log("[supabase key prefix]", SUPABASE_ANON_KEY.slice(0,16)); // harus sb_publishable_

  // === DOM safe helpers ===
  const $ = (sel) => document.querySelector(sel);
  const ensure = (sel, create) => { let el=$(sel); if(!el && create){el=create();} return el; };

  const dropZone = $('#drop-zone');
  const fileInput = $('#file-input');
  const video = ensure('#video', () => {
    const v=document.createElement('video'); v.id='video'; v.controls=true; document.body.appendChild(v); return v;
  });
  const controls = ensure('#controls');
  const setLoopBtn = $('#set-loop');
  const clearLoopBtn = $('#clear-loop');
  const startTimeInput = $('#start-time');
  const endTimeInput = $('#end-time');
  const exportVideoBtn = $('#export-video');
  let mobileDownloadBtn = $('#mobile-download');
  if (!mobileDownloadBtn) {
    mobileDownloadBtn = document.createElement('a');
    mobileDownloadBtn.id='mobile-download'; mobileDownloadBtn.textContent='⬇️ Download Video';
    mobileDownloadBtn.style.display='none'; mobileDownloadBtn.setAttribute('download',''); document.body.appendChild(mobileDownloadBtn);
  }
  let loadingEl = $('#loading');
  if (!loadingEl) {
    loadingEl = document.createElement('div'); loadingEl.id='loading';
    loadingEl.style.cssText='display:none;text-align:center;margin:20px 0;';
    loadingEl.innerHTML=`<p>🎥 Memproses video di server... (jangan tutup halaman)</p><div class="spinner"></div>`;
    document.body.appendChild(loadingEl);
  }

  // === STATE ===
  let loopStart = 1, loopEnd = 5, currentFile = null;

  // === Debug panel ===
  function showDebug(msg){
    let el=$('#debug-log');
    if(!el){ el=document.createElement('pre'); el.id='debug-log';
      el.style.cssText='white-space:pre-wrap;background:#111;color:#0f0;padding:8px;border-radius:8px;max-height:200px;overflow:auto;margin:12px;';
      document.body.appendChild(el);
    }
    el.textContent += `\n${new Date().toLocaleTimeString()}  ${msg}`;
  }

  // === EDGE INVOKER (SDK w/headers → fallback fetch) ===
  async function invokeEdge(name, payload){
    const baseHeaders={
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "apikey": SUPABASE_ANON_KEY,
      "Content-Type": "application/json"
    };
    try{
      const {data,error}=await sb.functions.invoke(name,{body:payload,headers:baseHeaders});
      if(error) throw error; return data;
    }catch(e1){
      showDebug(`[invoke:${name}] SDK gagal: ${e1?.message||e1}`);
      const resp=await fetch(`${SUPABASE_URL}/functions/v1/${name}`,{
        method:'POST', headers:baseHeaders, body:JSON.stringify(payload)
      });
      const text=await resp.text();
      showDebug(`[invoke:${name}] Fallback status ${resp.status} -> ${text.slice(0,300)}`);
      if(!resp.ok) throw new Error(`HTTP ${resp.status} ${text}`);
      return text?JSON.parse(text):{};
    }
  }

  // === HELPERS (pastikan didefinisikan SEBELUM exportViaServer) ===
  async function getSignedUpload(file){
    return await invokeEdge('signed-upload', {
      filename: file.name,
      contentType: file.type || 'video/mp4'
    });
  }
  async function uploadWithToken(path, token, file, contentType){
    const { error } = await sb.storage.from('videos')
      .uploadToSignedUrl(path, token, file, { contentType });
    if (error) throw new Error(error.message || 'uploadToSignedUrl failed');
  }
  async function requestCut(path, start, end){
    return await invokeEdge('request-cut', { path, start, end });
  }
  async function waitUntilReady(url, tries=120, intervalMs=5000){
    for(let i=0;i<tries;i++){
      try{ const r=await fetch(url,{method:'HEAD',cache:'no-store'}); if(r.ok) return true; }catch(_){}
      await new Promise(res=>setTimeout(res, intervalMs));
    }
    return false;
  }
  const toMMSS = (sec)=>`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(Math.floor(sec%60)).padStart(2,'0')}`;

  // === Upload UI ===
  if (dropZone) dropZone.addEventListener('click',()=>fileInput?.click());
  if (dropZone) dropZone.addEventListener('dragover',(e)=>{e.preventDefault(); dropZone.classList.add('active');});
  if (dropZone) dropZone.addEventListener('dragleave',()=>dropZone.classList.remove('active'));
  if (dropZone) dropZone.addEventListener('drop',(e)=>{e.preventDefault(); dropZone.classList.remove('active'); const f=e.dataTransfer.files?.[0]; if(f) handleFile(f);});
  if (fileInput) fileInput.addEventListener('change',(e)=>{ const f=e.target.files?.[0]; if(f) handleFile(f); });

  function handleFile(file){
    if(!file.type.startsWith('video/')){ alert('Format tidak didukung. Harap upload video.'); return; }
    if(!file.name.toLowerCase().endsWith('.mp4')){ alert('Hanya file .mp4 yang didukung.'); return; }
    if(file.size>50*1024*1024){ alert('Video terlalu besar. Maksimal 50MB.'); return; }
    currentFile=file; const url=URL.createObjectURL(file);
    if(video) video.src=url; if(controls) controls.style.display='block';
  }

  // === Loop preview ===
  if (setLoopBtn) setLoopBtn.addEventListener('click', ()=>{
    const [mS,sS]=(startTimeInput?.value||'00:01').split(':').map(n=>parseInt(n||'0',10));
    const [mE,sE]=(endTimeInput?.value||'00:05').split(':').map(n=>parseInt(n||'0',10));
    loopStart=mS*60+sS; loopEnd=mE*60+sE;
    if(!(isFinite(loopStart)&&isFinite(loopEnd))) return alert('Format waktu tidak valid (mm:ss).');
    if(loopStart>=loopEnd) return alert('Waktu mulai harus lebih kecil dari waktu selesai.');
    if(video){ video.currentTime=loopStart; video.play(); }
  });
  if (video) video.addEventListener('timeupdate', ()=>{ if(video.currentTime>=loopEnd) video.currentTime=loopStart; });
  if (clearLoopBtn) clearLoopBtn.addEventListener('click', ()=>{
    if(startTimeInput) startTimeInput.value='00:00'; if(endTimeInput) endTimeInput.value='00:30'; loopStart=0; loopEnd=30;
  });

  // === Export ===
  if (exportVideoBtn) exportVideoBtn.addEventListener('click', ()=>{
    if(!currentFile) return alert('Upload dulu videonya!');
    exportViaServer('looped.mp4');
  });

  async function exportViaServer(filename){
    try{
      if(!currentFile) throw new Error('Tidak ada file');
      loadingEl.style.display='block';
      mobileDownloadBtn.style.display='none'; mobileDownloadBtn.removeAttribute('href'); mobileDownloadBtn.removeAttribute('download');

      const up = await getSignedUpload(currentFile);
      showDebug(`signed-upload OK: ${up.path}`);

      await uploadWithToken(up.path, up.token, currentFile, up.contentType);
      showDebug(`uploadToSignedUrl OK`);

      const job = await requestCut(up.path, toMMSS(loopStart), toMMSS(loopEnd));
      showDebug(`request-cut OK: output=${job.outputPath}`);

      const ready = await waitUntilReady(job.outputSignedDownloadUrl);
      if(!ready) throw new Error('Proses belum selesai atau gagal di server.');

      const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
      if(isMobile){
        alert("🎥 Video siap! Klik tombol hijau untuk download.");
        mobileDownloadBtn.href=job.outputSignedDownloadUrl;
        mobileDownloadBtn.download=filename;
        mobileDownloadBtn.style.display='block';
        mobileDownloadBtn.scrollIntoView({behavior:'smooth'});
      }else{
        const a=document.createElement('a'); a.href=job.outputSignedDownloadUrl; a.download=filename;
        document.body.appendChild(a); a.click(); a.remove();
      }
    }catch(err){
      console.error("✖ ERROR (server export):", err);
      alert("Gagal memproses: " + (err.message || err));
    }finally{
      loadingEl.style.display='none';
    }
  }

  // mobile manual dl guard
  mobileDownloadBtn.addEventListener('click',(e)=>{
    if(!mobileDownloadBtn.href){ e.preventDefault(); alert("⚠️ Tidak ada file untuk diunduh. Silakan proses video dulu."); }
  });
});
