// ════════════════════════════════════════════
//  TotoGEN — Emulador Sega Mega Drive / Genesis
//  Motor: Genesis.js via iframe sandboxed
//  El iframe aísla completamente el proceso del emulador.
//  Al destruirlo, el browser mata timers, audio y loops sin excepción.
// ════════════════════════════════════════════

// ══ REFS UI ══
const splash     = document.getElementById('splashCanvas');
const screenWrap = document.getElementById('screenWrap');
const loaderOvrl = document.getElementById('loaderOverlay');
const ledEl      = document.getElementById('led');
const statusEl   = document.getElementById('statusText');
const fpsEl      = document.getElementById('fpsCounter');
const romNameEl  = document.getElementById('romName');
const errorBox   = document.getElementById('errorBox');

// ══ ESTADO ══
let emuFrame    = null;   // el <iframe> activo
let emuRunning  = false;
let paused      = false;
let lastROMName = '';
let fpsInterval = null;
let fpsFrames   = 0;
let fpsLast     = performance.now();

const TARGET_FPS     = 60;
const FRAME_DURATION = 1000 / TARGET_FPS;
const DEAD           = 0.45;

// ════════════════════════════════════════════
//  GAMEPAD MAPPING
// ════════════════════════════════════════════
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

const DEFAULT_GP_MAP = {
    0:'b', 1:'a', 2:'x', 3:'y', 4:'c', 5:'z',
    8:'mode', 9:'start',
    12:'up', 13:'down', 14:'left', 15:'right',
};

let gpMap = loadGPMap();
function loadGPMap() {
    try { const s = localStorage.getItem('totogen_gpmap'); if (s) return JSON.parse(s); } catch(_) {}
    return { ...DEFAULT_GP_MAP };
}
function saveGPMap() {
    try { localStorage.setItem('totogen_gpmap', JSON.stringify(gpMap)); } catch(_) {}
}

// ════════════════════════════════════════════
//  PREVENIR SCROLL CON FLECHAS
// ════════════════════════════════════════════
window.addEventListener('keydown', e => {
    if (!emuRunning) return;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
}, { passive: false });

// ════════════════════════════════════════════
//  SPLASH
// ════════════════════════════════════════════
function drawSplash() {
    const ctx = splash.getContext('2d');
    const w = splash.width, h = splash.height;
    const g = ctx.createLinearGradient(0,0,w,h);
    g.addColorStop(0,'#000d22'); g.addColorStop(1,'#001a44');
    ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle = 'rgba(0,102,255,0.10)'; ctx.lineWidth = 1;
    for (let y=0; y<h; y+=16) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
    for (let x=0; x<w; x+=32) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
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
            fpsEl.textContent = Math.min(Math.round((fpsFrames/delta)*1000),60) + ' FPS';
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
//  GAMEPAD → reenviar eventos al iframe
// ════════════════════════════════════════════
let gpPrev = {}, gpAxesPrev = { up:false, down:false, left:false, right:false };

function actionToKey(id) { return ACTIONS.find(a => a.id === id)?.key || null; }

// En lugar de disparar keydown en document, los enviamos al iframe via postMessage
function fireKey(code, down) {
    if (emuFrame?.contentWindow) {
        emuFrame.contentWindow.postMessage({ type: down ? 'keydown' : 'keyup', code }, '*');
    }
}

function pollGamepad() {
    if (!emuRunning || paused) return;
    const gp = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(g => g?.connected);
    if (!gp) return;

    gp.buttons.forEach((btn, i) => {
        const pressed = btn.pressed || btn.value > 0.5;
        const code = actionToKey(gpMap[i]);
        if (!code) return;
        if ( pressed && !gpPrev[i]) fireKey(code, true);
        if (!pressed &&  gpPrev[i]) fireKey(code, false);
        gpPrev[i] = pressed;
    });

    const ax = gp.axes[0]||0, ay = gp.axes[1]||0;
    const axL=ax<-DEAD, axR=ax>DEAD, axU=ay<-DEAD, axD=ay>DEAD;
    [[axL,gpAxesPrev.left,'left'],[axR,gpAxesPrev.right,'right'],
     [axU,gpAxesPrev.up,'up'],[axD,gpAxesPrev.down,'down']].forEach(([c,p,aid]) => {
        const code = actionToKey(aid);
        if (!code) return;
        if ( c && !p) fireKey(code, true);
        if (!c &&  p) fireKey(code, false);
    });
    gpAxesPrev = { left:axL, right:axR, up:axU, down:axD };
}

let gpPollInterval = null;
function startGPPoll() { stopGPPoll(); gpPollInterval = setInterval(pollGamepad, FRAME_DURATION); }
function stopGPPoll()  {
    if (gpPollInterval) { clearInterval(gpPollInterval); gpPollInterval = null; }
    gpPrev = {}; gpAxesPrev = { up:false, down:false, left:false, right:false };
}

window.addEventListener('gamepadconnected', e => {
    const el = document.getElementById('gamepadStatus');
    el.textContent = '🎮 Connected: ' + e.gamepad.id.substring(0,55);
    el.classList.add('connected');
    renderGPMap();
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
['fullscreenchange','webkitfullscreenchange','mozfullscreenchange'].forEach(ev =>
    document.addEventListener(ev, updateFullscreenBtn));

function toggleFullscreen() {
    const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (!isFS) {
        const req = screenWrap.requestFullscreen || screenWrap.webkitRequestFullscreen;
        if (req) req.call(screenWrap);
    } else {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) exit.call(document);
    }
}
function updateFullscreenBtn() {
    const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
    btnFullscreen.textContent = isFS ? '✕' : '⛶';
    btnFullscreen.title = isFS ? 'Exit Fullscreen' : 'Fullscreen';
}

// ════════════════════════════════════════════
//  IFRAME RUNNER
//  El iframe contiene todo el HTML necesario para correr Genesis.js.
//  Al destruirlo, el browser mata TODO lo que corría adentro.
// ════════════════════════════════════════════

function buildIframeHTML(romBase64, romName, player1Keys) {
    // Construimos el HTML que correrá dentro del iframe.
    // Recibe la ROM como base64, la decodifica y llama a embedGenesis.
    // Escucha postMessage del padre para reenviar teclas del gamepad.
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:100%; height:100%; background:#000; overflow:hidden; }
  #game { width:100%; height:100%; }
  #game canvas { width:100% !important; height:100% !important;
    image-rendering:pixelated; image-rendering:crisp-edges; }
</style>
</head>
<body>
<div id="game"></div>
<script src="../js/Genesis.min.js"><\/script>
<script>
// Escuchar teclas del gamepad enviadas por el padre via postMessage
window.addEventListener('message', function(e) {
  if (!e.data || !e.data.type) return;
  var evt = new KeyboardEvent(e.data.type, {
    code: e.data.code, key: e.data.code, bubbles: true, cancelable: true
  });
  document.dispatchEvent(evt);
});

// Decodificar ROM base64
function b64ToBuffer(b64) {
  var bin = atob(b64);
  var buf = new Uint8Array(bin.length);
  for (var i=0; i<bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

var romBuffer = b64ToBuffer(${JSON.stringify(romBase64)});

embedGenesis({
  container: 'game',
  name: ${JSON.stringify(romName)},
  rom: romBuffer,
  soundEnabled: true,
  showMobileControls: false,
  player1: ${JSON.stringify(player1Keys)},
  cbStarted: function() {
    // Avisar al padre que arrancó
    window.parent.postMessage({ type: 'started' }, '*');
  }
});
<\/script>
</body>
</html>`;
}

// ════════════════════════════════════════════
//  MONTAR / DESMONTAR
// ════════════════════════════════════════════
function mountEmulator(romBuffer, romName) {
    hideError();
    unmountEmulator(true);
    lastROMName = romName;
    showLoader('LOADING ROM...');
    splash.style.display = 'none';

    // Convertir ArrayBuffer a base64
    const bytes  = new Uint8Array(romBuffer);
    let binary   = '';
    const chunk  = 8192;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    const romBase64 = btoa(binary);

    // Construir mapeo de teclas para el iframe (usamos los keys del teclado)
    const player1Keys = {};
    ACTIONS.forEach(a => { player1Keys[a.id] = a.key; });

    // Crear iframe con el HTML del emulador como blob URL
    const html  = buildIframeHTML(romBase64, romName, player1Keys);
    const blob  = new Blob([html], { type: 'text/html' });
    const blobURL = URL.createObjectURL(blob);

    emuFrame = document.createElement('iframe');
    emuFrame.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:none;background:#000;';
    emuFrame.src = blobURL;

    // Escuchar mensaje de "started" desde el iframe
    function onMessage(e) {
        if (e.source !== emuFrame?.contentWindow) return;
        if (e.data?.type === 'started') {
            window.removeEventListener('message', onMessage);
            URL.revokeObjectURL(blobURL);
            hideLoader();
            emuRunning = true;
            paused     = false;
            romNameEl.textContent = '▸ ' + romName;
            setStatus('Playing: ' + romName, 'on');
            enableButtons(false, true, true);
            startFPS();
            startGPPoll();
        }
    }
    window.addEventListener('message', onMessage);

    screenWrap.appendChild(emuFrame);
}

function unmountEmulator(silent) {
    stopFPS();
    stopGPPoll();
    emuRunning = false;
    paused     = false;

    // Destruir el iframe — el browser mata TODO lo que corría adentro
    if (emuFrame) {
        // Navegar a about:blank primero para forzar descarga del contexto
        try { emuFrame.src = 'about:blank'; } catch(_) {}
        emuFrame.remove();
        emuFrame = null;
    }

    if (!silent) {
        const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
        if (isFS) {
            const exit = document.exitFullscreen || document.webkitExitFullscreen;
            if (exit) exit.call(document);
        }
        splash.style.display = 'block';
        romNameEl.textContent = '';
        lastROMName = '';
        setStatus('', null);
        enableButtons(false, false, false);
        hideLoader();
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

document.getElementById('romInput').addEventListener('change', e => {
    handleROMFile(e.target.files[0]); e.target.value = '';
});
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
        .then(r => { if (!r.ok) throw new Error('HTTP '+r.status); return r.arrayBuffer(); })
        .then(buf => mountEmulator(buf, url.split('/').pop()))
        .catch(err => { showError('Could not load preset ROM.', err.message); setStatus('Load error','err'); });
});

// ════════════════════════════════════════════
//  BOTONES
// ════════════════════════════════════════════
document.getElementById('btnPause').onclick = () => {
    if (!emuRunning || paused) return;
    paused = true; stopFPS(); stopGPPoll();
    ledEl.className = 'led';
    setStatus('Paused — press ▶ PLAY to continue', null);
    document.getElementById('btnPause').textContent = '⏸ PAUSED';
    enableButtons(true, false, true);
    // Enviar Escape al iframe para pausar Genesis.js internamente
    if (emuFrame?.contentWindow) emuFrame.contentWindow.postMessage({ type:'keydown', code:'Escape' }, '*');
};

document.getElementById('btnPlay').onclick = () => {
    if (!emuRunning || !paused) return;
    paused = false;
    setStatus('Playing: ' + lastROMName, 'on');
    document.getElementById('btnPause').textContent = '⏸ PAUSE';
    enableButtons(false, true, true); startFPS(); startGPPoll();
    if (emuFrame?.contentWindow) emuFrame.contentWindow.postMessage({ type:'keydown', code:'Escape' }, '*');
};

document.getElementById('btnStop').onclick = () => location.reload();

// ════════════════════════════════════════════
//  POPUP DE CONTROLES
// ════════════════════════════════════════════
const overlay  = document.getElementById('controlsOverlay');
const btnOpen  = document.getElementById('btnControls');
const btnClose = document.getElementById('btnControlsClose');

btnOpen.addEventListener('click', () => {
    overlay.classList.add('open'); overlay.setAttribute('aria-hidden','false'); renderGPMap();
});
btnClose.addEventListener('click', closeControls);
overlay.addEventListener('click', e => { if (e.target===overlay) closeControls(); });
document.addEventListener('keydown', e => {
    if (e.key==='Escape') { if (listeningFor) { cancelListen(); return; } if (overlay.classList.contains('open')) closeControls(); }
});
function closeControls() {
    if (listeningFor) cancelListen();
    overlay.classList.remove('open'); overlay.setAttribute('aria-hidden','true');
}

document.querySelectorAll('.ctrl-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.ctrl-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.ctrl-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.panel).classList.add('active');
    });
});

// ── Gamepad mapper ──
let listeningFor = null, listenInterval = null;

function renderGPMap() {
    const gp = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(g => g?.connected);
    const gpNameEl = document.getElementById('gpName');
    if (gpNameEl) gpNameEl.textContent = gp ? gp.id.substring(0,60) : 'No gamepad connected';
    const list = document.getElementById('gpMapList');
    if (!list) return;
    list.innerHTML = '';
    ACTIONS.forEach(action => {
        const btnIndex = Object.keys(gpMap).find(k => gpMap[k] === action.id);
        const row = document.createElement('div');
        row.className = 'gpmap-row'; row.id = 'gprow-' + action.id;
        row.innerHTML = `
            <span class="gpmap-action">${action.label}</span>
            <span class="gpmap-btn" id="gpbtn-${action.id}">${btnIndex !== undefined ? 'Button '+btnIndex : '—'}</span>
            <button class="gpmap-set" data-action="${action.id}">Set</button>`;
        list.appendChild(row);
    });
    list.querySelectorAll('.gpmap-set').forEach(btn => btn.addEventListener('click', () => startListen(btn.dataset.action)));
}

function startListen(actionId) {
    if (listeningFor) cancelListen();
    listeningFor = actionId;
    const row = document.getElementById('gprow-'+actionId);
    const btnEl = document.getElementById('gpbtn-'+actionId);
    const setBtn = row.querySelector('.gpmap-set');
    row.classList.add('gpmap-listening');
    btnEl.textContent  = 'Press button...';
    setBtn.textContent = 'Cancel';
    setBtn.onclick     = cancelListen;
    listenInterval = setInterval(() => {
        const gp = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(g => g?.connected);
        if (!gp) return;
        gp.buttons.forEach((btn, i) => {
            if ((btn.pressed || btn.value > 0.5) && listeningFor) {
                Object.keys(gpMap).forEach(k => { if (gpMap[k] === listeningFor) delete gpMap[k]; });
                gpMap[i] = listeningFor;
                saveGPMap(); cancelListen(); renderGPMap();
            }
        });
    }, 50);
}

function cancelListen() {
    if (listenInterval) { clearInterval(listenInterval); listenInterval = null; }
    listeningFor = null; renderGPMap();
}

document.getElementById('btnGPReset')?.addEventListener('click', () => {
    gpMap = { ...DEFAULT_GP_MAP }; saveGPMap(); renderGPMap();
});

// ════════════════════════════════════════════
//  INICIO
// ════════════════════════════════════════════
(function init() {
    drawSplash();
    enableButtons(false, false, false);
})();
