// ════════════════════════════════════════════
//  RetroGEN V2 — Motor: Genesis.js (PicoDrive)
//  API: embedGenesis({ container, name, rom, player1, cbStarted })
//  Sin WASM, sin CDN, sin iframes — puro JS
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

// ══ ESTADO ══
let emuRunning  = false;
let paused      = false;
let lastROMBuf  = null;   // ArrayBuffer — para poder remontar en STOP
let lastROMName = '';
let fpsInterval = null;
let fpsFrames   = 0;
let fpsLast     = performance.now();

const TARGET_FPS     = 60;
const FRAME_DURATION = 1000 / TARGET_FPS;

// ══ SPLASH ══
function drawSplash() {
    const ctx = splash.getContext('2d');
    const w = splash.width, h = splash.height;
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#000d22');
    g.addColorStop(1, '#001a44');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0,102,255,0.12)';
    ctx.lineWidth = 1;
    for (let y = 0; y < h; y += 16) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
    ctx.fillStyle = '#0066ff';
    ctx.font = 'bold 20px Orbitron, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('RetroGEN', w/2, h/2 - 18);
    ctx.fillStyle = '#3388ff';
    ctx.font = '8px Share Tech Mono, monospace';
    ctx.fillText('SEGA MEGA DRIVE / GENESIS EMULATOR', w/2, h/2 + 6);
    ctx.fillStyle = '#546e7a';
    ctx.font = '7px Share Tech Mono, monospace';
    ctx.fillText('Cargá una ROM  .md / .bin / .gen / .32x', w/2, h/2 + 24);
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
    document.getElementById('loaderText').textContent = txt || 'CARGANDO...';
    loaderOvrl.style.display = 'flex';
}
function hideLoader() { loaderOvrl.style.display = 'none'; }

// ══ FPS COUNTER ══
function startFPS() {
    stopFPS();
    fpsFrames = 0; fpsLast = performance.now();
    fpsInterval = setInterval(() => {
        const now = performance.now(), delta = now - fpsLast;
        if (delta >= 1000) {
            fpsEl.textContent = Math.min(Math.round((fpsFrames/delta)*1000), 60) + ' FPS';
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
let gpPrev = {}, gpAxesPrev = { up:false, down:false, left:false, right:false };
const DEAD = 0.45;

// Genesis.js acepta eventos de teclado nativos — el gamepad lo mapeamos
// generando keydown/keyup sintéticos con los KeyCodes correctos
const GP_KEY_MAP = {
    0:  'KeyS',      // B Mega Drive
    1:  'KeyW',      // Y
    2:  'Enter',     // Select → Start (no tiene select)
    3:  'Enter',     // Start
    4:  'ArrowUp',
    5:  'ArrowDown',
    6:  'ArrowLeft',
    7:  'ArrowRight',
    8:  'KeyA',      // A Mega Drive
    9:  'KeyQ',      // X
    10: 'KeyD',      // C
    11: 'KeyZ',      // Mode
};

function fireKey(code, down) {
    const type = down ? 'keydown' : 'keyup';
    document.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
}

function pollGamepad() {
    if (!emuRunning || paused) return;
    const gps = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp  = [...gps].find(g => g?.connected);
    if (!gp) return;

    gp.buttons.forEach((btn, i) => {
        const pressed = btn.pressed || btn.value > 0.5;
        const code = GP_KEY_MAP[i];
        if (!code) return;
        if ( pressed && !gpPrev[i]) fireKey(code, true);
        if (!pressed &&  gpPrev[i]) fireKey(code, false);
        gpPrev[i] = pressed;
    });

    const ax = gp.axes[0]||0, ay = gp.axes[1]||0;
    const axL = ax < -DEAD, axR = ax > DEAD, axU = ay < -DEAD, axD = ay > DEAD;
    const axes = [
        [axL, gpAxesPrev.left,  'ArrowLeft'],
        [axR, gpAxesPrev.right, 'ArrowRight'],
        [axU, gpAxesPrev.up,    'ArrowUp'],
        [axD, gpAxesPrev.down,  'ArrowDown'],
    ];
    axes.forEach(([cur, prev, code]) => {
        if ( cur && !prev) fireKey(code, true);
        if (!cur &&  prev) fireKey(code, false);
    });
    gpAxesPrev = { left:axL, right:axR, up:axU, down:axD };
}

let gpPollInterval = null;
function startGPPoll() {
    stopGPPoll();
    gpPollInterval = setInterval(pollGamepad, FRAME_DURATION);
}
function stopGPPoll() {
    if (gpPollInterval) { clearInterval(gpPollInterval); gpPollInterval = null; }
    gpPrev = {}; gpAxesPrev = { up:false, down:false, left:false, right:false };
}

window.addEventListener('gamepadconnected', e => {
    const el = document.getElementById('gamepadStatus');
    el.textContent = '🎮 Conectado: ' + e.gamepad.id.substring(0,55);
    el.classList.add('connected');
});
window.addEventListener('gamepaddisconnected', () => {
    const el = document.getElementById('gamepadStatus');
    el.textContent = 'Joystick desconectado';
    el.classList.remove('connected');
    stopGPPoll();
});

// ══ MONTAR EMULADOR ══
function mountEmulator(romBuffer, romName) {
    hideError();

    // Verificar que Genesis.js está cargado
    if (typeof embedGenesis === 'undefined') {
        showError(
            'Motor no encontrado: js/Genesis.min.js',
            '→ Descargá Genesis.min.js desde https://github.com/lrusso/Genesis y colocalo en la carpeta js/'
        );
        setStatus('Motor no encontrado', 'err');
        return;
    }

    // Desmontar instancia previa si existe
    unmountEmulator(true);

    lastROMBuf  = romBuffer;
    lastROMName = romName;

    // Mostrar contenedor — ANTES de llamar embedGenesis para que
    // tenga dimensiones reales cuando el motor lea el layout
    splash.style.display       = 'none';
    emuContainer.style.display = 'block';
    showLoader('CARGANDO ROM...');

    try {
        embedGenesis({
            container: 'emuContainer',
            name: romName,
            rom: romBuffer,
            player1: {
                up:    'ArrowUp',
                down:  'ArrowDown',
                left:  'ArrowLeft',
                right: 'ArrowRight',
                start: 'Enter',
                mode:  'KeyZ',
                a:     'KeyA',
                b:     'KeyS',
                c:     'KeyD',
                x:     'KeyQ',
                y:     'KeyW',
                z:     'KeyE',
            },
            cbStarted: function() {
                hideLoader();
                emuRunning = true;
                paused     = false;
                romNameEl.textContent = '▸ ' + romName;
                setStatus('Emulando: ' + romName, 'on');
                enableButtons(false, true, true);
                startFPS();
                startGPPoll();
            }
        });
    } catch(e) {
        hideLoader();
        splash.style.display       = 'block';
        emuContainer.style.display = 'none';
        setStatus('Error al cargar ROM', 'err');
        showError('No se pudo iniciar el emulador: ' + e.message);
        console.error('[RetroGEN]', e);
    }
}

// ══ DESMONTAR EMULADOR ══
// Genesis.js no expone un método destroy() — limpiamos el DOM directamente
function unmountEmulator(silent) {
    stopFPS();
    stopGPPoll();
    emuRunning = false;
    paused     = false;

    // Vaciar el contenedor — destruye el canvas y detiene el loop interno
    emuContainer.innerHTML = '';

    if (!silent) {
        splash.style.display       = 'block';
        emuContainer.style.display = 'none';
        romNameEl.textContent = '';
        lastROMBuf  = null;
        lastROMName = '';
        setStatus('Detenido — cargá una nueva ROM para continuar', null);
        enableButtons(false, false, false);
        hideLoader();
    }
}

// ══ CARGA DE ROM ══
function handleROMFile(file) {
    if (!file) return;
    hideError();
    setStatus('Leyendo archivo...', null);
    const reader = new FileReader();
    reader.onload  = ev => mountEmulator(ev.target.result, file.name);
    reader.onerror = () => { setStatus('Error al leer el archivo', 'err'); showError('No se pudo leer el archivo ROM.'); };
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

// ══ BOTONES ══
document.getElementById('btnPause').onclick = () => {
    if (!emuRunning) return;
    if (!paused) {
        // Genesis.js respeta el foco — quitamos el foco del contenedor para "pausar" input
        // y mostramos el estado. El loop interno sigue pero sin input.
        // Para pausa real disparamos Escape que Genesis.js interpreta como menú interno.
        paused = true;
        stopFPS(); stopGPPoll();
        ledEl.className = 'led';
        setStatus('Pausado — presioná ▶ PLAY para continuar', null);
        document.getElementById('btnPause').textContent = '⏸ PAUSADO';
        enableButtons(true, false, true);
        // Disparar pausa interna si Genesis.js la soporta
        try { emuContainer.querySelector('canvas')?.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true })); } catch(_) {}
    }
};

document.getElementById('btnPlay').onclick = () => {
    if (!emuRunning) return;
    if (paused) {
        paused = false;
        setStatus('Emulando: ' + lastROMName, 'on');
        document.getElementById('btnPause').textContent = '⏸ PAUSA';
        enableButtons(false, true, true);
        startFPS(); startGPPoll();
        try { emuContainer.querySelector('canvas')?.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true })); } catch(_) {}
    }
};

document.getElementById('btnStop').onclick = () => {
    unmountEmulator(false);
};

// ══ INICIO ══
(function init() {
    drawSplash();

    if (typeof embedGenesis === 'undefined') {
        setStatus('⚠ Falta js/Genesis.min.js — ver README', 'err');
        showError(
            'El motor Genesis.min.js no está en la carpeta js/',
            '→ Descargalo desde: https://github.com/lrusso/Genesis/raw/main/Genesis.min.js'
        );
    } else {
        setStatus('Listo — cargá una ROM .md / .bin / .gen / .32x para comenzar', null);
    }

    enableButtons(false, false, false);
})();
