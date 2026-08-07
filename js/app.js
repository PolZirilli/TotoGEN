// ════════════════════════════════════════════
//  TotoGEN — Emulador Sega Mega Drive / Genesis
//  Motor: Genesis.js (PicoDrive JS puro)
// ════════════════════════════════════════════

// ══ REFS UI ══
const splash       = document.getElementById('splashCanvas');
const emuContainer = document.getElementById('emuContainer');
const loaderOvrl   = document.getElementById('loaderOverlay');
const ledEl        = document.getElementById('led');
const statusEl     = document.getElementById('statusText');
const fpsEl        = document.getElementById('fpsCounter');
const romNameEl    = document.getElementById('romName');
const errorBox     = document.getElementById('errorBox');
const screenWrap   = document.getElementById('screenWrap');

// ══ ESTADO ══
let emuRunning  = false;
let paused      = false;
let lastROMName = '';
let fpsInterval = null;
let fpsFrames   = 0;
let fpsLast     = performance.now();

const TARGET_FPS     = 60;
const FRAME_DURATION = 1000 / TARGET_FPS;

// ══ FIX 1: Prevenir scroll de página con teclas de dirección ══
// Solo cuando el emulador está corriendo para no romper la navegación normal
window.addEventListener('keydown', function(e) {
    if (!emuRunning) return;
    const blocked = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '];
    if (blocked.includes(e.key)) {
        e.preventDefault();
    }
}, { passive: false });

// ══ FIX 4: Splash sin título — solo grid de líneas + subtítulo ══
function drawSplash() {
    const ctx = splash.getContext('2d');
    const w = splash.width, h = splash.height;
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#000d22');
    g.addColorStop(1, '#001a44');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Grid de líneas decorativas
    ctx.strokeStyle = 'rgba(0,102,255,0.10)';
    ctx.lineWidth = 1;
    for (let y = 0; y < h; y += 16) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    for (let x = 0; x < w; x += 32) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }

    // Solo subtítulo — sin TotoGEN
    ctx.fillStyle = '#2a3a52';
    ctx.font = '7px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LOAD A ROM TO START', w / 2, h / 2);
}

// ══ UI HELPERS ══
function setStatus(msg, ledState) {
    statusEl.textContent = msg;
    ledEl.className = 'led' + (ledState ? ' ' + ledState : '');
}
function enableButtons(play, pause, stop) {
    document.getElementById('btnPlay').disabled  = !play;
    document.getElementById('btnPause').disabled = !pause;
    document.getElementById('btnStop').disabled  = !stop;
}
function showError(msg, hint) {
    errorBox.style.display = 'block';
    document.getElementById('errorMsg').textContent  = ' ' + msg;
    document.getElementById('errorHint').textContent = hint || '';
}
function hideError() { errorBox.style.display = 'none'; }
function showLoader(txt) {
    document.getElementById('loaderText').textContent = txt || 'LOADING...';
    loaderOvrl.style.display = 'flex';
}
function hideLoader() { loaderOvrl.style.display = 'none'; }

// ══ FPS ══
function startFPS() {
    stopFPS();
    fpsFrames = 0; fpsLast = performance.now();
    fpsInterval = setInterval(() => {
        const now = performance.now(), delta = now - fpsLast;
        if (delta >= 1000) {
            fpsEl.textContent = Math.min(Math.round((fpsFrames / delta) * 1000), 60) + ' FPS';
            fpsFrames = 0; fpsLast = now;
        }
        fpsFrames++;
    }, FRAME_DURATION);
}
function stopFPS() {
    if (fpsInterval) { clearInterval(fpsInterval); fpsInterval = null; }
    fpsEl.textContent = '';
}

// ══ GAMEPAD ══
let gpPrev = {}, gpAxesPrev = { up: false, down: false, left: false, right: false };
const DEAD = 0.45;
const GP_KEY_MAP = {
    0: 'KeyS', 1: 'KeyW', 3: 'Enter',
    4: 'ArrowUp', 5: 'ArrowDown', 6: 'ArrowLeft', 7: 'ArrowRight',
    8: 'KeyA', 9: 'KeyQ', 10: 'KeyD', 11: 'KeyZ',
};
function fireKey(code, down) {
    document.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
}
function pollGamepad() {
    if (!emuRunning || paused) return;
    const gp = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(g => g?.connected);
    if (!gp) return;
    gp.buttons.forEach((btn, i) => {
        const pressed = btn.pressed || btn.value > 0.5;
        const code = GP_KEY_MAP[i];
        if (!code) return;
        if (pressed && !gpPrev[i]) fireKey(code, true);
        if (!pressed && gpPrev[i]) fireKey(code, false);
        gpPrev[i] = pressed;
    });
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    const axL = ax < -DEAD, axR = ax > DEAD, axU = ay < -DEAD, axD = ay > DEAD;
    [[axL, gpAxesPrev.left, 'ArrowLeft'], [axR, gpAxesPrev.right, 'ArrowRight'],
     [axU, gpAxesPrev.up, 'ArrowUp'],    [axD, gpAxesPrev.down, 'ArrowDown']
    ].forEach(([c, p, k]) => {
        if (c && !p) fireKey(k, true);
        if (!c && p) fireKey(k, false);
    });
    gpAxesPrev = { left: axL, right: axR, up: axU, down: axD };
}
let gpPollInterval = null;
function startGPPoll() { stopGPPoll(); gpPollInterval = setInterval(pollGamepad, FRAME_DURATION); }
function stopGPPoll() {
    if (gpPollInterval) { clearInterval(gpPollInterval); gpPollInterval = null; }
    gpPrev = {}; gpAxesPrev = { up: false, down: false, left: false, right: false };
}
window.addEventListener('gamepadconnected', e => {
    const el = document.getElementById('gamepadStatus');
    el.textContent = '🎮 Connected: ' + e.gamepad.id.substring(0, 55);
    el.classList.add('connected');
});
window.addEventListener('gamepaddisconnected', () => {
    const el = document.getElementById('gamepadStatus');
    el.textContent = 'Gamepad disconnected';
    el.classList.remove('connected');
    stopGPPoll();
});

// ══ FIX 2: FULLSCREEN ══
const btnFullscreen = document.getElementById('btnFullscreen');

btnFullscreen.addEventListener('click', toggleFullscreen);

document.addEventListener('fullscreenchange',       updateFullscreenBtn);
document.addEventListener('webkitfullscreenchange', updateFullscreenBtn);
document.addEventListener('mozfullscreenchange',    updateFullscreenBtn);

function toggleFullscreen() {
    const el = screenWrap;
    const isFS = !!(document.fullscreenElement ||
                    document.webkitFullscreenElement ||
                    document.mozFullScreenElement);
    if (!isFS) {
        const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
        if (req) req.call(el);
    } else {
        const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
        if (exit) exit.call(document);
    }
}

function updateFullscreenBtn() {
    const isFS = !!(document.fullscreenElement ||
                    document.webkitFullscreenElement ||
                    document.mozFullScreenElement);
    btnFullscreen.textContent = isFS ? '✕' : '⛶';
    btnFullscreen.title = isFS ? 'Exit Fullscreen' : 'Fullscreen';
}

// ══ FIX 3: STOP — matar audio correctamente ══
// Genesis.js crea nodos de AudioContext. Para detenerlos hay que
// suspender el AudioContext global o cerrar todos los nodos activos.
function killAudio() {
    // Cerrar cualquier AudioContext abierto por Genesis.js
    try {
        if (window.AudioContext || window.webkitAudioContext) {
            // Genesis.js expone su contexto en algunos builds como _audioCtx
            const emuCtx = window._audioCtx || window._genesisAudioCtx;
            if (emuCtx && emuCtx.state !== 'closed') {
                emuCtx.close();
            }
        }
    } catch (_) {}

    // Buscar y desconectar nodos de audio activos que Genesis.js dejó en el DOM
    // a través de AudioContext globales (técnica de último recurso)
    try {
        const audioEls = document.querySelectorAll('audio');
        audioEls.forEach(a => { a.pause(); a.src = ''; a.remove(); });
    } catch (_) {}
}

// ══ MONTAR EMULADOR ══
function mountEmulator(romBuffer, romName) {
    hideError();
    if (typeof embedGenesis === 'undefined') {
        showError('Engine not found: js/Genesis.min.js',
            '→ Download from: https://github.com/lrusso/Genesis/raw/main/Genesis.min.js');
        setStatus('Engine not found', 'err');
        return;
    }
    unmountEmulator(true);
    lastROMName = romName;
    splash.style.display       = 'none';
    emuContainer.style.display = 'block';
    showLoader('LOADING ROM...');
    try {
        embedGenesis({
            container: 'emuContainer',
            name: romName,
            rom: romBuffer,
            player1: {
                up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
                start: 'Enter', mode: 'KeyZ',
                a: 'KeyA', b: 'KeyS', c: 'KeyD', x: 'KeyQ', y: 'KeyW', z: 'KeyE',
            },
            cbStarted: function () {
                hideLoader();
                emuRunning = true;
                paused     = false;
                romNameEl.textContent = '▸ ' + romName;
                setStatus('Playing: ' + romName, 'on');
                enableButtons(false, true, true);
                startFPS();
                startGPPoll();
            }
        });
    } catch (e) {
        hideLoader();
        splash.style.display       = 'block';
        emuContainer.style.display = 'none';
        setStatus('Error loading ROM', 'err');
        showError('Could not start emulator: ' + e.message);
    }
}

// ══ DESMONTAR ══
function unmountEmulator(silent) {
    stopFPS();
    stopGPPoll();
    emuRunning = false;
    paused     = false;

    // FIX 3: matar audio ANTES de vaciar el contenedor
    killAudio();

    // Vaciar el DOM del emulador — destruye canvas y detiene el loop
    emuContainer.innerHTML = '';

    if (!silent) {
        // Salir de fullscreen si está activo
        const isFS = !!(document.fullscreenElement ||
                        document.webkitFullscreenElement ||
                        document.mozFullScreenElement);
        if (isFS) {
            const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
            if (exit) exit.call(document);
        }

        splash.style.display       = 'block';
        emuContainer.style.display = 'none';
        romNameEl.textContent = '';
        lastROMName = '';
        setStatus('', null);
        enableButtons(false, false, false);
        hideLoader();
    }
}

// ══ CARGA DE ROM (archivo local) ══
function handleROMFile(file) {
    if (!file) return;
    hideError();
    const reader = new FileReader();
    reader.onload  = ev => mountEmulator(ev.target.result, file.name);
    reader.onerror = () => showError('Could not read the ROM file.');
    reader.readAsArrayBuffer(file);
}

document.getElementById('romInput').addEventListener('change', e => {
    handleROMFile(e.target.files[0]);
    e.target.value = '';
});
const drop = document.getElementById('fileDrop');
drop.addEventListener('click',    () => document.getElementById('romInput').click());
drop.addEventListener('dragover',  e => { e.preventDefault(); drop.classList.add('drag'); });
drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
drop.addEventListener('drop', e => {
    e.preventDefault(); drop.classList.remove('drag');
    handleROMFile(e.dataTransfer.files[0]);
});

// ══ CARGA DE ROM PRESET ══
document.getElementById('btnLoadPreset').addEventListener('click', () => {
    const url = document.getElementById('romSelect').value;
    if (!url) return;
    hideError();
    setStatus('Fetching ROM...', null);
    fetch(url)
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
        .then(buf => mountEmulator(buf, url.split('/').pop()))
        .catch(err => { showError('Could not load preset ROM.', err.message); setStatus('Load error', 'err'); });
});

// ══ BOTONES ══
document.getElementById('btnPause').onclick = () => {
    if (!emuRunning) return;
    if (!paused) {
        paused = true;
        stopFPS(); stopGPPoll();
        ledEl.className = 'led';
        setStatus('Paused — press ▶ PLAY to continue', null);
        document.getElementById('btnPause').textContent = '⏸ PAUSED';
        enableButtons(true, false, true);
        try { emuContainer.querySelector('canvas')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); } catch (_) {}
    }
};
document.getElementById('btnPlay').onclick = () => {
    if (!emuRunning) return;
    if (paused) {
        paused = false;
        setStatus('Playing: ' + lastROMName, 'on');
        document.getElementById('btnPause').textContent = '⏸ PAUSE';
        enableButtons(false, true, true);
        startFPS(); startGPPoll();
        try { emuContainer.querySelector('canvas')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); } catch (_) {}
    }
};
document.getElementById('btnStop').onclick = () => unmountEmulator(false);

// ══ POPUP DE CONTROLES ══
const overlay  = document.getElementById('controlsOverlay');
const btnOpen  = document.getElementById('btnControls');
const btnClose = document.getElementById('btnControlsClose');

btnOpen.addEventListener('click', () => {
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
});
btnClose.addEventListener('click', closeControls);
overlay.addEventListener('click', e => { if (e.target === overlay) closeControls(); });
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeControls();
});
function closeControls() {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
}

// ══ INICIO ══
(function init() {
    drawSplash();
    if (typeof embedGenesis === 'undefined') {
        setStatus('⚠ Missing js/Genesis.min.js — see README', 'err');
        showError('Genesis.min.js not found in js/ folder.',
            '→ Download: https://github.com/lrusso/Genesis/raw/main/Genesis.min.js');
    }
    enableButtons(false, false, false);
})();
