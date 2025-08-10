// === [CONFIG SUPABASE] Ganti sesuai project-mu ===
const SUPABASE_URL = "https://uaeksmqplskfrxxwwtbu.supabase.co";  // TODO
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhZWtzbXFwbHNrZnJ4eHd3dGJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ3Mjk3MjcsImV4cCI6MjA3MDMwNTcyN30.j8SQcbk3lBfhnTgcpKH9cDtI6NgRcxiDhxWegDSxH24";                 // TODO
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// === DOM ===
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const video = document.getElementById('video');
const controls = document.getElementById('controls');
const setLoopBtn = document.getElementById('set-loop');
const clearLoopBtn = document.getElementById('clear-loop');
const startTimeInput = document.getElementById('start-time');
const endTimeInput = document.getElementById('end-time');
const exportVideoBtn = document.getElementById('export-video');
const mobileDownloadBtn = document.getElementById('mobile-download');
const loadingEl = document.getElementById('loading');

// === State ===
let currentFile=null, loopStart=5, loopEnd=15, lastBlobUrl=null;

// === Helpers ===
const toMMSS = (sec)=>`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(Math.floor(sec%60)).padStart(2,'0')}`;

async function getSignedUpload(file){
  const { data, error } = await sb.functions.invoke('signed-upload', {
    body: { filename: file.name, contentType: file.type||'video/mp4' }
  });
  if (error) throw new Error(error.message);
  return data; // { path, token, contentType }
}
async function uploadWithToken(path, token, file, contentType){
  const { error } = await sb.storage.from('videos').uploadToSignedUrl(path, token, file, { contentType });
  if (error) throw new Error(error.message);
}
async function requestCut(path, start, end){
  const { data, error } = await sb.functions.invoke('request-cut', { body: { path, start, end } });
  if (error) throw new Error(error.message);
  return data; // { outputSignedDownloadUrl, ... }
}
async function waitUntilReady(url, tries=120, interval=5000){
  for(let i=0;i<tries;i++){
    const r = await fetch(url, { method:'HEAD', cache:'no-store' });
    if (r.ok) return true;
    await new Promise(res=>setTimeout(res, interval));
  }
  return false;
}

// === Upload UI ===
dropZone.addEventListener('click', ()=>fileInput.click());
dropZone.addEventListener('dragover', e=>{ e.preventDefault(); dropZone.classList.add('active'); });
dropZone.addEventListener('dragleave', ()=>dropZone.classList.remove('active'));
dropZone.addEventListener('drop', e=>{
  e.preventDefault(); dropZone.classList.remove('active');
  const f = e.dataTransfer.files?.[0]; if (f) handleFile(f);
});
fileInput.addEventListener('change', e=>{
  const f = e.target.files?.[0]; if (f) handleFile(f);
});
function handleFile(file){
  if(!file.type.startsWith('video/')) return alert('Harap upload video.');
  if(!file.name.toLowerCase().endsWith('.mp4')) return alert('Hanya .mp4');
  if(file.size > 50*1024*1024) return alert('Maksimal 50MB.');
  currentFile = file;
  const url = URL.createObjectURL(file); video.src = url; controls.style.display='block';
}

// === Loop preview ===
setLoopBtn.addEventListener('click', ()=>{
  const [ms,ss] = startTimeInput.value.split(':').map(n=>+n||0);
  const [me,se] = endTimeInput.value.split(':').map(n=>+n||0);
  loopStart = ms*60+ss; loopEnd = me*60+se;
  if(loopStart>=loopEnd) return alert('Start harus < End');
  video.currentTime = loopStart; video.play();
});
video.addEventListener('timeupdate', ()=>{ if(video.currentTime>=loopEnd){ video.currentTime=loopStart; video.play(); } });
clearLoopBtn.addEventListener('click', ()=>{ startTimeInput.value='00:00'; endTimeInput.value='00:30'; loopStart=0; loopEnd=30; });

// === Export ===
exportVideoBtn.addEventListener('click', async ()=>{
  if(!currentFile) return alert('Upload video dulu.');

  loadingEl.style.display='block'; mobileDownloadBtn.style.display='none';
  try{
    // 1) Signed upload
    const up = await getSignedUpload(currentFile);
    // 2) Upload ke Storage
    await uploadWithToken(up.path, up.token, currentFile, up.contentType);
    // 3) Minta pemotongan
    const job = await requestCut(up.path, toMMSS(loopStart), toMMSS(loopEnd));
    // 4) Polling hasil
    const ready = await waitUntilReady(job.outputSignedDownloadUrl);
    if(!ready) throw new Error('Proses belum selesai / gagal di server.');
    // 5) Download
    const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
    if(isMobile){
      alert('🎥 Video siap! Klik tombol hijau untuk download.');
      mobileDownloadBtn.href = job.outputSignedDownloadUrl;
      mobileDownloadBtn.download = 'looped.mp4';
      mobileDownloadBtn.style.display='block';
      mobileDownloadBtn.scrollIntoView({behavior:'smooth'});
    }else{
      const a=document.createElement('a'); a.href=job.outputSignedDownloadUrl; a.download='looped.mp4';
      document.body.appendChild(a); a.click(); a.remove();
    }
  }catch(err){
    console.error(err); alert('Gagal memproses: '+(err.message||err));
  }finally{
    loadingEl.style.display='none';
  }
});

mobileDownloadBtn.addEventListener('click', e=>{
  if(!mobileDownloadBtn.href){ e.preventDefault(); alert('Belum ada file.'); }
});
