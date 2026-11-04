let isSoundEnabled = true;
let scanHistory = [];
let liveControls = null;
let isLiveScanning = false;

const scanHints = new Map();
scanHints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
    ZXing.BarcodeFormat.EAN_13,
    ZXing.BarcodeFormat.EAN_8,
    ZXing.BarcodeFormat.UPC_A,
    ZXing.BarcodeFormat.UPC_E,
    ZXing.BarcodeFormat.CODE_128,
    ZXing.BarcodeFormat.QR_CODE
]);
scanHints.set(ZXing.DecodeHintType.TRY_HARDER, true);
const zxingReader = new ZXing.BrowserMultiFormatReader(scanHints);

// DOM参照
const cameraInput = document.getElementById('cameraInput');
const imagePreview = document.getElementById('imagePreview');
const videoPreview = document.getElementById('videoPreview');
const overlayCanvas = document.getElementById('overlayCanvas');
const placeholderView = document.getElementById('placeholderView');
const canvas = document.getElementById('captureCanvas');
const captureBtn = document.getElementById('captureBtn');
const captureBtnText = document.getElementById('captureBtnText');
const photoBtn = document.getElementById('photoBtn');
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

// スマートフォンの背面カメラでリアルタイムスキャン
captureBtn.addEventListener('click', () => {
    if (isLiveScanning) {
        stopLiveScanner();
        return;
    }
    startLiveScanner();
});

photoBtn.addEventListener('click', () => {
    cameraInput.click();
});

async function startLiveScanner() {
    if (!navigator.mediaDevices?.getUserMedia) {
        showToast('ライブカメラにはHTTPS接続が必要です。写真撮影をお使いください');
        return;
    }

    isLiveScanning = true;
    placeholderView.classList.add('hidden');
    imagePreview.classList.add('hidden');
    videoPreview.classList.remove('hidden');
    overlayCanvas.classList.add('hidden');
    captureBtnText.textContent = 'スキャン中（タップで停止）';

    try {
        liveControls = await zxingReader.decodeFromConstraints(
            {
                audio: false,
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            },
            videoPreview,
            (result, error, controls) => {
                if (result && isLiveScanning) {
                    stopLiveScanner(controls);
                    handleSuccess(result.getText(), result.getBarcodeFormat());
                }
                // 読み取り中の NotFoundException は通常の状態なので無視する
            }
        );
    } catch (error) {
        stopLiveScanner();
        showToast('カメラを起動できません。下の写真撮影をお試しください');
    }
}

function stopLiveScanner(controls = liveControls) {
    isLiveScanning = false;
    try {
        controls?.stop();
    } catch (error) {}
    liveControls = null;
    videoPreview.pause();
    videoPreview.srcObject = null;
    videoPreview.classList.add('hidden');
    captureBtnText.textContent = 'カメラを起動してJANコードをスキャン';
    if (imagePreview.classList.contains('hidden')) {
        placeholderView.classList.remove('hidden');
    }
}

// 写真が撮影・選択された時の処理
cameraInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    stopLiveScanner();

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
        await scanCanvas(img);
        URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
    cameraInput.value = '';
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

function displayFormat(format) {
    const name = String(format || 'Barcode').toLowerCase();
    if (name.includes('ean_13') || format === ZXing.BarcodeFormat.EAN_13) return 'JAN / EAN-13';
    if (name.includes('ean_8') || format === ZXing.BarcodeFormat.EAN_8) return 'JAN / EAN-8';
    return String(format || 'Barcode');
}

async function scanCanvas(sourceImage) {
    clearOverlay();

    // 対応ブラウザーではネイティブAPIを先に試す
    if ('BarcodeDetector' in window) {
        try {
            const requestedFormats = ['ean_13', 'ean_8', 'code_128', 'qr_code'];
            const supportedFormats = await BarcodeDetector.getSupportedFormats();
            const formats = requestedFormats.filter(format => supportedFormats.includes(format));
            if (formats.length) {
                const detector = new BarcodeDetector({ formats });
                const barcodes = await detector.detect(canvas);
                if (barcodes.length > 0) {
                    const barcode = barcodes[0];
                    if (barcode.cornerPoints) drawBoundingBox(barcode.cornerPoints);
                    handleSuccess(barcode.rawValue, displayFormat(barcode.format));
                    return;
                }
            }
        } catch (error) {}
    }

    try {
        const result = await zxingReader.decodeFromImageElement(sourceImage);
        handleSuccess(result.getText(), displayFormat(result.getBarcodeFormat()));
        return;
    } catch (error) {
        // 元画像で失敗した場合は、コントラストを上げた画像でもう一度試す
    }

    try {
        const scale = Math.min(1, 2200 / canvas.width);
        const enhancedCanvas = document.createElement('canvas');
        enhancedCanvas.width = Math.max(1, Math.round(canvas.width * scale));
        enhancedCanvas.height = Math.max(1, Math.round(canvas.height * scale));
        const enhancedContext = enhancedCanvas.getContext('2d', { willReadFrequently: true });
        enhancedContext.drawImage(canvas, 0, 0, enhancedCanvas.width, enhancedCanvas.height);

        const imageData = enhancedContext.getImageData(0, 0, enhancedCanvas.width, enhancedCanvas.height);
        const pixels = imageData.data;
        for (let i = 0; i < pixels.length; i += 4) {
            const gray = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
            const contrast = Math.max(0, Math.min(255, (gray - 128) * 1.6 + 128));
            pixels[i] = contrast;
            pixels[i + 1] = contrast;
            pixels[i + 2] = contrast;
        }
        enhancedContext.putImageData(imageData, 0, 0);

        const enhancedImage = new Image();
        enhancedImage.src = enhancedCanvas.toDataURL('image/png');
        await enhancedImage.decode();
        const result = await zxingReader.decodeFromImageElement(enhancedImage);
        handleSuccess(result.getText(), displayFormat(result.getBarcodeFormat()));
        return;
    } catch (error) {}

    showToast('コードが読み取れませんでした。JANコード全体にピントを合わせてください');
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



// // 補助関数　コントラスト強調スキャン
// async function scanWithContrastEnhancement(targetCanvas, reader) {
//     const ctx = targetCanvas.getContext('2d');
//     const width = targetCanvas.width;
//     const height = targetCanvas.height;
    
//     const imgData = ctx.getImageData(0, 0, width, height);
//     const data = imgData.data;
    
//     // コントラストの強さ（反射が強い場合は 1.6 〜 2.0 程度に調整）
//     const contrast = 1.8; 
//     const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

//     for (let i = 0; i < data.length; i += 4) {
//         const r = data[i];
//         const g = data[i+1];
//         const b = data[i+2];
        
//         // グレースケール化
//         const gray = 0.299 * r + 0.587 * g + 0.114 * b;

//         // コントラスト適用
//         let val = factor * (gray - 128) + 128;
//         val = Math.min(255, Math.max(0, val));

//         data[i] = val;
//         data[i+1] = val;
//         data[i+2] = val;
//     }

//     // 処理後のモノクロ・高コントラスト画像をキャンバスに戻す
//     ctx.putImageData(imgData, 0, 0);

//     // Canvasから直接ZXingでデコードを試みる
//     const result = reader.decodeFromCanvas(targetCanvas);
//     if (result) {
//         return {
//             text: result.getText(),
//             format: result.getBarcodeFormat()
//         };
//     }
//     return null;
// }
