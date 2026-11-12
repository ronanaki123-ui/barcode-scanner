

//メインファイル

// グローバル変数
let testMode = true;  //テストモードON/OFF
let isSoundEnabled = true; //音声ON/OFF
let lastSuccessfulImageSrc = null; //成功した画像

//DOM取得
const cameraInput = document.getElementById('cameraInput');
const photoInput = document.getElementById('photoInput');
const imagePreview = document.getElementById('imagePreview');
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
const productPrice = document.getElementById('productPrice');
const productContent = document.getElementById('productContent');
const productStock = document.getElementById('productStock');
const productDescription = document.getElementById('productDescription');

const soundToggleBtn = document.getElementById('soundToggleBtn');
const soundIcon = document.getElementById('soundIcon');
const soundLabel = document.getElementById('soundLabel');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toastMsg');

const mainImagePreview = document.getElementById('mainImagePreview');
const mainImagePlaceholder = document.getElementById('mainImagePlaceholder');

const testContaner = document.getElementById('testContainer');

const statsContent = document.getElementById('statsContent');

const videoPreview = document.getElementById('videoPreview');
const captureCanvas = document.getElementById('captureCanvas');


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

//ライブビューボタン
let cameraStream = null;
let isButtonLocked = false;

captureBtn.addEventListener('click', async () => {
    if (isButtonLocked) return;
    isButtonLocked = true; //ロックをかける


    const videoPreview = document.getElementById('videoPreview');
    const imagePreview = document.getElementById('imagePreview');
    const placeholderView = document.getElementById('placeholderView');

    if (!isLiveScanning) {
        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: 'environment' ,
                    width: { ideal: 1920 },  // 横幅の理想値
                    height: { ideal: 1080 }  // 縦幅の理想値
                }
            });

            videoPreview.srcObject = cameraStream;
            videoPreview.play();

            videoPreview.classList.remove('hidden');
            imagePreview.classList.add('hidden');
            placeholderView.classList.add('hidden');

            if (scannerGuide) {
                scannerGuide.classList.remove('hidden');
            }

            isLiveScanning = true;
            startLiveScanLoop();

            captureBtnText.textContent = "ライブスキャンを停止";
            captureBtn.classList.add('bg-red-600', 'hover:bg-red-700');

        } catch (err) {
            console.error('カメラ起動失敗:', err);
            showToast('カメラの起動に失敗しました。ブラウザの権限を確認してください。');
        }finally {
            //少しバッファを置いてからロックを解除
            setTimeout(() => {
                isButtonLocked = false;
            }, 500);
        }
    } else {
        stopLiveScan();
        //少しバッファを置いてからロック解除
        setTimeout(() => {
            isButtonLocked = false;
        }, 500);
    }
});

function stopLiveScan() {
    isLiveScanning = false;

    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }

    const videoPreview = document.getElementById('videoPreview');
    const placeholderView = document.getElementById('placeholderView');

    videoPreview.pause();
    videoPreview.srcObject = null;
    videoPreview.classList.add('hidden');
    placeholderView.classList.remove('hidden');
    if (scannerGuide) {
        scannerGuide.classList.add('hidden');
    }

    captureBtnText.textContent = "ライブビューでバーコードをスキャン";
    captureBtn.classList.remove('bg-red-600', 'hover:bg-red-700');
}

//カメラ撮影ボタン
shootPhotoBtn.addEventListener('click', () => {
    cameraInput.click();
});

//画像選択ボタン
selectPhotoBtn.addEventListener('click', () => {
    photoInput.click();
});

//クリップボードにコピーボタン
// copyBtn.addEventListener('click', () => {
//     const text = resultText.textContent;
//     if (text && !resultText.classList.contains('italic')) {
//         copyToClipboard(text);
//     }
// });

//サウンド切り替えボタン
soundToggleBtn.addEventListener('click', () => {
    isSoundEnabled = !isSoundEnabled;

    soundToggleBtn.setAttribute('data-enabled', isSoundEnabled);
    soundLabel.textContent = isSoundEnabled ? "音: ON" : "音: OFF";
});


/*---------------------------------------------------------------------------------
物理バーコードスキャナーのサポート
---------------------------------------------------------------------------------*/
let barcodeBuffer = '';
let lastKeyTime = Date.now();

function toHalfWidth(str) {
    return str.replace(/[A - Z a - z 0 - 9]/g,(s) => {
        return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
    });
}

document.addEventListener('keydown', (e) => {
    // ※もし将来的にテキスト入力欄などを置いた場合、そこでのタイピング誤爆を防ぎたい場合は
    //   if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    //   を入れても良いですが、現在のアプリには入力欄がないためそのままでOKです。

    const currentTime = Date.now();
    
    // 前回のキー入力から100ミリ秒以上空いた場合、バッファをリセット
    if (currentTime - lastKeyTime > 100) {
        barcodeBuffer = '';
    }
    lastKeyTime = currentTime;

    if (e.key === 'Enter') {
        // Enterキーが検知された場合
        if (barcodeBuffer.length > 0) {
            let scannedCode = barcodeBuffer.trim();
            scannedCode = toHalfWidth(scannedCode);
            console.log('物理スキャナーからコードを受信:', scannedCode);
            handleSuccess(scannedCode, 'Physical Scanner', null);
        }
        barcodeBuffer = '';
        e.preventDefault(); // ページの意図しない挙動を防止
    } else if (e.key.length === 1) {
        // 通常の文字キーであれば、バーコードの文字列としてバッファに溜める
        barcodeBuffer += e.key;
    }
});


//トーストメッセージの表示----------------------------------------------------------------
function showToast(msg) {
    toastMsg.textContent = msg;
    toast.classList.add('show'); // 表示状態にするクラスを追加
    
    setTimeout(() => {
        toast.classList.remove('show'); // 2秒後にクラスを外して隠す
    }, 2000);
}


//効果音----------------------------------------------------------------
function playBeep() {
    if (!isSoundEnabled) return;
    try {
        const ctx = new (window.AudioContext || window.AudioContext)();
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

/*---------------------------------------------------------------------------------
スキャン成功時の処理
---------------------------------------------------------------------------------*/
async function handleSuccess(scannedCode, format, successImage) {
    fetchAndRenderStats();
    playBeep();

    if (typeof isLiveScanning !== 'undefined' && isLiveScanning) {
        stopLiveScan(); //ライブスキャンの場合カメラを停止してvideoを隠す
    }

    const testImagePreview = document.getElementById('testImagePreview');
    const testImagePlaceholder = document.getElementById('testImagePlaceholder');

    let imageSrc = '';
    //Canvas要素の場合はDataURLに変換する
    if (successImage instanceof HTMLCanvasElement) {
        imageSrc = successImage.toDataURL('image/png');
    } 
    //通常のImage要素の場合
    else if (successImage && successImage.src) {
        imageSrc = successImage.src;
    }
    if(imageSrc) {
        //メインのプレビューに表示
        imagePreview.src = imageSrc;
        imagePreview.classList.remove('hidden');
        placeholderView.classList.add('hidden');
        if ((testMode && testImagePreview && testImagePlaceholder)) {
            testImagePreview.src = imageSrc;
            testImagePreview.classList.remove('hidden');
            testImagePlaceholder.classList.add('hidden');
        }
    }
        //スキャン結果コード表示
        // resultText.textContent = scannedCode;
        // resultText.classList.remove('text-slate-500', 'italic');
        // resultText.classList.add('text-slate-100', 'font-mono', 'text-sm', 'font-semibold');

        // scanFormat.textContent = format;
        // scanFormat.classList.add('inline-block');
        // resultActions.classList.remove('hidden');

        // searchGoogleBtn.href = `https://www.google.com/search?q=${encodeURIComponent(scannedCode)}`;//あとで別サイト参照に変える

        const product = findProduct(PRODUCTS_CATALOG, scannedCode);

if (!product) {
        productName.textContent = '当店では取り扱いのない商品です。';
        productDescription.textContent = '---';
        productPrice.textContent = '-';
        productContent.textContent = '-';    
        productStock.textContent = '-';

        mainImagePreview.src = "";
        mainImagePreview.classList.add('hidden');
        mainImagePlaceholder.classList.remove('hidden');
        mainImagePlaceholder.textContent = "該当する商品の画像が見つかりません";

        showToast("取り扱いのない商品です");
        return; //DBに保存せず終了
    }
    productName.textContent = product.name;
    productDescription.textContent = product.description || '---';
    productPrice.textContent = product.price || '-';
    productContent.textContent = product.content || '-';    
    productStock.textContent = product.stock || '-';

    await saveScanData(scannedCode, productName.textContent);

    if (product && product.image) {
        mainImagePreview.src = product.image;
        mainImagePreview.classList.remove('hidden');
        mainImagePlaceholder.classList.add('hidden');
        } else {
        // 商品が見つからない、または画像がないとき
        mainImagePreview.src = "";
        mainImagePreview.classList.add('hidden');
        mainImagePlaceholder.classList.remove('hidden');
        mainImagePlaceholder.textContent = "該当する商品の画像が見つかりません";
    }
    showToast("スキャン成功！");
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

/*---------------------------------------------------------------------------------
統計データの取得
---------------------------------------------------------------------------------*/
// 統計データを取得して画面に反映
async function fetchAndRenderStats() {
    if (!statsContent) return;

    //scans テーブルからすべてのデータを取得
    const { data: scans, error } = await supabaseClient
        .from('scans')
        .select('*');

    if (error) {
        console.error('統計データの取得エラー:', error);
        statsContent.innerHTML = '<p class="text-red-400">統計データの読み込みに失敗しました</p>';
        return;
    }

    if (!scans || scans.length === 0) {
        statsContent.innerHTML = '<p class="italic text-slate-400">まだスキャン履歴がありません</p>';
        return;
    }

    //商品コードごとにスキャン回数を集計する
    const statsMap = {};
    scans.forEach(scan => {
        const code = scan.product_code;
        const name = scan.product_name || '不明な商品';
        
        if (!statsMap[code]) {
            statsMap[code] = { name: name, count: 0 };
        }
        statsMap[code].count += 1;
    });

    //集計結果を回数が多い順にソート
    const sortedStats = Object.entries(statsMap).sort((a, b) => b[1].count - a[1].count);

    //HTMLに反映して描画
    let html = '<ul class="divide-y divide-slate-700">';
    for (const [code, info] of sortedStats) {
        html += `
            <li class="py-1.5 flex justify-between items-center">
                <span class="font-medium text-slate-200 truncate max-w-[70%]">${escapeHtml(info.name)} <span class="text-[10px] text-slate-400 font-mono">(${code})</span></span>
                <span class="bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded font-bold text-xs">${info.count} 回</span>
            </li>
        `;
    }
    html += '</ul>';
    statsContent.innerHTML = html;
}

// ページ読み込み時に一度統計を取得・表示する
document.addEventListener('DOMContentLoaded', () => {
    fetchAndRenderStats();
});

// //Supabase Realtime を使って、データが追加時に再集計・更新
// supabaseClient
//     .channel('realtime-scans-stats')
//     .on(
//     'postgres_changes',
//     { event: 'INSERT', schema: 'public', table: 'scans' },
//     (payload) => {
//         console.log('新しいスキャンを検知しました！統計を更新します:', payload.new);
//       fetchAndRenderStats(); //自動で再集計
//     }
//     )
//     .subscribe();
