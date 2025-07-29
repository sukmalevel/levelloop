// Inisialisasi FFmpeg
let { createFFmpeg, fetchFile } = FFmpeg;
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

// === Modal Elements ===
const codeModal = document.getElementById('code-modal');
const accessCodeInput = document.getElementById('access-code');
const cancelCodeBtn = document.getElementById('cancel-code');
const submitCodeBtn = document.getElementById('submit-code');

// === Loop Variables ===
let loopStart = 5;
let loopEnd = 15;

// === Daftar Kode Valid ===
const VALID_CODES = [
  "TRYLOOP2025",
  "PRO2025",
  "BETAUSER",
  "LEVELLOOP"
];

// === Tracking penggunaan kode BETAUSER ===
let betaUserUsed = false;

// === Simpan file asli saat upload ===
let currentFile;

// === Drag & Drop Upload ===
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
  if (!file.type.startsWith('video/')) {
    alert('Please upload a valid video file.');
    return;
  }

  currentFile = file; // Simpan file asli
  const url = URL.createObjectURL(file);
  video.src = url;
  controls.style.display = 'block';
}

// === Set Loop Range ===
setLoopBtn.addEventListener('click', () => {
  const startStr = startTimeInput.value;
  const endStr = endTimeInput.value;

  const [minS, secS] = startStr.split(':').map(Number);
  const [minE, secE] = endStr.split(':').map(Number);

  loopStart = minS * 60 + secS;
  loopEnd = minE * 60 + secE;

  if (loopStart >= loopEnd) {
    alert('Start time must be less than end time.');
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

// === AI Suggestion (mock) ===
aiSuggestBtn.addEventListener('click', () => {
  alert("AI: Menganalisis video... (Fitur demo)");
  startTimeInput.value = '00:05';
  endTimeInput.value = '00:08';
});

// === Export dengan Kode Akses ===
exportVideoBtn.addEventListener('click', () => {
  if (!currentFile) {
    alert('Upload dulu videonya!');
    return;
  }
  codeModal.style.display = 'flex';
});

// === Modal Logic ===
cancelCodeBtn.addEventListener('click', () => {
  codeModal.style.display = 'none';
  accessCodeInput.value = '';
});

submitCodeBtn.addEventListener('click', async () => {
  const code = accessCodeInput.value.trim().toUpperCase();

  if (VALID_CODES.includes(code)) {
    codeModal.style.display = 'none';

    if (code === "PRO2025") {
      await downloadLoopedClip("looped-pro.mp4");
    } else if (code === "BETAUSER") {
      if (!betaUserUsed) {
        await downloadLoopedClip("looped-beta.mp4");
        betaUserUsed = true;
      } else {
        alert("❌ Kode BETAUSER hanya bisa digunakan 1 kali.");
      }
    } else {
      alert("✅ Kode valid! Gunakan screen recorder untuk menyimpan video loop.");
    }

    accessCodeInput.value = '';
  } else {
    alert("❌ Kode salah. Hubungi admin untuk akses.");
  }
});

// === Fungsi: Potong & Download Sesuai Loop Range ===
async function downloadLoopedClip(filename) {
  try {
    console.log("🚀 Mulai proses download...");
    if (!ffmpeg.isLoaded()) {
      alert("📥 Memuat FFmpeg... Tunggu sebentar (hanya sekali pertama)");
      await ffmpeg.load();
      console.log("✅ FFmpeg berhasil dimuat");
    }

    if (!currentFile) throw new Error("Tidak ada file yang diupload");

    console.log("📄 Membaca file video...");
    const arrayBuffer = await currentFile.arrayBuffer();

    console.log("💾 Menulis ke sistem file FFmpeg...");
    ffmpeg.FS("writeFile", "input.mp4", new Uint8Array(arrayBuffer));

    const startSec = loopStart;
    const duration = loopEnd - loopStart;

    if (duration <= 0) {
      throw new Error("Durasi loop tidak valid");
    }

    console.log(`✂️ Memotong dari ${startSec}s, durasi ${duration}s`);
    await ffmpeg.run(
      "-i", "input.mp4",
      "-ss", startSec.toString(),
      "-t", duration.toString(),
      "-c", "copy",
      "output.mp4"
    );
    console.log("✅ Proses potong selesai");

    const data = ffmpeg.FS("readFile", "output.mp4");
    const blob = new Blob([data.buffer], { type: "video/mp4" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    ffmpeg.FS("unlink", "input.mp4");
    ffmpeg.FS("unlink", "output.mp4");

    alert(`🎉 Berhasil! ${filename} terdownload.`);
  } catch (err) {
    console.error("❌ ERROR:", err);
    alert("Gagal proses video:\n" + (err.message || "Error tidak diketahui"));
  }
}
