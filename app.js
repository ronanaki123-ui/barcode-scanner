let isSoundEnabled = true;
let scanHistory = [];
const zxingReader = new ZXing.BrowserMultiFormatReader();

// DOM参照
const cameraInput = document.getElementById('cameraInput');
const imagePreview = document.getElementById('imagePreview');
const overlayCanvas = document.getElementById('overlayCanvas');
const placeholderView = document.getElementById('placeholderView');
const canvas = document.getElementById('captureCanvas');
const captureBtn = document.getElementById('captureBtn');
const resultText = document.getElementById('resultText');
const scanFormat = document.getElementById('scanFormat');
const resultActions = document.getElementById('resultActions');
const copyBtn = document.getElementById('copyBtn');
const searchGoogleBtn = document.getElementById('searchGoogleBtn');
const historyList = document.getElementById('historyList');
const emptyHistory = document.getElementById('emptyHistory');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const soundToggleBtn = document.getElementById('soundToggleBtn');
const soundIcon = document.getElementById('soundIcon');
const soundLabel = document.getElementById('soundLabel');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toastMsg');

lucide.createIcons();

// ボタンクリックでデバイス標準カメラを起動
captureBtn.addEventListener('click', () => {
    cameraInput.click();
});

// 写真が撮影・選択された時の処理
cameraInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const img = new Image();
    img.onload = async () => {
        // プレビュー表示
        imagePreview.src = img.src;
        imagePreview.classList.remove('hidden');
        placeholderView.classList.add('hidden');

        // オーバーレイ用キャンバス初期化
        overlayCanvas.width = img.width;
        overlayCanvas.height = img.height;
        overlayCanvas.classList.remove('hidden');
        clearOverlay();

        // 解析キャンバスに描画
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        // 解析開始
        await scanCanvas(img.src);
    };
    img.src = URL.createObjectURL(file);
});

function clearOverlay() {
    const ctx = overlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
}

// 検出領域（四角枠）の描画処理
function drawBoundingBox(points) {
    if (!points || points.length === 0) return;
    const ctx = overlayCanvas.getContext('2d');

    ctx.strokeStyle = '#ef4444'; // 赤色
    ctx.lineWidth = Math.max(4, Math.floor(overlayCanvas.width / 150));
    ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 頂点にポインターを描画
    points.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, ctx.lineWidth * 1.5, 0, 2 * Math.PI);
        ctx.fillStyle = '#f87171';
        ctx.fill();
    });
}

async function scanCanvas(imgUrl) {
    clearOverlay();

    // 1. ネイティブ BarcodeDetector API
    if ('BarcodeDetector' in window) {
        try {
            const detector = new BarcodeDetector({
                formats: ['ean_13', 'ean_8', 'code_128', 'qr_code']
            });
            const barcodes = await detector.detect(canvas);
            if (barcodes.length > 0) {
                const b = barcodes[0];
                if (b.cornerPoints) drawBoundingBox(b.cornerPoints);
                handleSuccess(b.rawValue, b.format || "Barcode");
                return;
            }
        } catch (e) {}
    }

    // // 2. jsQR (QRコード)
    // const ctx = canvas.getContext('2d');
    // const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // const qrCode = jsQR(imageData.data, imageData.width, imageData.height);
    // if (qrCode && qrCode.data) {
    //     const loc = qrCode.location;
    //     drawBoundingBox([loc.topLeftCorner, loc.topRightCorner, loc.bottomRightCorner, loc.bottomLeftCorner]);
    //     handleSuccess(qrCode.data, "QR Code");
    //     return;
    // }

    // 3. ZXing (JAN / 各種バーコード)
    // try {
    //     const result = await zxingReader.decodeFromImageUrl(imgUrl);
    //     if (result) {
    //         const pts = result.getResultPoints();
    //         if (pts && pts.length >= 2) {
    //             const boxPoints = pts.map(p => ({ x: p.getX(), y: p.getY() }));
    //             drawBoundingBox(boxPoints);
    //         }
    //         handleSuccess(result.getText(), result.getBarcodeFormat() || "Barcode");
    //         return;
    //     }
    // } catch (e) {}
    try {
    const result = zxingReader.decodeFromCanvas(canvas);
    if (result) {
        handleSuccess(result.getText(), result.getBarcodeFormat());
        return;
    }
} catch (e) {
    // 検出失敗時はエラーが出るためキャッチする
}

    showToast("コードが読み取れませんでした");
}

function showToast(msg) {
    toastMsg.textContent = msg;
    toast.classList.remove('translate-y-16', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
    setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-16', 'opacity-0');
    }, 2000);
}

function playBeep() {
    if (!isSoundEnabled) return;
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1900, ctx.currentTime);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
    } catch (e) {}
}

function handleSuccess(text, format) {
    playBeep();

    resultText.textContent = text;
    resultText.classList.remove('text-slate-500', 'italic');
    resultText.classList.add('text-slate-100', 'font-mono', 'text-sm', 'font-semibold');

    scanFormat.textContent = format;
    scanFormat.classList.remove('hidden');
    resultActions.classList.remove('hidden');

    searchGoogleBtn.href = `https://www.google.com/search?q=${encodeURIComponent(text)}`;

    addToHistory(text, format);
    showToast("スキャン成功！");
}

function addToHistory(text, format) {
    const timeStr = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    scanHistory.unshift({ text, format, time: timeStr });
    if (scanHistory.length > 20) scanHistory.pop();
    renderHistory();
}

function renderHistory() {
    if (scanHistory.length === 0) {
        emptyHistory.classList.remove('hidden');
        historyList.innerHTML = '';
        historyList.appendChild(emptyHistory);
        return;
    }

    emptyHistory.classList.add('hidden');
    historyList.innerHTML = '';

    scanHistory.forEach(item => {
        const row = document.createElement('div');
        row.className = "bg-slate-900/90 border border-slate-700/60 rounded-lg px-2.5 py-1.5 flex items-center justify-between text-xs";

        row.innerHTML = `
            <div class="flex items-center space-x-2 truncate pr-2">
                <span class="text-[9px] font-mono bg-slate-800 text-indigo-300 px-1.5 py-0.5 rounded border border-slate-700 shrink-0">
                    ${item.format}
                </span>
                <span class="font-mono text-slate-200 truncate">${escapeHtml(item.text)}</span>
            </div>
            <div class="flex items-center space-x-1.5 shrink-0">
                <span class="text-[9px] text-slate-500">${item.time}</span>
                <button onclick="copyToClipboard('${escapeHtml(item.text)}')" class="text-slate-400 hover:text-indigo-400 p-1">
                    <i data-lucide="copy" class="w-3 h-3"></i>
                </button>
            </div>
        `;
        historyList.appendChild(row);
    });

    lucide.createIcons();
}

function escapeHtml(str) {
    return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => showToast('クリップボードにコピーしました'));
}

copyBtn.addEventListener('click', () => {
    const text = resultText.textContent;
    if (text && !resultText.classList.contains('italic')) {
        copyToClipboard(text);
    }
});

clearHistoryBtn.addEventListener('click', () => {
    scanHistory = [];
    renderHistory();
    showToast('履歴を消去しました');
});

soundToggleBtn.addEventListener('click', () => {
    isSoundEnabled = !isSoundEnabled;
    soundIcon.className = isSoundEnabled ? "w-3.5 h-3.5 text-emerald-400" : "w-3.5 h-3.5 text-slate-500";
    soundLabel.textContent = isSoundEnabled ? "音: ON" : "音: OFF";
});
