/**
 * STOCK SCANNER MODULE — Détection EAN/Code-barres
 * Cascade: BarcodeDetector natif → Quagga2 (ZXing)
 * IIFE self-contained, styles `scan-`, API `StockScanner.mount()`
 */

const StockScanner = (() => {
  let hostEl = null;
  let videoEl = null;
  let inputEl = null;
  let stream = null;
  let scanning = false;
  let detectorType = null;
  
  const FORMATS = ['ean_13', 'ean_8', 'upca', 'code_128'];
  let onDetected = null;
  let onError = null;

  const hasNativeDetector = () => {
    return typeof BarcodeDetector !== 'undefined';
  };

  const loadQuagga = async () => {
    if (typeof Quagga !== 'undefined') return true;
    try {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/quagga/1.4.2/quagga.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
      return true;
    } catch (e) {
      console.error('[StockScanner] Quagga load failed:', e);
      return false;
    }
  };

  const startNativeDetector = async () => {
    if (!hasNativeDetector()) {
      console.warn('[StockScanner] BarcodeDetector not available');
      return false;
    }

    try {
      const detector = new BarcodeDetector({ formats: FORMATS });
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { min: 640, ideal: 1280, max: 1920 },
          height: { min: 480, ideal: 720, max: 1080 },
        },
      });

      videoEl.srcObject = stream;
      videoEl.play();
      detectorType = 'native';

      const detectLoop = async () => {
        if (!scanning) return;
        try {
          const barcodes = await detector.detect(videoEl);
          if (barcodes.length > 0) {
            const barcode = barcodes[0];
            const rawValue = barcode.rawValue || barcode.value;
            handleDetection(rawValue, 'native');
            stopScanner();
          }
        } catch (e) {
          console.warn('[StockScanner] Detection error:', e);
        }
        if (scanning) requestAnimationFrame(detectLoop);
      };

      detectLoop();
      return true;
    } catch (e) {
      console.error('[StockScanner] Native detector failed:', e);
      if (onError) onError('Caméra non accessible');
      return false;
    }
  };

  const startQuaggaDetector = async () => {
    const ok = await loadQuagga();
    if (!ok) return false;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { min: 640, ideal: 1280 },
          height: { min: 480, ideal: 720 },
        },
      });

      videoEl.srcObject = stream;
      videoEl.play();
      detectorType = 'quagga';

      Quagga.init({
        inputStream: {
          type: 'LiveStream',
          constraints: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'environment',
          },
        },
        decoder: { readers: FORMATS },
        locate: true,
        frequency: 10,
      }, (err) => {
        if (err) {
          console.error('[StockScanner] Quagga init failed:', err);
          if (onError) onError('Scanner non disponible');
          return;
        }
        Quagga.start();
        scanning = true;
        Quagga.onDetected((data) => {
          if (data && data.codeResult) {
            const code = data.codeResult.code;
            handleDetection(code, 'quagga');
            stopScanner();
          }
        });
      });

      return true;
    } catch (e) {
      console.error('[StockScanner] Quagga failed:', e);
      if (onError) onError('Quagga non disponible');
      return false;
    }
  };

  const handleDetection = (code, source) => {
    if (!code) return;
    console.log(`[StockScanner] Detected (${source}): ${code}`);
    if (inputEl) {
      inputEl.value = code;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.focus();
    }
    if (onDetected) {
      onDetected({ code, source });
    }
  };

  const stopScanner = async () => {
    scanning = false;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
    if (detectorType === 'quagga' && typeof Quagga !== 'undefined') {
      try { Quagga.stop(); } catch (e) {}
    }
    if (videoEl) videoEl.srcObject = null;
    updateUI();
  };

  const updateUI = () => {
    const btnStart = document.getElementById('scan-btn-start');
    const btnStop = document.getElementById('scan-btn-stop');
    const preview = document.getElementById('scan-preview');
    if (scanning) {
      if (btnStart) btnStart.style.display = 'none';
      if (btnStop) btnStop.style.display = 'inline-block';
      if (preview) preview.style.display = 'block';
    } else {
      if (btnStart) btnStart.style.display = 'inline-block';
      if (btnStop) btnStop.style.display = 'none';
      if (preview) preview.style.display = 'none';
    }
  };

  const renderScanner = () => {
    return `
      <div class="scan-container">
        <div class="scan-controls">
          <button type="button" id="scan-btn-start" class="scan-btn scan-btn-primary">
            📱 Scanner EAN
          </button>
          <button type="button" id="scan-btn-stop" class="scan-btn scan-btn-secondary" style="display: none;">
            ⏹️ Arrêter
          </button>
          <div class="scan-status" id="scan-status"></div>
        </div>
        <div class="scan-preview" id="scan-preview" style="display: none;">
          <video id="scan-video" class="scan-video" playsinline></video>
          <div class="scan-overlay">
            <div class="scan-reticle"></div>
            <div class="scan-hint">Orientez le code-barres vers le centre</div>
          </div>
        </div>
      </div>
    `;
  };

  return {
    mount(selector, inputSelector) {
      hostEl = typeof selector === 'string'
        ? document.querySelector(selector)
        : selector;
      inputEl = typeof inputSelector === 'string'
        ? document.querySelector(inputSelector)
        : inputSelector;

      if (!hostEl || !inputEl) {
        console.error('[StockScanner] mount: host or input not found');
        return;
      }

      hostEl.innerHTML = renderScanner();
      videoEl = document.getElementById('scan-video');
      const btnStart = document.getElementById('scan-btn-start');
      const btnStop = document.getElementById('scan-btn-stop');
      const statusDiv = document.getElementById('scan-status');

      btnStart.addEventListener('click', async () => {
        scanning = true;
        statusDiv.textContent = 'Initialisation...';
        const nativeOk = await startNativeDetector();
        if (!nativeOk) {
          statusDiv.textContent = 'Fallback Quagga...';
          const quaggaOk = await startQuaggaDetector();
          if (!quaggaOk) {
            scanning = false;
            statusDiv.textContent = 'Caméra non disponible';
            updateUI();
          } else {
            statusDiv.textContent = 'Scanner actif (Quagga)';
            updateUI();
          }
        } else {
          statusDiv.textContent = 'Scanner actif (Natif)';
          updateUI();
        }
      });

      btnStop.addEventListener('click', async () => {
        await stopScanner();
        statusDiv.textContent = '';
      });
    },

    onDetected(callback) { onDetected = callback; },
    onError(callback) { onError = callback; },
    stop() { return stopScanner(); },
    isScanning() { return scanning; },
    getDetectorType() { return detectorType; },
    triggerScanner() {
      if (inputEl) {
        inputEl.focus();
        inputEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    },
  };
})();
