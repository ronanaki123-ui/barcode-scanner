// バーコードスキャナー

// グローバル変数
let testMode = true;
let isSoundEnabled = true;
let lastSuccessfulImageSrc = null; //成功した画像

const productCatalogPromise = fetch('./products.json')
    .then(response => {
        if (!response.ok) throw new Error(`products.json request failed: ${response.status}`);
        return response.json();
    })
    .catch(error => {
        console.error('商品カタログを読み込めませんでした:', error);
        return {};
    });

const scanHints = new Map();
scanHints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
    ZXing.BarcodeFormat.EAN_13,        //日本規格13桁
    // ZXing.BarcodeFormat.EAN_8,      //日本規格8桁
    ZXing.BarcodeFormat.UPC_A,         //米国規格12桁
    // ZXing.BarcodeFormat.UPC_E,      //米国規格8桁
    // ZXing.BarcodeFormat.CODE_128,   //CODE128
    // ZXing.BarcodeFormat.QR_CODE     //QRコード
]);
scanHints.set(ZXing.DecodeHintType.TRY_HARDER, true);
const zxingReader = new ZXing.BrowserMultiFormatReader(scanHints);

//DOM取得
const cameraInput = document.getElementById('cameraInput');
const photoInput = document.getElementById('photoInput');
const imagePreview = document.getElementById('imagePreview');
const videoPreview = document.getElementById('videoPreview');
const scannerGuide = document.getElementById('scannerGuide');
const overlayCanvas = document.getElementById('overlayCanvas');
const placeholderView = document.getElementById('placeholderView');
const canvas = document.getElementById('captureCanvas');
const captureBtn = document.getElementById('captureBtn');
const captureBtnText = document.getElementById('captureBtnText');
const selectPhotoBtn = document.getElementById('selectPhotoBtn');
const shootPhotoBtn = document.getElementById('shootPhotoBtn');
const resultText = document.getElementById('resultText');
const scanFormat = document.getElementById('scanFormat');
const resultActions = document.getElementById('resultActions');
const copyBtn = document.getElementById('copyBtn');
const searchGoogleBtn = document.getElementById('searchGoogleBtn');
const productName = document.getElementById('productName');
const productDescription = document.getElementById('productDescription');
const soundToggleBtn = document.getElementById('soundToggleBtn');
const soundIcon = document.getElementById('soundIcon');
const soundLabel = document.getElementById('soundLabel');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toastMsg');
const testContaner = document.getElementById('testContainer');

lucide.createIcons();

//テストモード
if (!testMode) {
    testContaner.classList.add('hidden');

}

//起動時にPC環境かどうかを判定して写真撮影ボタンを無効化する
window.addEventListener('DOMContentLoaded', () => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    if (!isMobile) {
        const shootPhotoBtn = document.getElementById('shootPhotoBtn');
        if (shootPhotoBtn) {
            shootPhotoBtn.disabled = true; // ボタンを無効化
            shootPhotoBtn.title = "PCからはカメラ撮影をご利用いただけません"; // ホバー時の案内
        }
    }
});

//ライブビュー
captureBtn.addEventListener('click', () => {
    cameraInput.click();
});

//カメラ撮影ボタン
shootPhotoBtn.addEventListener('click', () => {
    cameraInput.click();
});

//画像選択ボタン
selectPhotoBtn.addEventListener('click', () => {
    photoInput.click();
});

//クリップボードにコピーボタン
copyBtn.addEventListener('click', () => {
    const text = resultText.textContent;
    if (text && !resultText.classList.contains('italic')) {
        copyToClipboard(text);
    }
});

//サウンド切り替えボタン
soundToggleBtn.addEventListener('click', () => {
    isSoundEnabled = !isSoundEnabled;
    soundIcon.className = isSoundEnabled ? "w-3.5 h-3.5 text-red-400" : "w-3.5 h-3.5 text-slate-500";
    soundLabel.textContent = isSoundEnabled ? "音: ON" : "音: OFF";
});

// 写真が撮影・選択された時の処理-----------------------------------------------------------
cameraInput.addEventListener('change', (e) => handleImageSelected(e));
photoInput.addEventListener('change', (e) => handleImageSelected(e));

async function handleImageSelected(e) {
    const file = e.target.files[0];
    if (!file) return;

    const img = new Image();
    img.onload = async () => {
        //プレビュー表示
        imagePreview.src = img.src;
        imagePreview.classList.remove('hidden');
        placeholderView.classList.add('hidden');
        if (typeof scannerGuide !== 'undefined' && scannerGuide) {
            scannerGuide.classList.add('hidden');
        }

        //オーバーレイ用キャンバス初期化
        overlayCanvas.width = img.width;
        overlayCanvas.height = img.height;
        overlayCanvas.classList.remove('hidden');
        if (typeof clearOverlay === 'function') {
            clearOverlay();
        }

        //解析キャンバスに描画
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false; //アンチエイリアスを無効化
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        //軽くコントラストを上げる
        const baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const basePixels = baseImageData.data;
        const initialContrast = 1.25; // 1.25倍

        for (let i = 0; i < basePixels.length; i += 4) {
            // グレースケール化を挟みつつ、軽くコントラストを上げる
            const gray = 0.299 * basePixels[i] + 0.587 * basePixels[i + 1] + 0.114 * basePixels[i + 2];
            const contrast = Math.max(0, Math.min(255, (gray - 128) * initialContrast + 128));
            basePixels[i] = contrast;
            basePixels[i + 1] = contrast;
            basePixels[i + 2] = contrast;
        }
        ctx.putImageData(baseImageData, 0, 0);

        //解析開始
        await scanCanvas(img);
        
        URL.revokeObjectURL(img.src);
    };

    img.src = URL.createObjectURL(file);
    e.target.value = '';
};

// キャンバスをスキャン----------------------------------------------------------------
async function scanCanvas(sourceImage) {
    clearOverlay();

    //1.ネイティブAPI(BarcodeDetector)を試す
    if ('BarcodeDetector' in window) {
        try {
            const requestedFormats = ['ean_13','upc_a',];  //'ean_8', 'upc_e'
            const supportedFormats = await BarcodeDetector.getSupportedFormats();
            const formats = requestedFormats.filter(format => supportedFormats.includes(format));
            if (formats.length) {
                const detector = new BarcodeDetector({ formats });
                const barcodes = await detector.detect(canvas);
                if (barcodes.length > 0) {
                    const barcode = barcodes[0];
                    if (barcode.cornerPoints) drawBoundingBox(barcode.cornerPoints);
                    handleSuccess(barcode.rawValue, displayFormat(barcode.format),sourceImage);
                    return;
                }
            }
        } catch (error) {
            console.log('BarcodeDetector読み取り失敗:', error);
        }
    }

    //2.ZXingの通常読み取りを試す
    try {
        const result = await zxingReader.decodeFromImageElement(sourceImage);
        handleSuccess(result.getText(), displayFormat(result.getBarcodeFormat()),sourceImage);
        return;
    } catch (error) {
        console.log('ZXing読み取り失敗:', error);
    }


 // 3.二値化のしきい値を段階的に変えながら試す
const thresholds = []; // しきい値
    for (let t = 60; t <= 120; t += 10) { //60~120まで10刻み
        thresholds.push(t);
    }
    let lastEnhancedImage = null;
    
    const scale = Math.min(1, 2200 / canvas.width);
    const enhancedCanvas = document.createElement('canvas');
    enhancedCanvas.width = Math.max(1, Math.round(canvas.width * scale));
    enhancedCanvas.height = Math.max(1, Math.round(canvas.height * scale));
    const enhancedContext = enhancedCanvas.getContext('2d', { willReadFrequently: true });
    enhancedContext.imageSmoothingEnabled = false;

    const baseCanvas = document.createElement('canvas');
    baseCanvas.width = enhancedCanvas.width;
    baseCanvas.height = enhancedCanvas.height;
    const baseCtx = baseCanvas.getContext('2d', { willReadFrequently: true });
    baseCtx.drawImage(canvas, 0, 0, enhancedCanvas.width, enhancedCanvas.height);
    const originalImageData = baseCtx.getImageData(0, 0, baseCanvas.width, baseCanvas.height);

    for (const threshold of thresholds) {
        try {
            const imageData = new ImageData(
                new Uint8ClampedArray(originalImageData.data),
                originalImageData.width,
                originalImageData.height
            );
            const pixels = imageData.data;

            for (let i = 0; i < pixels.length; i += 4) {
                // グレースケール化
                const gray = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
                
                //二値化処理
                const binary = gray < threshold ? 0 : 255;
                
                pixels[i] = binary;
                pixels[i + 1] = binary;
                pixels[i + 2] = binary;
            }
            
            enhancedContext.putImageData(imageData, 0, 0);

            const enhancedImage = new Image();
            enhancedImage.src = enhancedCanvas.toDataURL('image/png');
            await enhancedImage.decode();
            
            lastEnhancedImage = enhancedImage;
            
            const result = await zxingReader.decodeFromImageElement(enhancedImage);
            handleSuccess(result.getText(), displayFormat(result.getBarcodeFormat()), enhancedImage);
            return;
        } catch (error) {
            console.log(`しきい値 (${threshold}) での読み取り失敗`);
        }
        if (lastEnhancedImage) {
        const testImagePreview = document.getElementById('testImagePreview');
        const testImagePlaceholder = document.getElementById('testImagePlaceholder');
        if (testImagePreview && testImagePlaceholder) {
            testImagePreview.src = lastEnhancedImage.src;
            testImagePreview.classList.remove('hidden');
            testImagePlaceholder.classList.add('hidden');
        }
    }
    }

    showToast('コードが読み取れませんでした。ピントを合わせて再度撮影してください');
}

//トーストメッセージの表示----------------------------------------------------------------
function showToast(msg) {
    toastMsg.textContent = msg;
    toast.classList.add('show'); // 表示状態にするクラスを追加
    
    setTimeout(() => {
        toast.classList.remove('show'); // 2秒後にクラスを外して隠す
    }, 2000);
}

//オーバーレイをリセット------------------------------------------------------------------
function clearOverlay() {
    const ctx = overlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
}

// 検出領域オーバーレイの描画---------------------------------------------------------------
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

    points.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, ctx.lineWidth * 1.5, 0, 2 * Math.PI);
        ctx.fillStyle = '#f87171';
        ctx.fill();
    });
}

//効果音----------------------------------------------------------------
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

// スキャン成功時の処理---------------------------------------------------------------
async function handleSuccess(text, format, successImage) {
    playBeep();

    const testImagePreview = document.getElementById('testImagePreview');
    const testImagePlaceholder = document.getElementById('testImagePlaceholder');

if (successImage && successImage.src && testMode) {
        testImagePreview.src = successImage.src;
        testImagePreview.classList.remove('hidden');
        testImagePlaceholder.classList.add('hidden');
    }

    resultText.textContent = text;
    resultText.classList.remove('text-slate-500', 'italic');
    resultText.classList.add('text-slate-100', 'font-mono', 'text-sm', 'font-semibold');

    scanFormat.textContent = format;
    scanFormat.classList.add('inline-block');
    resultActions.classList.remove('hidden');

    searchGoogleBtn.href = `https://www.google.com/search?q=${encodeURIComponent(text)}`;//あとで別サイト参照に変える

    const catalog = await productCatalogPromise;
    const product = findProduct(catalog, text);
    productName.textContent = product?.name || '当店では取り扱いのない商品です。';
    productDescription.textContent = product?.description || '-';

    showToast("スキャン成功！");
    
}

// バーコード形式の表示名を整形-----------------------------------------------------------
function displayFormat(format) {
    const name = String(format || 'Barcode').toLowerCase();
    if (name.includes('ean_13') || format === ZXing.BarcodeFormat.EAN_13) return 'JAN / EAN-13';
    if (name.includes('ean_8') || format === ZXing.BarcodeFormat.EAN_8) return 'JAN / EAN-8';
    return String(format || 'Barcode');
}

//商品カタログからバーコードに対応する商品情報を検索---------------------------------------------------------------
function findProduct(catalog, barcode) {
    const code = String(barcode).trim();
    const candidates = [code];

    // products.json may store the 12-digit JAN payload without its EAN-13 check digit.
    if (/^\d{13}$/.test(code)) candidates.push(code.slice(0, 12));

    for (const candidate of candidates) {
        if (catalog[candidate]) return catalog[candidate];
    }
    return null;
}

//HTMLエスケープ----------------------------------------------------------------
function escapeHtml(str) {
    return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

//クリップボードにコピー--------------------------------------------------------------
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => showToast('クリップボードにコピーしました'));
}

//    9 _____ 9
//   /         \
//  | |_______| |
//  C | 0 . 0 | D
//  | (   ^   ) |
//  ^^^^^| |^^^^^
//     </ = \>
//    6/     \o
//    /_______\
//       L L