'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('miflix', {
  /** Llama a una operación del proceso principal. Lanza Error (con .code) si falla. */
  call: async (name, ...args) => {
    const r = await ipcRenderer.invoke('miflix:call', name, args);
    if (!r.ok) {
      const e = new Error(r.error.message);
      e.code = r.error.code;
      throw e;
    }
    return r.data;
  },
  /** Suscripción a eventos del proceso principal. Devuelve una función para cancelar. */
  on: (event, cb) => {
    const h = (_e, name, payload) => {
      if (name === event) cb(payload);
    };
    ipcRenderer.on('miflix:event', h);
    return () => ipcRenderer.removeListener('miflix:event', h);
  },
});
