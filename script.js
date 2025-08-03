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
  "COBA",  //  10x 
  "PRO2025", // buy 
  "LEVELLOOP" // 
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
  // Validasi: hanya .mp4
  if (!file.type.startsWith('video/')) {
    alert('Format tidak didukung. Harap upload video.');
    return;
  }

  if (!file.name.endsWith('.mp4')) {
    alert('Hanya file .mp4 yang didukung.');
    return;
  }

  // Batasi ukuran (max 50MB)
  if (file.size > 50 * 1024 * 1024) {
    alert('Video terlalu besar. Maksimal 50MB.');
    return;
  }

  currentFile = file;
  const url = URL.createObjectURL(file);
  video.src = url;
  controls.style.display = 'block';
}

// === Set Loop Range ===
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

// === AI Suggestion ===
aiSuggestBtn.addEventListener('click', () => {
  startTimeInput.value = '00:05';
  endTimeInput.value = '00:08';
  alert("AI: Rentang loop disarankan");
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
      alert("✅ Kode valid! Gunakan screen recorder untuk menyimpan.");
    }

    accessCodeInput.value = '';
  } else {
    alert("❌ Kode salah.");
  }
});

// === Fungsi: Potong & Download (FIX untuk HP) ===
async function downloadLoopedClip(filename) {
  try {
    console.log("🚀 Mulai proses...");

    if (!ffmpeg.isLoaded()) {
      alert("⏳ Memuat FFmpeg... (hanya sekali pertama)");
      await ffmpeg.load();
    }

    if (!currentFile) throw new Error("Tidak ada file");

    // ✅ Baca file sebagai ArrayBuffer
    const arrayBuffer = await currentFile.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // ✅ Simpan ke FFmpeg FS
    ffmpeg.FS("writeFile", "input.mp4", uint8Array);

    const startSec = loopStart;
    const duration = loopEnd - loopStart;

    if (duration <= 0) throw new Error("Durasi tidak valid");

    // ✅ Potong & re-encode ke format umum
    await ffmpeg.run(
      "-i", "input.mp4",
	  "-ss", startSec.toString(),
	  "-t", duration.toString(),
	  "-vf", "scale=480:-1",           //Turunkan resolusi
	  "-c:v", "libx264",
	  "-crf", "28",                    //Lebih cepat, sedikit turun kualitas
	  "-preset", "ultrafast",          //Jauh lebih cepat dari "fast"
	  "-tune", "fastdecode",           //Optimasi untuk video loop
	  "-c:a", "aac",
	  "-b:a", "64k",                   //Ringankan audio
	  "-threads", "1",
	  "output.mp4"
    );

    // ✅ Ambil hasil
    const data = ffmpeg.FS("readFile", "output.mp4");
    const blob = new Blob([data.buffer], { type: "video/mp4" });
    const url = URL.createObjectURL(blob);

    // 📱 HP: Tampilkan tombol manual
    const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/.test(navigator.userAgent);

    if (isMobile) {
      alert("🎥 Video siap! Klik tombol di bawah untuk download.");
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.textContent = "⬇️ Download Sekarang";
      a.style.display = "block";
      a.style.margin = "20px auto";
      a.style.padding = "12px 20px";
      a.style.backgroundColor = "#27ae60";
      a.style.color = "white";
      a.style.textAlign = "center";
      a.style.width = "80%";
      a.style.maxWidth = "300px";
      a.style.borderRadius = "8px";
      a.style.textDecoration = "none";
      a.target = "_blank";

      document.body.appendChild(a);
      a.scrollIntoView({ behavior: "smooth" });

      setTimeout(() => {
        if (document.body.contains(a)) document.body.removeChild(a);
      }, 30000);
    } else {
      // 💻 PC: Download otomatis
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    // ✅ Bersihkan
    ffmpeg.FS("unlink", "input.mp4");
    ffmpeg.FS("unlink", "output.mp4");

    console.log("✅ Sukses!");
  } catch (err) {
    console.error("❌ ERROR:", err);
    alert("Gagal proses video: " + (err.message || "Coba lagi"));
  }
}

