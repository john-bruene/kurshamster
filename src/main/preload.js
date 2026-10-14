'use strict';
// Schmale, sichere Brücke zwischen Oberfläche und Hauptprozess.
const { contextBridge, ipcRenderer } = require('electron');

const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);
const listen = (channel) => (cb) => {
  const h = (_e, p) => cb(p);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
};

contextBridge.exposeInMainWorld('studip', {
  version: call('version'),
  settings: call('settings'),
  setLanguage: call('set-language'),
  login: call('login'),
  logout: call('logout'),
  scan: call('scan'),
  start: call('start'),
  cancel: call('cancel'),
  defaultFolder: call('default-folder'),
  chooseFolder: call('choose-folder'),
  openFolder: call('open-folder'),
  openFile: call('open-file'),
  openLink: call('open-link'),
  checkUpdates: call('check-updates'),
  updateAction: call('update-action'),
  onProgress: listen('progress'),
  onUpdate: listen('update'),
});
