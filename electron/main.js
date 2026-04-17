const { app, BrowserWindow, Tray, Menu, shell, nativeImage, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');
const zlib = require('zlib');

// Iniciar el servidor Express antes de crear ventanas
const server = require('../server');

let mainWindow   = null;
let splashWindow = null;
let tray         = null;

// ─── Generador de icono PNG ────────────────────────────────────────────────────
// Crea un PNG sólido mínimo válido sin dependencias externas.
// Reemplaza colocando tus propios archivos en electron/icons/icon16.png, icon32.png, icon256.png

function buildPNG(size, r, g, b) {
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })();

  const crc32 = buf => {
    let c = 0xFFFFFFFF;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };

  const chunk = (type, data) => {
    const t = Buffer.from(type, 'ascii');
    const l = Buffer.alloc(4); l.writeUInt32BE(data.length);
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([l, t, data, crcBuf]);
  };

  // Una fila: byte de filtro (0) + pixels RGB
  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x++) {
    row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b;
  }
  const raw = Buffer.concat(Array.from({ length: size }, () => row));

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function getIcon(size = 32) {
  const custom = path.join(__dirname, 'icons', `icon${size}.png`);
  if (fs.existsSync(custom)) return nativeImage.createFromPath(custom);
  // Icono generado: azul del tema (#89b4fa)
  return nativeImage.createFromBuffer(buildPNG(size, 137, 180, 250));
}

// ─── Splash Screen ─────────────────────────────────────────────────────────────

function createSplash() {
  splashWindow = new BrowserWindow({
    width:       380,
    height:      220,
    frame:       false,
    resizable:   false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
}

function closeSplash() {
  if (splashWindow) { splashWindow.close(); splashWindow = null; }
}

// ─── Ventana Principal ─────────────────────────────────────────────────────────

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width:     1400,
    height:    900,
    minWidth:  900,
    minHeight: 600,
    show:      false,
    icon:      getIcon(256),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: 'Git Visual Manager',
  });

  mainWindow.setMenu(null);
  mainWindow.loadURL(`http://localhost:${port}`);

  mainWindow.once('ready-to-show', () => {
    closeSplash();
    mainWindow.show();
    mainWindow.focus();
  });

  // Notifica al renderer cuando el BrowserWindow recupera el foco del SO,
  // para que pueda refrescar la lista de archivos sin depender de window.focus
  // del renderer (que no es confiable para cambios de foco a nivel de SO en Electron).
  mainWindow.on('focus', () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents
        .executeJavaScript('window.dispatchEvent(new CustomEvent("electronWindowFocus"))')
        .catch(() => {});
    }
  });

  // Links externos se abren en el browser del sistema.
  // will-navigate evita el crash de Chromium "origin.IsValid()" que ocurre
  // cuando setWindowOpenHandler devuelve deny y Chromium intenta validar el origen.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`http://localhost:${port}`)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Menú contextual con autocorrección solo en inputs y textareas
  mainWindow.webContents.on('context-menu', (_, params) => {
    if (!params.isEditable) return;
    const items = [];
    if (params.misspelledWord) {
      for (const suggestion of params.dictionarySuggestions.slice(0, 6)) {
        items.push({ label: suggestion, click: () => mainWindow.webContents.replaceMisspelling(suggestion) });
      }
      items.push({ type: 'separator' });
      items.push({ label: `Añadir "${params.misspelledWord}" al diccionario`, click: () => mainWindow.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord) });
      items.push({ type: 'separator' });
    }
    items.push(
      { role: 'undo',  label: 'Deshacer' },
      { role: 'redo',  label: 'Rehacer' },
      { type: 'separator' },
      { role: 'cut',   label: 'Cortar' },
      { role: 'copy',  label: 'Copiar' },
      { role: 'paste', label: 'Pegar' },
      { role: 'selectAll', label: 'Seleccionar todo' },
    );
    Menu.buildFromTemplate(items).popup({ window: mainWindow });
  });

  // "Cerrar" oculta al tray en lugar de salir
  mainWindow.on('close', e => {
    if (!app.isQuiting) {
      e.preventDefault();
      mainWindow.hide();
      tray?.displayBalloon?.({
        title:   'Git Visual Manager',
        content: 'La app sigue corriendo en la bandeja del sistema',
        iconType: 'info',
      });
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── System Tray ───────────────────────────────────────────────────────────────

function createTray(port) {
  tray = new Tray(getIcon(16));
  tray.setToolTip('Git Visual Manager');

  const showApp = () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow(port);
    }
  };

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir Git Visual Manager', click: showApp },
    { type: 'separator' },
    {
      label: 'Salir',
      click: () => { app.isQuiting = true; app.quit(); },
    },
  ]));

  // Doble clic en el icono del tray → mostrar ventana
  tray.on('double-click', showApp);
}

// ─── Ciclo de vida de la app ───────────────────────────────────────────────────

app.whenReady().then(() => {
  // Mostrar splash inmediatamente
  createSplash();

  const onReady = () => {
    const port = server.address().port;
    createTray(port);
    createWindow(port);
  };

  const onError = (err) => {
    closeSplash();
    dialog.showErrorBox(
      'Error al iniciar el servidor',
      err.code === 'EADDRINUSE'
        ? `El puerto ${process.env.PORT || 3333} ya está en uso.\n\nCierra la otra instancia e intenta de nuevo.`
        : err.message
    );
    app.quit();
  };

  if (server.listening) {
    onReady();
  } else {
    server.once('listening', onReady);
    server.once('error', onError);
  }
});

// La app vive en el tray — no cerramos al cerrar todas las ventanas
app.on('window-all-closed', () => { /* intencional: se cierra solo desde el tray */ });

app.on('activate', () => {
  // macOS: re-crear ventana si se hace clic en el dock
  if (!mainWindow && server.listening) createWindow(server.address().port);
});
