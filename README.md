# RetroGEN V2 — Emulador Sega Mega Drive / Genesis

Motor: **Genesis.js** (PicoDrive transpilado a JS puro — sin WebAssembly, sin CDN externo)

---

## ⚡ PASO OBLIGATORIO ANTES DE USAR

Genesis.min.js es el motor de emulación. Por su tamaño no va incluido en el ZIP.
**Tenés que descargarlo una sola vez y colocarlo en la carpeta `js/`:**

```
👉 https://github.com/lrusso/Genesis/raw/main/Genesis.min.js
```

Guardalo como `js/Genesis.min.js` dentro de la carpeta RetroGEN.

Estructura final:
```
RetroGEN/
├── index.html
├── css/styles.css
├── js/
│   ├── Genesis.min.js   ← descargarlo manualmente
│   └── app.js
├── py/servidor.py
└── README.md
```

---

## Uso

Una vez que tenés `Genesis.min.js` en su lugar, podés abrir `index.html` directamente con doble-click — **funciona desde `file://` sin servidor**.

Si preferís servidor local:
```bash
python3 py/servidor.py
```
Abrí `http://localhost:8080`.

---

## Formatos de ROM

`.md` · `.bin` · `.gen` · `.smd` · `.32x`

---

## Controles

### Teclado

| Acción | Tecla | | Acción | Tecla |
|--------|-------|-|--------|-------|
| D-pad  | ↑↓←→  | | Start  | Enter |
| Botón A | A    | | Botón B | S    |
| Botón C | D    | | Botón X | Q    |
| Botón Y | W    | | Botón Z | E    |
| Mode    | Z    | | | |

### Atajos internos de Genesis.js

| Acción | Mac | Windows |
|--------|-----|---------|
| Guardar estado | Cmd+1 | Ctrl+1 |
| Cargar estado  | Cmd+2 | Ctrl+2 |
| Silenciar      | Cmd+3 | Ctrl+3 |
| Pantalla completa | Cmd+F | Ctrl+F |
| Reset          | Cmd+R | Ctrl+R |

---

## Historial de versiones

| Versión | Fecha      | Cambios |
|---------|------------|---------|
| v1.0–v1.4 | 2026-03-27 | Intentos con EmulatorJS — canvas 0×0, incompatibilidades. |
| v2.0    | 2026-03-27 | Cambio de motor a Genesis.js (PicoDrive JS puro). Sin WASM, sin CDN, sin iframes. Funciona en file:// y servidor. |

---

## Motor

**Genesis.js** por lrusso — PicoDrive transpilado a JavaScript pre-ES2015.
- Repo: https://github.com/lrusso/Genesis
- Soporta ROMs de Sega Genesis, Mega Drive y 32X
