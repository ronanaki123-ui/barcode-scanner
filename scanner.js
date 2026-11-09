

//スキャナー

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

/*---------------------------------------------------------------------------------
ライブスキャン起動時の処理
---------------------------------------------------------------------------------*/
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {  
                facingMode: 'environment',
                width: { ideal: 1920 },  //横幅の理想値
                height: { ideal: 1080 } // 縦幅の理想値
            } // 外カメラを優先
        });
        videoElement.srcObject = stream;
        videoElement.play();
        requestAnimationFrame(scanLoop); // スキャンループを開始
    } catch (err) {
        console.error('カメラ起動失敗:', err);
    }
}
/*---------------------------------------------------------------------------------
写真が撮影・選択された時の処理
---------------------------------------------------------------------------------*/
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
            // グレースケール化を挟み、軽くコントラストを上げる
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


/*---------------------------------------------------------------------------------
キャンバスをスキャン
---------------------------------------------------------------------------------*/
let isLiveScanning = false;  //ライブスキャン中かどうかのフラグ
let isCoolingDown = false;     //連続読み取り防止のクールダウン中か
let failCount = 0;           //ライブビューでの連続失敗カウンター

//軽いスキャン
async function tryLightScan(sourceElement) {

    if ('BarcodeDetector' in window) {
        try {
            const requestedFormats = ['ean_13', 'upc_a'];
            const supportedFormats = await BarcodeDetector.getSupportedFormats();
            const formats = requestedFormats.filter(f => supportedFormats.includes(f));
            if (formats.length) {
                const detector = new BarcodeDetector({ formats });
                const barcodes = await detector.detect(sourceElement);
                if (barcodes.length > 0) {
                    const barcode = barcodes[0];
                    if (barcode.cornerPoints) drawBoundingBox(barcode.cornerPoints);
                    return { text: barcode.rawValue, format: displayFormat(barcode.format) };
                }
            }
        } catch (error) {
            console.log('BarcodeDetector読み取り失敗:', error);
        }
    }
    try {
        const result = await zxingReader.decodeFromImageElement(sourceElement);
        if (result) {
            return { text: result.getText(), format: displayFormat(result.getBarcodeFormat()) };
        }
    } catch (error) {}

    return null; //見つからなかった
}

//重いスキャン
async function tryHeavyScan(canvasElement) {
    const thresholds = [];
    for (let t = 60; t <= 120; t += 10) { //60〜120まで10刻み
        thresholds.push(t);
    }
    
    const scale = Math.min(1, 2200 / canvasElement.width);
    const enhancedCanvas = document.createElement('canvas');
    enhancedCanvas.width = Math.max(1, Math.round(canvasElement.width * scale));
    enhancedCanvas.height = Math.max(1, Math.round(canvasElement.height * scale));
    const enhancedContext = enhancedCanvas.getContext('2d', { willReadFrequently: true });
    enhancedContext.imageSmoothingEnabled = false;

    const baseCanvas = document.createElement('canvas');
    baseCanvas.width = enhancedCanvas.width;
    baseCanvas.height = enhancedCanvas.height;
    const baseCtx = baseCanvas.getContext('2d', { willReadFrequently: true });
    baseCtx.drawImage(canvasElement, 0, 0, enhancedCanvas.width, enhancedCanvas.height);
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
                const gray = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
                const binary = gray < threshold ? 0 : 255;
                pixels[i] = binary;
                pixels[i + 1] = binary;
                pixels[i + 2] = binary;
            }
            enhancedContext.putImageData(imageData, 0, 0);

            const enhancedImage = new Image();
            enhancedImage.src = enhancedCanvas.toDataURL('image/png');
            await enhancedImage.decode();
            
            // テスト用画像のプレビュー更新
            const testImagePreview = document.getElementById('testImagePreview');
            const testImagePlaceholder = document.getElementById('testImagePlaceholder');
            if (testImagePreview && testImagePlaceholder) {
                testImagePreview.src = enhancedImage.src;
                testImagePreview.classList.remove('hidden');
                testImagePlaceholder.classList.add('hidden');
            }

            const result = await zxingReader.decodeFromImageElement(enhancedImage);
            if (result) {
                return { text: result.getText(), format: displayFormat(result.getBarcodeFormat()), image: enhancedImage };
            }
        } catch (error) {}
    }
    return null;
}

//写真撮影・画像選択時
async function scanCanvas(sourceImage) {
    if (typeof clearOverlay === 'function') clearOverlay();

    const lightResult = await tryLightScan(canvas);
    if (lightResult) {
        handleSuccess(lightResult.text, lightResult.format, sourceImage);
        return;
    }

    const heavyResult = await tryHeavyScan(canvas);
    if (heavyResult) {
        handleSuccess(heavyResult.text, heavyResult.format, heavyResult.image);
        return;
    }

    showToast('コードが読み取れませんでした。');
}

//ライブスキャン時
async function startLiveScanLoop() {
    if (!isLiveScanning) return;

    const videoPreview = document.getElementById('videoPreview');
    const captureCanvas = document.getElementById('captureCanvas');

    if (videoPreview && videoPreview.readyState === videoPreview.HAVE_ENOUGH_DATA) {
        const vW = videoPreview.videoWidth;
        const vH = videoPreview.videoHeight;

        //カメラ映像から切り抜く
        const cropW = vW * 0.7; //幅70%
        const cropH = vH * 0.4; //高さ40%
        const cropX = (vW - cropW) / 2;
        const cropY = (vH - cropH) / 2;

        captureCanvas.width = cropW;
        captureCanvas.height = cropH;
        const ctx = captureCanvas.getContext('2d', { willReadFrequently: true });

        //中央部分だけをキャプチャする
        ctx.drawImage(
            videoPreview, 
            cropX, cropY, cropW, cropH,
            0, 0, cropW, cropH
        );
        
        //コントラストをアゲアゲ
        const liveImageData = ctx.getImageData(0, 0, captureCanvas.width, captureCanvas.height);
        const livePixels = liveImageData.data;
        const liveContrast = 1.6;

        for (let i = 0; i < livePixels.length; i += 4) {
            const gray = 0.299 * livePixels[i] + 0.587 * livePixels[i + 1] + 0.114 * livePixels[i + 2];
            const contrast = Math.max(0, Math.min(255, (gray - 128) * liveContrast + 128));
            livePixels[i] = contrast;
            livePixels[i + 1] = contrast;
            livePixels[i + 2] = contrast;
        }
        ctx.putImageData(liveImageData, 0, 0);

        if (!isCoolingDown) {
            if (typeof clearOverlay === 'function') clearOverlay();

            // 基本は高速な Light スキャン
            let result = await tryLightScan(captureCanvas);

            if (result) {
                //成功したら失敗カウンターをリセットして処理
                failCount = 0;
                triggerLiveSuccess(result.text, result.format, captureCanvas);
            } else {
                //失敗したらカウンターを増やす
                failCount++;
                
                // なかなか読み込めなかったらHeavy
                if (failCount >= 15) {
                    console.log('Heavyスキャン開始');
                    const heavyResult = await tryHeavyScan(captureCanvas);
                    
                    if (heavyResult) {
                        failCount = 0;
                        triggerLiveSuccess(heavyResult.text, heavyResult.format, heavyResult.image);
                    } else {
                        // Heavyでもダメだったらカウンターを少し戻す
                        failCount = 10; 
                    }
                }
            }
        }
    }

    //ライブスキャン中であれば次のフレームへ継続
    if (isLiveScanning) {
        requestAnimationFrame(startLiveScanLoop);
    }
}

//成功時のクールダウン
function triggerLiveSuccess(code, format, img) {
    isCoolingDown = true;
    if (typeof playBeep === 'function') playBeep();
    handleSuccess(code, format, img);

    //3秒間は同じコードを連続読み取りしない
    setTimeout(() => {
        isCoolingDown = false;
    }, 3000);
}

// async function scanCanvas(sourceImage) {
//     clearOverlay();

//     //1.ネイティブAPI(BarcodeDetector)を試す
//     if ('BarcodeDetector' in window) {
//         try {
//             const requestedFormats = ['ean_13','upc_a',];  //'ean_8', 'upc_e'
//             const supportedFormats = await BarcodeDetector.getSupportedFormats();
//             const formats = requestedFormats.filter(format => supportedFormats.includes(format));
//             if (formats.length) {
//                 const detector = new BarcodeDetector({ formats });
//                 const barcodes = await detector.detect(canvas);
//                 if (barcodes.length > 0) {
//                     const barcode = barcodes[0];
//                     if (barcode.cornerPoints) drawBoundingBox(barcode.cornerPoints);
//                     handleSuccess(barcode.rawValue, displayFormat(barcode.format),sourceImage);
//                     return;
//                 }
//             }
//         } catch (error) {
//             console.log('BarcodeDetector読み取り失敗:', error);
//         }
//     }

//     //2.ZXingの通常読み取りを試す
//     try {
//         const result = await zxingReader.decodeFromImageElement(sourceImage);
//         handleSuccess(result.getText(), displayFormat(result.getBarcodeFormat()),sourceImage);
//         return;
//     } catch (error) {
//         console.log('ZXing読み取り失敗:', error);
//     }


//  // 3.二値化のしきい値を段階的に変えながら試す
// const thresholds = []; // しきい値
//     for (let t = 60; t <= 120; t += 10) { //60~120まで10刻み
//         thresholds.push(t);
//     }
//     let lastEnhancedImage = null;
    
//     const scale = Math.min(1, 2200 / canvas.width);
//     const enhancedCanvas = document.createElement('canvas');
//     enhancedCanvas.width = Math.max(1, Math.round(canvas.width * scale));
//     enhancedCanvas.height = Math.max(1, Math.round(canvas.height * scale));
//     const enhancedContext = enhancedCanvas.getContext('2d', { willReadFrequently: true });
//     enhancedContext.imageSmoothingEnabled = false;

//     const baseCanvas = document.createElement('canvas');
//     baseCanvas.width = enhancedCanvas.width;
//     baseCanvas.height = enhancedCanvas.height;
//     const baseCtx = baseCanvas.getContext('2d', { willReadFrequently: true });
//     baseCtx.drawImage(canvas, 0, 0, enhancedCanvas.width, enhancedCanvas.height);
//     const originalImageData = baseCtx.getImageData(0, 0, baseCanvas.width, baseCanvas.height);

//     for (const threshold of thresholds) {
//         try {
//             const imageData = new ImageData(
//                 new Uint8ClampedArray(originalImageData.data),
//                 originalImageData.width,
//                 originalImageData.height
//             );
//             const pixels = imageData.data;

//             for (let i = 0; i < pixels.length; i += 4) {
//                 // グレースケール化
//                 const gray = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
                
//                 //二値化処理
//                 const binary = gray < threshold ? 0 : 255;
                
//                 pixels[i] = binary;
//                 pixels[i + 1] = binary;
//                 pixels[i + 2] = binary;
//             }
            
//             enhancedContext.putImageData(imageData, 0, 0);

//             const enhancedImage = new Image();
//             enhancedImage.src = enhancedCanvas.toDataURL('image/png');
//             await enhancedImage.decode();
            
//             lastEnhancedImage = enhancedImage;
            
//             const result = await zxingReader.decodeFromImageElement(enhancedImage);
//             handleSuccess(result.getText(), displayFormat(result.getBarcodeFormat()), enhancedImage);
//             return;
//         } catch (error) {
//             console.log(`しきい値 (${threshold}) での読み取り失敗`);
//         }
//         if (lastEnhancedImage) {
//         const testImagePreview = document.getElementById('testImagePreview');
//         const testImagePlaceholder = document.getElementById('testImagePlaceholder');
//         if (testImagePreview && testImagePlaceholder) {
//             testImagePreview.src = lastEnhancedImage.src;
//             testImagePreview.classList.remove('hidden');
//             testImagePlaceholder.classList.add('hidden');
//         }
//     }
//     }

//     showToast('コードが読み取れませんでした。ピントを合わせて再度撮影してください');
// }

//オーバーレイをリセット------------------------------------------------------------------
function clearOverlay() {
    const ctx = overlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
}

// 検出領域オーバーレイの描画---------------------------------------------------------------
function drawBoundingBox(points) {
    if (!points || points.length === 0) return;
    const ctx = overlayCanvas.getContext('2d');

    ctx.strokeStyle = '#44e4ef';
    ctx.lineWidth = Math.max(4, Math.floor(overlayCanvas.width / 150));
    ctx.fillStyle = 'rgba(11, 132, 226, 0.2)';

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
        ctx.fillStyle = '#47cae4';
        ctx.fill();
    });
}

// バーコード形式の表示名を整形-----------------------------------------------------------
function displayFormat(format) {
    const name = String(format || 'Barcode').toLowerCase();
    if (name.includes('ean_13') || format === ZXing.BarcodeFormat.EAN_13) return 'JAN / EAN-13';
    if (name.includes('ean_8') || format === ZXing.BarcodeFormat.EAN_8) return 'JAN / EAN-8';
    return String(format || 'Barcode');
}