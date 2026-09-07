// Local-folder storage — saves the same backup JSON file directly into a
// folder on this computer, using the File System Access API. No server, no
// account, nothing leaves the device. Only supported in Chromium browsers
// (Chrome, Edge) — there's no equivalent API in Firefox or Safari yet.
const LocalStore = (() => {
  const DB_NAME = 'farmFleetExpensesLocal';
  const STORE_NAME = 'handles';
  const HANDLE_KEY = 'backupFolder';
  const FILE_NAME = 'farm-fleet-expenses-backup.json';

  function supported() {
    return typeof window.showDirectoryPicker === 'function';
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE_NAME); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveHandle(handle) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function loadHandle() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function clearHandle() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // Lets the browser re-verify a previously-picked folder without asking the
  // user to pick it again. `requestIfNeeded` (only safe to pass true from
  // inside a real click handler — permission prompts require a user gesture)
  // upgrades a lapsed grant back to 'granted'; otherwise this just reports
  // whether it's already usable.
  async function ensurePermission(handle, requestIfNeeded) {
    const opts = { mode: 'readwrite' };
    const status = await handle.queryPermission(opts);
    if (status === 'granted') return true;
    if (!requestIfNeeded) return false;
    const req = await handle.requestPermission(opts);
    return req === 'granted';
  }

  async function getActiveHandle(requestIfNeeded) {
    const handle = await loadHandle();
    if (!handle) return null;
    const ok = await ensurePermission(handle, requestIfNeeded);
    if (!ok) throw new Error('PERMISSION_NEEDED');
    return handle;
  }

  // Opens the OS folder picker (must be called from a user gesture). Returns
  // the chosen folder's name once it's saved for reuse on later visits.
  async function pickFolder() {
    if (!supported()) throw new Error('This browser can’t pick a local folder — try Chrome or Edge on a computer.');
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await saveHandle(handle);
    return handle.name;
  }

  // The name of whatever folder is already saved, without touching
  // permissions — used to show "Folder: X" right after a reload.
  async function currentFolderName() {
    const handle = await loadHandle();
    return handle ? handle.name : '';
  }

  // Resolves to {name, modifiedTime} if the backup file exists, {name,
  // missing:true} if the folder's connected but empty (first use), or null
  // if no folder is connected at all. Throws PERMISSION_NEEDED if the
  // browser needs an explicit reconnect click first.
  async function checkBackup(requestIfNeeded) {
    const handle = await getActiveHandle(requestIfNeeded);
    if (!handle) return null;
    try {
      const fileHandle = await handle.getFileHandle(FILE_NAME);
      const file = await fileHandle.getFile();
      return { name: handle.name, modifiedTime: new Date(file.lastModified).toISOString() };
    } catch (e) {
      if (e.name === 'NotFoundError') return { name: handle.name, missing: true };
      throw e;
    }
  }

  async function restore(requestIfNeeded) {
    const handle = await getActiveHandle(requestIfNeeded);
    if (!handle) throw new Error('No folder connected.');
    const fileHandle = await handle.getFileHandle(FILE_NAME);
    const file = await fileHandle.getFile();
    return JSON.parse(await file.text());
  }

  async function backup(payload, requestIfNeeded) {
    const handle = await getActiveHandle(requestIfNeeded);
    if (!handle) throw new Error('No folder connected.');
    const fileHandle = await handle.getFileHandle(FILE_NAME, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(payload, null, 2));
    await writable.close();
    return handle.name;
  }

  async function forget() {
    await clearHandle();
  }

  return { supported, pickFolder, currentFolderName, checkBackup, restore, backup, forget };
})();
