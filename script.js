// === DETEKSI MOBILE ===
const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/.test(navigator.userAgent);

// Inisialisasi FFmpeg
let { createFFmpeg } = FFmpeg;
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

// Modal
const codeModal = document.getElementById('code-modal');
const accessCodeInput = document.getElementById('access-code');
const cancelCodeBtn = document.getElementById('cancel-code');
const submitCodeBtn = document.getElementById('submit-code');
const mobileDownload = document.getElementById('mobile-download');

// Loop Vars
let loopStart = 1;
let loopEnd = 5;

// Kode Akses Valid
const VALID_CODES = ["COBA", "PRO2025", "LEVELLOOP"];
let betaUserUsed = false;

// File video
let currentFile;

// === Upload / Drag and Drop ===
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
  const file = e.dataTransfer.files[0];
  handleFile(file);
});
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handleFile(file);
});

function handleFile(file) {
  if (!file.type.startsWith('video/') || !file.name.endsWith('.mp4')) {
    alert('Hanya file .mp4 yang didukung.');
    return;
  }

  if (file.size > 50 * 1024 * 1024) {
    alert('Video terlalu besar. Maksimal 50MB.');
    return;
  }

  currentFile = file;
  const url = URL.createObjectURL(file);
  video.src = url;
  controls.style.display = 'block';
}

// === Loop Controls ===
setLoopBtn.addEventListener('click', () => {
  const [minS, secS] = startTimeInput.value.split(':').map(Number);
  const [minE, secE] = endTimeInput.value.split(':').map(Number);
  loopStart = minS * 60 + secS;
  loopEnd = minE * 60 + secE;

  if (loopStart >= loopEnd) {
    alert('Waktu mulai harus lebih kecil dari waktu selesai.');
    return;
  }

  video.currentTime = loopStart;
  video.play();
});

video.addEventListener('timeupdate', () => {
  if (video.currentTime >= loopEnd) {
    video.currentTime = loopStart;
  }
});

clearLoopBtn.addEventListener('click', () => {
  startTimeInput.value = '00:00';
  endTimeInput.value = '00:30';
  loopStart = 0;
  loopEnd = 30;
});

aiSuggestBtn.addEventListener('click', () => {
  startTimeInput.value = '00:05';
  endTimeInput.value = '00:08';
  alert("AI: Rentang loop disarankan");
});

// === Modal Export Video ===
exportVideoBtn.addEventListener('click', () => {
  if (!currentFile) {
    alert('Upload dulu videonya!');
    return;
  }
  codeModal.style.display = 'flex';
});

cancelCodeBtn.addEventListener('click', () => {
  codeModal.style.display = 'none';
  accessCodeInput.value = '';
});

submitCodeBtn.addEventListener('click', async () => {
  const code = accessCodeInput.value.trim().toUpperCase();

  if (!VALID_CODES.includes(code)) {
    alert("❌ Kode salah.");
    return;
  }

  codeModal.style.display = 'none';
  accessCodeInput.value = '';

  if (code === "PRO2025") {
    await downloadLoopedClip("looped-pro.mp4");
  } else if (code === "BETAUSER") {
    if (!betaUserUsed) {
      await download
