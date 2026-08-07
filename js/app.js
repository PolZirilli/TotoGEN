// ════════════════════════════════════════════
//  TotoGEN — Emulador Sega Mega Drive / Genesis
//  Motor: Genesis.js (PicoDrive JS puro)
// ════════════════════════════════════════════

// ══ REFS UI ══
const splash       = document.getElementById('splashCanvas');
let   emuContainer = document.getElementById('emuContainer');
const loaderOvrl   = document.getElementById('loaderOverlay');
const ledEl        = document.getElementById('led');
const statusEl     = document.getElementById('statusText');
const fpsEl        = document.getElementById('fpsCounter');
const romNameEl    = document.getElementById('romName');
const errorBox     = document.getElementById('errorBox');
const screenWrap   = document.getElementById('screenWrap');

// ══ ESTADO ══
let emuRunning      = false;
let paused          = false;
let lastROMName     = '';
let fpsInterval     = null;
let fpsFrames       = 0;
let fpsLast         = performance.now();
let genesisTimerIds = [];
let genesisRAFIds   = [];

const TARGET_FPS     = 60;
const FRAME_DURATION = 1000 / TARGET_FPS;
const DEAD           = 0.45;

// ════════════════════════════════════════════
//  GAMEPAD MAPPING
//  Mapeo por índice de botón → acción MD
//  Default genérico; el usuario puede sobreescribirlo.
// ════════════════════════════════════════════

// Acciones con su label visible y la key que dispara en Genesis.js
const ACTIONS = [
    { id: 'up',    label: 'D-Pad Up',    key: 'ArrowUp'    },
    { id: 'down',  label: 'D-Pad Down',  key: 'ArrowDown'  },
    { id: 'left',  label: 'D-Pad Left',  key: 'ArrowLeft'  },
    { id: 'right', label: 'D-Pad Right', key: 'ArrowRight' },
    { id: 'a',     label: 'Button A',    key: 'KeyA'       },
    { id: 'b',     label: 'Button B',    key: 'KeyS'       },
    { id: 'c',     label: 'Button C',    key: 'KeyD'       },
    { id: 'x',     label: 'Button X',    key: 'KeyQ'       },
    { id: 'y',     label: 'Button Y',    key: 'KeyW'       },
    { id: 'z',     label: 'Button Z',    key: 'KeyE'       },
    { id: 'start', label: 'Start',       key: 'Enter'      },
    { id: 'mode',  label: 'Mode',        key: 'KeyZ'       },
];

// Mapeo default: índice de botón físico → id de acción
// Basado en Standard Gamepad (W3C) — funciona en Xbox, PS y la mayoría
const DEFAULT_GP_MAP = {
    // Botones
    0:  'b',      // A/Cross     → B Mega Drive
    1:  'a',      // B/Circle    → A Mega Drive
    2:  'x',      // X/Square    → X Mega Drive
    3:  'y',      // Y/Triangle  → Y Mega Drive
    4:  'c',      // LB          → C Mega Drive
    5:  'z',      // RB          → Z Mega Drive
    8:  'mode',   // Select/Back → Mode
    9:  'start',  // Start/Menu  → Start
    12: 'up',     // D-pad Up
    13: 'down',   // D-pad Down
    14: 'left',   // D-pad Left
    15: 'right',  // D-pad Right
};

// Mapeo activo — se carga desde localStorage o usa el default
let gpMap = loadGPMap();

function loadGPMap() {
    try {
        const saved = localStorage.getItem('totogen_gpmap');
        if (saved) return JSON.parse(saved);
    } catch (_) {}
    return { ...DEFAULT_GP_MAP };
}
function saveGPMap() {
    try { localStorage.setItem('totogen_gpmap', JSON.stringify(gpMap)); } catch (_) {}
}

// ════════════════════════════════════════════
//  PREVENIR SCROLL CON FLECHAS
// ════════════════════════════════════════════
window.addEventListener('keydown', function(e) {
    if (!emuRunning) return;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
}, { passive: false });

// ════════════════════════════════════════════
//  SPLASH
// ════════════════════════════════════════════
function drawSplash() {
    const ctx = splash.getContext('2d');
    const w = splash.width, h = splash.height;
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#000d22'); g.addColorStop(1, '#001a44');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0,102,255,0.10)'; ctx.lineWidth = 1;
    for (let y = 0; y < h; y += 16) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
    for (let x = 0; x < w; x += 32) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
    ctx.fillStyle = '#2a3a52'; ctx.font = '7px Orbitron, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('LOAD A ROM TO START', w/2, h/2);
}

// ════════════════════════════════════════════
//  UI HELPERS
// ════════════════════════════════════════════
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

// ════════════════════════════════════════════
//  FPS
// ════════════════════════════════════════════
function startFPS() {
    stopFPS(); fpsFrames = 0; fpsLast = performance.now();
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

// ════════════════════════════════════════════
//  GAMEPAD POLLING
// ════════════════════════════════════════════
let gpPrev = {}, gpAxesPrev = { up:false, down:false, left:false, right:false };

function actionToKey(actionId) {
    return ACTIONS.find(a => a.id === actionId)?.key || null;
}
function fireKey(code, down) {
    document.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
}

function pollGamepad() {
    if (!emuRunning || paused) return;
    const gp = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(g => g?.connected);
    if (!gp) return;

    // Botones digitales
    gp.buttons.forEach((btn, i) => {
        const pressed = btn.pressed || btn.value > 0.5;
        const actionId = gpMap[i];
        const code = actionId ? actionToKey(actionId) : null;
        if (!code) return;
        if ( pressed && !gpPrev[i]) fireKey(code, true);
        if (!pressed &&  gpPrev[i]) fireKey(code, false);
        gpPrev[i] = pressed;
    });

    // Ejes analógicos → D-pad (solo si no están mapeados como botones digitales)
    const ax = gp.axes[0]||0, ay = gp.axes[1]||0;
    const axL = ax < -DEAD, axR = ax > DEAD, axU = ay < -DEAD, axD = ay > DEAD;
    [
        [axL, gpAxesPrev.left,  'left',  'ArrowLeft'],
        [axR, gpAxesPrev.right, 'right', 'ArrowRight'],
        [axU, gpAxesPrev.up,    'up',    'ArrowUp'],
        [axD, gpAxesPrev.down,  'down',  'ArrowDown'],
    ].forEach(([cur, prev, aid, fallbackCode]) => {
        // Usar la key mapeada para esa acción, o el fallback
        const code = actionToKey(aid) || fallbackCode;
        if ( cur && !prev) fireKey(code, true);
        if (!cur &&  prev) fireKey(code, false);
    });
    gpAxesPrev = { left:axL, right:axR, up:axU, down:axD };
}

let gpPollInterval = null;
function startGPPoll() { stopGPPoll(); gpPollInterval = setInterval(pollGamepad, FRAME_DURATION); }
function stopGPPoll() {
    if (gpPollInterval) { clearInterval(gpPollInterval); gpPollInterval = null; }
    gpPrev = {}; gpAxesPrev = { up:false, down:false, left:false, right:false };
}

window.addEventListener('gamepadconnected', e => {
    const el = document.getElementById('gamepadStatus');
    el.textContent = '🎮 Connected: ' + e.gamepad.id.substring(0,55);
    el.classList.add('connected');
    renderGPMap(); // actualizar el popup con el nombre del gamepad conectado
});
window.addEventListener('gamepaddisconnected', () => {
    const el = document.getElementById('gamepadStatus');
    el.textContent = 'Gamepad disconnected';
    el.classList.remove('connected');
    stopGPPoll();
});

// ════════════════════════════════════════════
//  FULLSCREEN
// ════════════════════════════════════════════
const btnFullscreen = document.getElementById('btnFullscreen');
btnFullscreen.addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange',       updateFullscreenBtn);
document.addEventListener('webkitfullscreenchange', updateFullscreenBtn);
document.addEventListener('mozfullscreenchange',    updateFullscreenBtn);

function toggleFullscreen() {
    const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
    if (!isFS) {
        const req = screenWrap.requestFullscreen || screenWrap.webkitRequestFullscreen || screenWrap.mozRequestFullScreen;
        if (req) req.call(screenWrap);
    } else {
        const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
        if (exit) exit.call(document);
    }
}
function updateFullscreenBtn() {
    const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
    btnFullscreen.textContent = isFS ? '✕' : '⛶';
    btnFullscreen.title = isFS ? 'Exit Fullscreen' : 'Fullscreen';
}

// ════════════════════════════════════════════
//  AUDIO / MOUNT / UNMOUNT
// ════════════════════════════════════════════
function killAudio() {
    try { document.querySelectorAll('audio').forEach(a => { a.pause(); a.src=''; a.remove(); }); } catch(_) {}
    ['_audioCtx','_genesisAudioCtx','genesisAudioCtx'].forEach(k => {
        try { if (window[k] && window[k].state !== 'closed') window[k].close(); } catch(_) {}
    });
}

function mountEmulator(romBuffer, romName) {
    hideError();
    if (typeof embedGenesis === 'undefined') {
        showError('Engine not found: js/Genesis.min.js', '→ Download from: https://github.com/lrusso/Genesis/raw/main/Genesis.min.js');
        setStatus('Engine not found', 'err'); return;
    }
    unmountEmulator(true);
    lastROMName = romName;
    splash.style.display       = 'none';
    emuContainer.style.display = 'block';
    showLoader('LOADING ROM...');

    const timerBaseline = setTimeout(()=>{},0); clearTimeout(timerBaseline);
    const rafBaseline   = requestAnimationFrame(()=>{}); cancelAnimationFrame(rafBaseline);

    try {
        embedGenesis({
            container: 'emuContainer',
            name: romName,
            rom: romBuffer,
            player1: {
                up:'ArrowUp', down:'ArrowDown', left:'ArrowLeft', right:'ArrowRight',
                start:'Enter', mode:'KeyZ',
                a:'KeyA', b:'KeyS', c:'KeyD', x:'KeyQ', y:'KeyW', z:'KeyE',
            },
            cbStarted: function() {
                const timerCeil = setTimeout(()=>{},0); clearTimeout(timerCeil);
                const rafCeil   = requestAnimationFrame(()=>{}); cancelAnimationFrame(rafCeil);
                genesisTimerIds = []; for (let i=timerBaseline; i<=timerCeil; i++) genesisTimerIds.push(i);
                genesisRAFIds   = []; for (let i=rafBaseline;   i<=rafCeil;   i++) genesisRAFIds.push(i);
                hideLoader();
                emuRunning = true; paused = false;
                romNameEl.textContent = '▸ ' + romName;
                setStatus('Playing: ' + romName, 'on');
                enableButtons(false, true, true);
                startFPS(); startGPPoll();
            }
        });
    } catch(e) {
        hideLoader();
        splash.style.display = 'block'; emuContainer.style.display = 'none';
        setStatus('Error loading ROM', 'err');
        showError('Could not start emulator: ' + e.message);
    }
}

function unmountEmulator(silent) {
    stopFPS(); stopGPPoll();
    emuRunning = false; paused = false;
    genesisTimerIds.forEach(id => { clearTimeout(id); clearInterval(id); });
    genesisRAFIds.forEach(id => cancelAnimationFrame(id));
    genesisTimerIds = []; genesisRAFIds = [];
    killAudio();
    const parent = emuContainer.parentNode;
    const newDiv = document.createElement('div');
    newDiv.id = 'emuContainer';
    newDiv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:none;background:#000;';
    parent.replaceChild(newDiv, emuContainer);
    emuContainer = newDiv;
    if (!silent) {
        const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
        if (isFS) { const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen; if (exit) exit.call(document); }
        splash.style.display = 'block';
        romNameEl.textContent = ''; lastROMName = '';
        setStatus('', null); enableButtons(false, false, false); hideLoader();
    }
}

// ════════════════════════════════════════════
//  CARGA DE ROM
// ════════════════════════════════════════════
function handleROMFile(file) {
    if (!file) return;
    hideError();
    const reader = new FileReader();
    reader.onload  = ev => mountEmulator(ev.target.result, file.name);
    reader.onerror = () => showError('Could not read the ROM file.');
    reader.readAsArrayBuffer(file);
}
document.getElementById('romInput').addEventListener('change', e => { handleROMFile(e.target.files[0]); e.target.value=''; });
const drop = document.getElementById('fileDrop');
drop.addEventListener('click',    () => document.getElementById('romInput').click());
drop.addEventListener('dragover',  e => { e.preventDefault(); drop.classList.add('drag'); });
drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('drag'); handleROMFile(e.dataTransfer.files[0]); });

document.getElementById('btnLoadPreset').addEventListener('click', () => {
    const url = document.getElementById('romSelect').value;
    if (!url) return;
    hideError(); setStatus('Fetching ROM...', null);
    fetch(url)
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
        .then(buf => mountEmulator(buf, url.split('/').pop()))
        .catch(err => { showError('Could not load preset ROM.', err.message); setStatus('Load error','err'); });
});

// ════════════════════════════════════════════
//  BOTONES PLAY / PAUSE / STOP
// ════════════════════════════════════════════
document.getElementById('btnPause').onclick = () => {
    if (!emuRunning || paused) return;
    paused = true; stopFPS(); stopGPPoll();
    ledEl.className = 'led';
    setStatus('Paused — press ▶ PLAY to continue', null);
    document.getElementById('btnPause').textContent = '⏸ PAUSED';
    enableButtons(true, false, true);
    try { emuContainer.querySelector('canvas')?.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); } catch(_) {}
};
document.getElementById('btnPlay').onclick = () => {
    if (!emuRunning || !paused) return;
    paused = false;
    setStatus('Playing: ' + lastROMName, 'on');
    document.getElementById('btnPause').textContent = '⏸ PAUSE';
    enableButtons(false, true, true); startFPS(); startGPPoll();
    try { emuContainer.querySelector('canvas')?.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); } catch(_) {}
};
document.getElementById('btnStop').onclick = () => unmountEmulator(false);

// ════════════════════════════════════════════
//  POPUP DE CONTROLES — con tabs Keyboard / Gamepad
// ════════════════════════════════════════════
const overlay  = document.getElementById('controlsOverlay');
const btnOpen  = document.getElementById('btnControls');
const btnClose = document.getElementById('btnControlsClose');

btnOpen.addEventListener('click', () => {
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden','false');
    renderGPMap();
});
btnClose.addEventListener('click', closeControls);
overlay.addEventListener('click', e => { if (e.target === overlay) closeControls(); });
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (listeningFor) { cancelListen(); return; }
        if (overlay.classList.contains('open')) closeControls();
    }
});
function closeControls() {
    if (listeningFor) cancelListen();
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden','true');
}

// ── Tabs ──
document.querySelectorAll('.ctrl-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.ctrl-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.ctrl-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.panel).classList.add('active');
    });
});

// ── Gamepad mapper ──
let listeningFor    = null;  // actionId en escucha
let listenInterval  = null;

function renderGPMap() {
    const gps = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp  = [...gps].find(g => g?.connected);
    const gpNameEl = document.getElementById('gpName');
    if (gpNameEl) gpNameEl.textContent = gp ? gp.id.substring(0,60) : 'No gamepad connected';

    const list = document.getElementById('gpMapList');
    if (!list) return;
    list.innerHTML = '';

    ACTIONS.forEach(action => {
        // Buscar qué índice de botón está mapeado a esta acción
        const btnIndex = Object.keys(gpMap).find(k => gpMap[k] === action.id);
        const label    = btnIndex !== undefined ? `Button ${btnIndex}` : '—';

        const row = document.createElement('div');
        row.className = 'gpmap-row';
        row.id = 'gprow-' + action.id;
        row.innerHTML = `
            <span class="gpmap-action">${action.label}</span>
            <span class="gpmap-btn" id="gpbtn-${action.id}">${label}</span>
            <button class="gpmap-set" data-action="${action.id}">Set</button>
        `;
        list.appendChild(row);
    });

    // Botones Set
    list.querySelectorAll('.gpmap-set').forEach(btn => {
        btn.addEventListener('click', () => startListen(btn.dataset.action));
    });
}

function startListen(actionId) {
    if (listeningFor) cancelListen();
    listeningFor = actionId;

    // Marcar la fila visualmente
    const row    = document.getElementById('gprow-' + actionId);
    const btnEl  = document.getElementById('gpbtn-'  + actionId);
    const setBtn = row.querySelector('.gpmap-set');
    row.classList.add('gpmap-listening');
    btnEl.textContent  = 'Press button...';
    setBtn.textContent = 'Cancel';
    setBtn.onclick     = cancelListen;

    // Polling del gamepad en modo escucha
    listenInterval = setInterval(() => {
        const gp = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(g => g?.connected);
        if (!gp) return;
        gp.buttons.forEach((btn, i) => {
            if ((btn.pressed || btn.value > 0.5) && listeningFor) {
                // Remover cualquier mapeo previo de este botón
                Object.keys(gpMap).forEach(k => { if (gpMap[k] === listeningFor) delete gpMap[k]; });
                // Asignar el nuevo
                gpMap[i] = listeningFor;
                saveGPMap();
                cancelListen();
                renderGPMap();
            }
        });
    }, 50);
}

function cancelListen() {
    if (listenInterval) { clearInterval(listenInterval); listenInterval = null; }
    listeningFor = null;
    renderGPMap();
}

// Botón Reset
document.getElementById('btnGPReset')?.addEventListener('click', () => {
    gpMap = { ...DEFAULT_GP_MAP };
    saveGPMap();
    renderGPMap();
});

// ════════════════════════════════════════════
//  INICIO
// ════════════════════════════════════════════
(function init() {
    drawSplash();
    if (typeof embedGenesis === 'undefined') {
        setStatus('⚠ Missing js/Genesis.min.js — see README', 'err');
        showError('Genesis.min.js not found in js/ folder.', '→ Download: https://github.com/lrusso/Genesis/raw/main/Genesis.min.js');
    }
    enableButtons(false, false, false);
})();
