// Tunggu window dan FFmpeg siap
window.addEventListener('load', async () => {
  // Cek apakah FFmpeg tersedia
  if (typeof createFFmpeg === 'undefined') {
    alert('❌ FFmpeg gagal dimuat. Cek koneksi atau refresh halaman.');
    console.error('FFmpeg tidak tersedia. Pastikan CDN benar.');
    return;
  }

  // Inisialisasi FFmpeg
  const ffmpeg = createFFmpeg({ log: false });

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

  const codeModal = document.getElementById('code-modal');
  const accessCodeInput = document.getElementById('access-code');
  const cancelCodeBtn = document.getElementById('cancel-code');
  const submitCodeBtn = document.getElementById('submit-code');

  // === Loading Indicator ===
  const loading = document.getElementById('loading');

  // === Loop Variables ===
  let loopStart = 1;
  let loopEnd = 5; // ✅ Ganti 05 → 5 (oktal → desimal)

  // === Daftar Kode Valid ===
  const VALID_CODES = [
    "COBA",     // 10x
    "PRO2025",  // beli
    "LEVELLOOP"
  ];

  // === Tracking penggunaan kode BETAUSER ===
  let betaUserUsed = false;

  // === Simpan file asli saat upload ===
  let currentFile;

  // === Drag & Drop Upload ===
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    fileInput.click();
  });

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
    alert("🎥 Video terpilih, sedang dimuat...");

    if (!file.type.startsWith('video/')) {
      alert('Format tidak didukung. Harap upload video.');
      return;
    }
    if (!file.name.endsWith('.mp4')) {
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

  // === Set Loop Range (tambah touchstart) ===
  ['click', 'touchstart'].forEach(event => {
    setLoopBtn.addEventListener(event, () => {
      const [minS, secS] = startTimeInput.value.split(':').map(Number);
      const [minE, secE] = endTimeInput.value.split(':').map(Number);

      if (isNaN(minS) || isNaN(secS) || isNaN(minE) || isNaN(secE)) {
        alert('Format waktu salah. Gunakan mm:ss');
        return;
      }

      loopStart = minS * 60 + secS;
      loopEnd = minE * 60 + secE;

      if (loopStart >= loopEnd) {
        alert('Waktu mulai harus lebih kecil dari waktu selesai.');
        return;
      }

      video.currentTime = loopStart;
      video.play();
    });
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

  // === AI Suggestion (tambah touchstart) ===
  ['click', 'touchstart'].forEach(event => {
    aiSuggestBtn.addEventListener(event, () => {
      startTimeInput.value = '00:05';
      endTimeInput.value = '00:08';
      loopStart = 5;
      loopEnd = 8;
      video.currentTime = loopStart;
      alert("🧠 AI: Rentang loop disarankan (5-8 detik)");
    });
  });

  // === Export dengan Kode Akses (tambah touchstart) ===
  ['click', 'touchstart'].forEach(event => {
    exportVideoBtn.addEventListener(event, () => {
      if (!currentFile) {
        alert('Upload dulu videonya!');
        return;
      }
      codeModal.style.display = 'flex';
    });
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
        alert("✅ Kode valid! Tunggu Proses Download Selesai.");
      }

      accessCodeInput.value = '';
    } else {
      alert("❌ Kode salah.");
    }
  });

  // === Fungsi: Potong & Download (Optimasi HP) ===
  async function downloadLoopedClip(filename) {
    try {
      loading.style.display = 'block';
      console.log("🚀 Mulai proses...");

      if (!ffmpeg.isLoaded()) {
        alert("⏳ Memuat FFmpeg... (hanya sekali pertama)");
        await ffmpeg.load();
      }

      if (!currentFile) throw new Error("Tidak ada file");

      const arrayBuffer = await currentFile.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      ffmpeg.FS("writeFile", "input.mp4", uint8Array);

      const startSec = loopStart;
      const duration = loopEnd - loopStart;

      if (duration <= 0) throw new Error("Durasi tidak valid");

      await ffmpeg.run(
        "-i", "input.mp4",
        "-ss", startSec.toString(),
        "-t", duration.toString(),
        "-vf", "scale=480:-1",
        "-c:v", "libx264",
        "-crf", "28",
        "-preset", "ultrafast",
        "-tune", "fastdecode",
        "-c:a", "aac",
        "-b:a", "64k",
        "-threads", "1",
        "output.mp4"
      );

      let data;
      try {
        data = ffmpeg.FS("readFile", "output.mp4");
      } catch (err) {
        console.error("Gagal baca output.mp4", err);
        alert("Gagal baca hasil video. Coba lagi.");
        loading.style.display = 'none';
        return;
      }

      const blob = new Blob([data.buffer], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);

      const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);

      // ✅ Notifikasi sukses
      alert("✅ Video berhasil diproses! Klik tombol di bawah untuk download.");

      if (isMobile) {
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
      URL.revokeObjectURL(url);

      console.log("✅ Sukses!");
    } catch (err) {
      console.error("❌ ERROR:", err);
      alert("Gagal proses video: " + (err.message || "Coba lagi"));
    } finally {
      loading.style.display = 'none';
    }
  }
});
