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

async function handleFile(file) {
  if (!file.type.startsWith('video/')) {
    alert('Please upload a valid video file.');
    return;
  }

  // Pastikan hanya .mp4
  if (!file.name.endsWith('.mp4')) {
    alert('Only .mp4 files are supported.');
    return;
  }

  // Batasi ukuran video maksimal 50MB
  if (file.size > 50 * 1024 * 1024) {
    alert('Video terlalu besar. Silakan unggah video kurang dari 50MB.');
    return;
  }

  currentFile = file; // Simpan file asli
  const url = URL.createObjectURL(file);
  video.src = url;
  controls.style.display = 'block';

  // Tambahkan jeda 2 detik untuk memastikan file sepenuhnya tersedia
  await new Promise((resolve) => setTimeout(resolve, 2000));
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

// === Fungsi: Potong & Download Sesuai Loop Range (dengan re-encode) ===
async function downloadLoopedClip(filename) {
  try {
    console.log("🚀 Mulai proses download...");

    // Load FFmpeg jika belum
    if (!ffmpeg.isLoaded()) {
      alert("📥 Memuat FFmpeg... Tunggu sebentar (hanya sekali pertama)");
      await ffmpeg.load();
      console.log("✅ FFmpeg berhasil dimuat");
    }

    if (!currentFile) throw new Error("Tidak ada file yang diupload");

    // Simpan file sementara menggunakan fetchFile
    console.log("📄 Mengunduh file video...");
    const tempFilePath = await fetchFile(currentFile);

    // Baca file sementara
    console.log("💾 Menulis ke sistem file FFmpeg...");
    ffmpeg.FS("writeFile", "input.mp4", ffmpeg.FS("readFile", tempFilePath));

    // Debug: Cek apakah file berhasil dibaca
    const inputFileContent = ffmpeg.FS("readFile", "input.mp4");
    console.log("✅ File input berhasil dibaca:", inputFileContent.length, "bytes");

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
      "-c:v", "libx264",        // Re-encode video ke H.264
      "-crf", "23",             // Kualitas video (23 = standar)
      "-preset", "fast",        // Kecepatan encode (fast, medium, slow)
      "-c:a", "aac",            // Re-encode audio ke AAC
      "-b:a", "128k",           // Bitrate audio
      "output.mp4"
    );
    console.log("✅ Proses encode dan potong selesai");

    // Ambil hasil
    const data = ffmpeg.FS("readFile", "output.mp4");
    const blob = new Blob([data.buffer], { type: "video/mp4" });
    const url = URL.createObjectURL(blob);

    // 🔍 Cek apakah di HP
    const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/.test(navigator.userAgent);

    if (isMobile) {
      // 📱 HP: Tampilkan link manual
      alert(`🎥 Video siap! Klik tombol di bawah untuk download.\n\nCatatan: Buka di Chrome untuk hasil terbaik.`);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.textContent = `⬇️ Download ${filename}`;
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
      a.target = "_blank"; // Untuk iOS

      // Tambahkan ke modal atau atas video
      document.body.appendChild(a);

      // Opsional: scroll ke tombol
      a.scrollIntoView({ behavior: "smooth" });

      // Opsional: hilang setelah 30 detik
      setTimeout(() => {
        if (document.body.contains(a)) {
          document.body.removeChild(a);
        }
      }, 30000);
    } else {
      // 💻 Komputer: Download otomatis
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    // Bersihkan
    ffmpeg.FS("unlink", "input.mp4");
    ffmpeg.FS("unlink", "output.mp4");

    console.log("✅ Download selesai");
  } catch (err) {
    console.error("❌ ERROR:", err);
    alert("Gagal proses video:\n" + (err.message || "Error tidak diketahui"));
  }
}
