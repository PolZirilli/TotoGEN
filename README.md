# TotoGEN — Emulador Sega Mega Drive / Genesis

Engine: **Genesis.js** (PicoDrive transpiled to pure JavaScript — no WebAssembly, no external CDN)

## ⚡ Required before use

Download `Genesis.min.js` and place it in the `js/` folder:

👉 https://github.com/lrusso/Genesis/raw/main/Genesis.min.js

```
TotoGEN/
├── index.html
├── css/styles.css
├── js/
│   ├── Genesis.min.js   ← download manually
│   └── app.js
├── py/servidor.py
└── README.md
```

## Usage

Open `index.html` directly (works from `file://`) or via local server:
```bash
python3 py/servidor.py
```

## ROM formats

`.md` · `.bin` · `.gen` · `.smd` · `.32x`

## Controls

See the **Ver Controles** button inside the app.

## Engine

**Genesis.js** by lrusso — PicoDrive transpiled to pre-ES2015 JavaScript.
- Repo: https://github.com/lrusso/Genesis
