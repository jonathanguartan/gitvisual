'use strict';
const { autoUpdater } = require('electron-updater');
const { dialog, app }  = require('electron');

// No descargar automáticamente — preguntar primero al usuario
autoUpdater.autoDownload        = false;
// Si el usuario elige "Al próximo cierre", instalar al salir
autoUpdater.autoInstallOnAppQuit = true;
// Suprimir logs verbosos de electron-updater en consola
autoUpdater.logger = null;

let _getMainWindow = null;  // () => BrowserWindow | null
let _onUpdateReady = null;  // (version: string) => void  — reconstruye el menú del tray
let _isManualCheck = false;
let _newVersion    = null;

// ─── Inicialización ───────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {() => import('electron').BrowserWindow | null} opts.getMainWindow
 * @param {(version: string) => void} opts.onUpdateReady
 */
function init({ getMainWindow, onUpdateReady }) {
  _getMainWindow = getMainWindow;
  _onUpdateReady = onUpdateReady;

  _registerListeners();

  // Check automático 10 s después del arranque para no competir con Express
  setTimeout(() => checkForUpdates(false), 10_000);
}

// ─── Listeners ────────────────────────────────────────────────────────────────

function _registerListeners() {
  // Nueva versión detectada en GitHub Releases
  autoUpdater.on('update-available', (info) => {
    _newVersion = info.version;
    const win = _getMainWindow?.();
    dialog.showMessageBox(win ?? null, {
      type:      'info',
      title:     'Actualización disponible',
      message:   `Nueva versión disponible: v${info.version}`,
      detail:    'La descarga se realizará en segundo plano.\nLa instalación se aplicará al reiniciar.',
      buttons:   ['Descargar ahora', 'Recordar después'],
      defaultId: 0,
      cancelId:  1,
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.downloadUpdate();
        _getMainWindow?.()?.setProgressBar(0);
      }
    });
  });

  // Ya estamos en la última versión
  autoUpdater.on('update-not-available', () => {
    if (_isManualCheck) {
      _isManualCheck = false;
      const win = _getMainWindow?.();
      dialog.showMessageBox(win ?? null, {
        type:    'info',
        title:   'Sin actualizaciones',
        message: 'Ya tienes la última versión instalada.',
        buttons: ['OK'],
      });
    }
  });

  // Progreso de descarga: barra de progreso en la taskbar de Windows
  autoUpdater.on('download-progress', ({ percent }) => {
    _getMainWindow?.()?.setProgressBar(percent / 100);
  });

  // Descarga completa: ofrecer reinicio inmediato o diferido
  autoUpdater.on('update-downloaded', (info) => {
    _newVersion = info.version;
    const win = _getMainWindow?.();
    win?.setProgressBar(-1);           // limpiar barra de progreso
    _onUpdateReady?.(_newVersion);     // reconstruir menú del tray

    dialog.showMessageBox(win ?? null, {
      type:      'info',
      title:     'Actualización lista para instalar',
      message:   `Git Visual Manager v${info.version} está listo.`,
      detail:    'Reinicia la aplicación para aplicar la actualización.',
      buttons:   ['Reiniciar ahora', 'Al próximo cierre'],
      defaultId: 0,
      cancelId:  1,
    }).then(({ response }) => {
      if (response === 0) {
        app.isQuiting = true;
        // isSilent=false → muestra el instalador; isForceRunAfter=true → reabre la app
        autoUpdater.quitAndInstall(false, true);
      }
    });
  });

  // Error de red u otro: solo loguear, nunca molestar al usuario
  autoUpdater.on('error', (err) => {
    console.error('[updater]', err.message);
    _getMainWindow?.()?.setProgressBar(-1);
    _isManualCheck = false;
  });
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Comprueba si hay actualizaciones.
 * @param {boolean} isManual  true → muestra dialog si no hay novedad
 */
function checkForUpdates(isManual = false) {
  // Las builds portable no soportan auto-update (limitación de electron-updater)
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    if (isManual) {
      dialog.showMessageBox(_getMainWindow?.() ?? null, {
        type:    'info',
        title:   'Versión portable',
        message: 'La versión portable no soporta auto-actualización.',
        detail:  'Descarga la última versión manualmente desde GitHub Releases.',
        buttons: ['OK'],
      });
    }
    return;
  }

  // En desarrollo no hay servidor de updates
  if (!app.isPackaged) {
    if (isManual) {
      dialog.showMessageBox(_getMainWindow?.() ?? null, {
        type:    'info',
        title:   'Modo desarrollo',
        message: 'Las actualizaciones solo están disponibles en la versión instalada.',
        buttons: ['OK'],
      });
    }
    return;
  }

  _isManualCheck = isManual;
  autoUpdater.checkForUpdates().catch(err => {
    console.error('[updater] checkForUpdates:', err.message);
    _isManualCheck = false;
  });
}

/** Versión descargada y lista para instalar, o null. */
function getReadyVersion() {
  return _newVersion;
}

/** Llamar desde el tray cuando el usuario elige "Reiniciar para actualizar". */
function quitAndInstall() {
  app.isQuiting = true;
  autoUpdater.quitAndInstall(false, true);
}

module.exports = { init, checkForUpdates, getReadyVersion, quitAndInstall };
