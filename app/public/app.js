(function () {
  'use strict';

  const $app = document.getElementById('app');

  const blankStandaloneRow = () => ({ part: '', qty: '1', unitCost: '', totalCost: '', vendor: '', date: todayIso(), equipment: '' });
  const blankManualForm = () => ({ part: '', qty: '1', unitCost: '', totalCost: '', vendor: '', date: todayIso() });
  const COLOR_SWATCHES = ['oklch(60% 0.19 0)', 'oklch(60% 0.19 29)', 'oklch(60% 0.19 55)', 'oklch(60% 0.19 80)', 'oklch(60% 0.19 110)', 'oklch(60% 0.19 140)', 'oklch(60% 0.19 165)', 'oklch(60% 0.19 200)', 'oklch(60% 0.19 230)', 'oklch(60% 0.19 260)', 'oklch(60% 0.19 290)', 'oklch(60% 0.19 320)', 'oklch(60% 0.19 345)', 'oklch(45% 0.03 0)'];

  let state = {
    categories: [], suppliers: [], equipment: [], invoices: [],
    loading: true, loadError: '',

    view: 'dashboard',
    dashboardYear: new Date().getFullYear(),
    pieTip: null,

    addExpenseMode: 'upload',
    allExpSearch: '', allExpSort: 'newest',
    standaloneRows: [blankStandaloneRow()],
    pendingInvoice: null,

    selectedCategory: null,
    equipmentSearch: '', equipmentListMode: 'categories',
    manageOpenFor: null,
    manualFormOpenFor: null, manualForm: null,
    confirmDeleteFor: null,

    detailEquipmentId: null,
    noteText: '', noteDate: '',
    hourCalcOpen: false,

    editModalOpenFor: null, editModalDraft: null,
    addModalOpen: false, addModalDraft: null,

    categoryEditModalOpenFor: null, categoryEditDraft: '', categoryEditColorDraft: '',
    categoryAddModalOpen: false, categoryAddDraft: null,

    supplierAddModalOpen: false, supplierAddDraft: '',
    confirmDeleteSupplierFor: null,
    supplierEditModalOpenFor: null, supplierEditDraft: '',

    settingsUnlocked: false, settingsPasswordModalOpen: false, settingsPasswordInput: '', settingsPasswordError: false,
    settingsPassword: '1234', changePasswordDraft: '',

    settingsTab: 'general',

    year: null,
    yearlySortMode: 'most', yearlyGroupMode: 'category', yearlySearch: '',

    analyticsMode: 'vendor', anYearA: null, anYearB: null, anSearch: '', anSort: 'biggestIncrease', anCrossVendor: '', anCrossEquipment: '',

    storageMode: 'none', // 'none' | 'drive' | 'local' — set in Settings → Storage
    storageChangeConfirming: false, // true while the locked mode picker is expanded for editing
    storageChangeAuthOpen: false, storageChangeAuthInput: '', storageChangeAuthError: false, storageChangeAuthPending: null,
    restoreConfirmOpen: false, // "download latest" confirm modal, triggered from the header

    openInfoId: null, // which (if any) info popover is currently open

    driveClientId: '', driveClientIdDraft: '', driveApiKey: '', driveApiKeyDraft: '',
    driveAppId: '', driveAppIdDraft: '',
    driveFileId: '', driveFolderId: '', driveFolderName: '', driveLastBackupAt: null,
    driveBusy: false, driveMessage: '', driveToast: '',

    localFolderName: '', localLastSavedAt: null, localBusy: false, localMessage: '',
    localNeedsReconnect: false, localFolderChangeConfirming: false,
  };

  // ---------------------------------------------------------------- data store
  // The app opens straight to the dashboard, empty, every time, then — if a
  // storage mode is configured in Settings → Storage — quietly loads the
  // real data from Google Drive or a local folder in the background,
  // populating the app once it arrives. Every change after that auto-saves
  // back to whichever storage is active every 15 seconds. Only the storage
  // mode + connection config (Drive Client ID, local folder handle, etc.)
  // live in this browser's localStorage/IndexedDB — never the actual
  // categories/equipment/invoices, so nothing is lost by switching storage.
  let nextId = 1;

  function resetData() {
    state.categories = [];
    state.equipment = [];
    state.suppliers = [];
    state.invoices = [];
    state.settingsPassword = '1234';
  }

  let dataDirty = false;

  function persistDB() {
    dataDirty = true;
  }

  // Replaces local data with a downloaded backup. Backups don't carry `nextId`,
  // so it's recomputed from the highest id actually present (equipment,
  // categories, suppliers, invoices, and their nested filters/services/notes/
  // line items all share the same id sequence).
  function applyRestoredData(data) {
    if (!data || typeof data !== 'object') throw new Error("That backup file doesn't look valid.");
    state.categories = Array.isArray(data.categories) ? data.categories : [];
    state.suppliers = Array.isArray(data.suppliers) ? data.suppliers : [];
    state.equipment = Array.isArray(data.equipment) ? data.equipment : [];
    state.invoices = Array.isArray(data.invoices) ? data.invoices : [];
    state.settingsPassword = typeof data.settingsPassword === 'string' && data.settingsPassword ? data.settingsPassword : '1234';
    let maxId = 0;
    const scan = (v) => { if (v && typeof v.id === 'number' && v.id > maxId) maxId = v.id; };
    state.categories.forEach(scan);
    state.suppliers.forEach(scan);
    state.equipment.forEach((e) => {
      scan(e);
      (e.filters || []).forEach(scan);
      (e.services || []).forEach(scan);
      (e.notes || []).forEach(scan);
    });
    state.invoices.forEach((inv) => {
      scan(inv);
      (inv.lineItems || []).forEach(scan);
    });
    nextId = maxId + 1;
    persistDB();
  }

  const STORAGE_MODE_KEY = 'farmFleetExpenses_storageMode_v1';

  function persistStorageMode() {
    try { localStorage.setItem(STORAGE_MODE_KEY, state.storageMode); } catch (e) { /* ignore */ }
  }

  function loadStorageMode() {
    let raw = null;
    try { raw = localStorage.getItem(STORAGE_MODE_KEY); } catch (e) { /* ignore */ }
    if (raw === 'drive' || raw === 'local') state.storageMode = raw;
  }

  const DRIVE_KEY = 'farmFleetExpenses_drive_v1';

  function persistDriveConfig() {
    try {
      localStorage.setItem(DRIVE_KEY, JSON.stringify({
        clientId: state.driveClientId,
        apiKey: state.driveApiKey,
        appId: state.driveAppId,
        fileId: state.driveFileId,
        folderId: state.driveFolderId,
        folderName: state.driveFolderName,
        lastBackupAt: state.driveLastBackupAt,
      }));
    } catch (e) { /* ignore */ }
  }

  function loadDriveConfig() {
    let raw = null;
    try { raw = localStorage.getItem(DRIVE_KEY); } catch (e) { /* ignore */ }
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      state.driveClientId = data.clientId || '';
      state.driveApiKey = data.apiKey || '';
      state.driveAppId = data.appId || '';
      state.driveFileId = data.fileId || '';
      state.driveFolderId = data.folderId || '';
      state.driveFolderName = data.folderName || '';
      state.driveLastBackupAt = data.lastBackupAt || null;
    } catch (e) { /* ignore */ }
  }

  // A saved backup folder can stop being reachable (deleted, moved, or picked
  // before the project number was set up — see the comment in drive.js).
  // Drive.* falls back to an unscoped search/create when that happens rather
  // than failing outright; this drops the stale folder from state so the app
  // stops retrying it, and leaves a note explaining why the folder changed.
  function handleStaleDriveFolder() {
    if (!Drive.consumeFolderIdInvalid()) return false;
    state.driveFolderId = '';
    state.driveFolderName = '';
    state.driveMessage = 'The Drive folder saved here isn’t reachable anymore, so this switched to "My Drive" root. Pick a new folder below if you’d like.';
    return true;
  }

  // Connects to Drive and decides what the app's data should be: whatever's
  // already saved there if a backup file exists, or the current in-memory
  // data (saved back to Drive right away, so the file exists from here on)
  // if this is the very first time this Drive account has been used with the
  // app. Called both from the background sync at startup (silent — no Google
  // popup) and from Settings when the Client ID is first saved (interactive).
  async function loadOrInitFromDrive(interactive) {
    const meta = await Drive.checkBackup(state.driveClientId, state.driveFolderId, interactive);
    handleStaleDriveFolder();
    if (meta && meta.id) {
      const data = await Drive.restore(state.driveClientId, meta.id, false);
      applyRestoredData(data);
      state.driveFileId = meta.id;
    } else {
      const payload = buildBackupPayload();
      state.driveFileId = await Drive.backup(state.driveClientId, '', payload, false, state.driveFolderId);
      handleStaleDriveFolder();
    }
    dataDirty = false;
    state.driveLastBackupAt = new Date().toISOString();
    persistDriveConfig();
  }

  // Same idea for a local folder: load what's there, or write the current
  // in-memory data as the folder's first backup. `requestIfNeeded` should
  // only be true when called from a real click (permission prompts require a
  // user gesture); a silent background attempt just uses whatever's already
  // granted, and sets `localNeedsReconnect` if it isn't.
  async function loadOrInitFromLocal(requestIfNeeded) {
    const meta = await LocalStore.checkBackup(requestIfNeeded);
    if (!meta) return; // no folder connected yet
    state.localFolderName = meta.name;
    if (!meta.missing) {
      const data = await LocalStore.restore(requestIfNeeded);
      applyRestoredData(data);
    } else {
      await LocalStore.backup(buildBackupPayload(), requestIfNeeded);
    }
    dataDirty = false;
    state.localLastSavedAt = new Date().toISOString();
    state.localNeedsReconnect = false;
  }

  async function performDriveRestore(fileId) {
    if (state.driveBusy || !state.driveClientId) return;
    state.driveBusy = true;
    state.driveMessage = '';
    render();
    try {
      if (!fileId) {
        const meta = await Drive.checkBackup(state.driveClientId, state.driveFolderId, false);
        handleStaleDriveFolder();
        if (!meta || !meta.id) {
          state.driveMessage = 'No backup found in Google Drive yet.';
          state.driveBusy = false;
          render();
          return;
        }
        fileId = meta.id;
      }
      const data = await Drive.restore(state.driveClientId, fileId, false);
      applyRestoredData(data);
      dataDirty = false;
      state.driveFileId = fileId;
      state.driveLastBackupAt = new Date().toISOString();
      state.driveMessage = 'Loaded the latest backup from Google Drive.';
      state.loadError = '';
      state.view = 'dashboard';
      state.selectedCategory = null;
      state.detailEquipmentId = null;
      persistDriveConfig();
      showDriveToast('Loaded from Google Drive.');
    } catch (err) {
      const msg = err.message === 'UNAUTHORIZED'
        ? 'Google Drive access expired or was denied — try again to reconnect.'
        : ('Restore failed: ' + err.message);
      state.driveMessage = msg;
      state.loadError = msg;
    }
    state.driveBusy = false;
    render();
  }

  const Store = {
    createCategory({ name, color }) {
      const trimmed = (name || '').trim();
      if (!trimmed) throw new Error('Name is required.');
      if (state.categories.some((c) => c.name === trimmed)) throw new Error('That category already exists.');
      state.categories.push({ id: nextId++, name: trimmed, color });
      persistDB();
    },
    updateCategory(id, { name, color }) {
      const trimmed = (name || '').trim();
      if (!trimmed) throw new Error('Name is required.');
      if (state.categories.some((c) => c.name === trimmed && c.id !== id)) throw new Error('That category already exists.');
      const cat = state.categories.find((c) => c.id === id);
      if (!cat) throw new Error('Not found.');
      const oldName = cat.name;
      cat.name = trimmed;
      cat.color = color;
      if (oldName !== trimmed) {
        // Equipment stores its category as a plain name, not an id -- a rename
        // has to cascade here or every piece of equipment under the old name
        // silently falls out of every category-based view (tile counts,
        // category browsing, yearly-by-category totals, etc).
        state.equipment.forEach((eq) => { if (eq.category === oldName) eq.category = trimmed; });
      }
      persistDB();
    },

    createSupplier(name) {
      const trimmed = (name || '').trim();
      if (!trimmed) throw new Error('Name is required.');
      if (state.suppliers.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) return;
      state.suppliers.push({ id: nextId++, name: trimmed });
      persistDB();
    },
    updateSupplier(id, name) {
      const trimmed = (name || '').trim();
      if (!trimmed) throw new Error('Name is required.');
      const sup = state.suppliers.find((s) => s.id === id);
      if (!sup) throw new Error('Not found.');
      if (state.suppliers.some((s) => s.id !== id && s.name.toLowerCase() === trimmed.toLowerCase())) throw new Error('That supplier already exists.');
      const oldName = sup.name;
      sup.name = trimmed;
      state.invoices.forEach((inv) => inv.lineItems.forEach((li) => { if (li.vendor === oldName) li.vendor = trimmed; }));
      persistDB();
    },
    deleteSupplier(id) {
      state.suppliers = state.suppliers.filter((s) => s.id !== id);
      persistDB();
    },

    createEquipment(payload) {
      const name = (payload.name || '').trim();
      if (!name) throw new Error('Name is required.');
      if (state.equipment.some((e) => e.name === name)) throw new Error('That equipment already exists.');
      state.equipment.push({
        id: nextId++,
        name,
        category: payload.category || 'Other',
        make: payload.make || '',
        model: payload.model || '',
        vin: payload.vin || '',
        info: payload.info || '',
        hourStart: '',
        hourEnd: '',
        filters: (payload.filters || []).filter((f) => (f.type || '').trim() || (f.partNumber || '').trim()).map((f) => ({ id: nextId++, type: f.type || '', partNumber: f.partNumber || '' })),
        services: (payload.services || []).filter((s) => (s.name || '').trim()).map((s) => ({ id: nextId++, name: s.name, interval: s.interval || '', lastHours: s.lastHours || '' })),
        notes: [],
        manual: payload.manual || null,
      });
      persistDB();
    },
    updateEquipment(id, payload) {
      const name = (payload.name || '').trim();
      if (!name) throw new Error('Name is required.');
      if (state.equipment.some((e) => e.name === name && e.id !== id)) throw new Error('That equipment already exists.');
      const eq = state.equipment.find((e) => e.id === id);
      if (!eq) throw new Error('Not found.');
      eq.name = name;
      eq.category = payload.category;
      eq.make = payload.make || '';
      eq.model = payload.model || '';
      eq.vin = payload.vin || '';
      eq.info = payload.info || '';
      eq.filters = (payload.filters || []).filter((f) => (f.type || '').trim() || (f.partNumber || '').trim()).map((f) => ({ id: f.id || nextId++, type: f.type || '', partNumber: f.partNumber || '' }));
      eq.services = (payload.services || []).filter((s) => (s.name || '').trim()).map((s) => ({ id: s.id || nextId++, name: s.name, interval: s.interval || '', lastHours: s.lastHours || '' }));
      eq.manual = payload.manual || null;
      persistDB();
    },
    deleteEquipment(id) {
      state.equipment = state.equipment.filter((e) => e.id !== id);
      state.invoices = state.invoices
        .map((inv) => ({ ...inv, lineItems: inv.lineItems.filter((li) => li.equipmentId !== id) }))
        .filter((inv) => inv.lineItems.length > 0);
      persistDB();
    },
    updateHours(id, { start, end }) {
      const eq = state.equipment.find((e) => e.id === id);
      if (!eq) return;
      if (start !== undefined) eq.hourStart = start;
      if (end !== undefined) eq.hourEnd = end;
      persistDB();
    },
    logService(equipmentId, serviceId) {
      const eq = state.equipment.find((e) => e.id === equipmentId);
      if (!eq) return;
      const cur = parseFloat(eq.hourEnd);
      if (isNaN(cur)) throw new Error('Set the current hour meter first.');
      const sv = (eq.services || []).find((s) => s.id === serviceId);
      if (sv) sv.lastHours = String(cur);
      persistDB();
    },

    addNote(equipmentId, { text, date }) {
      const trimmed = (text || '').trim();
      if (!trimmed) throw new Error('Note text is required.');
      const eq = state.equipment.find((e) => e.id === equipmentId);
      if (!eq) return;
      eq.notes = eq.notes || [];
      eq.notes.push({ id: nextId++, text: trimmed, date: date || '' });
      persistDB();
    },
    deleteNote(id) {
      state.equipment.forEach((eq) => { eq.notes = (eq.notes || []).filter((n) => n.id !== id); });
      persistDB();
    },

    saveInvoice({ fileName, lineItems }) {
      const items = (lineItems || []).filter((it) => (it.part || '').trim() && it.equipmentId);
      if (!items.length) throw new Error('At least one complete line item with an equipment assignment is required.');
      state.invoices.push({
        id: nextId++,
        fileName: fileName || 'Manual entry',
        savedAt: new Date().toISOString(),
        lineItems: items.map((it) => ({
          id: nextId++,
          part: it.part || '',
          qty: it.qty || '',
          unitCost: it.unitCost || '',
          totalCost: it.totalCost || '',
          vendor: it.vendor || '',
          date: it.date || '',
          equipmentId: it.equipmentId,
        })),
      });
      persistDB();
    },
    deleteLineItem(id) {
      state.invoices = state.invoices
        .map((inv) => ({ ...inv, lineItems: inv.lineItems.filter((li) => li.id !== id) }))
        .filter((inv) => inv.lineItems.length > 0);
      persistDB();
    },

    changeSettingsPassword(newPassword) {
      const trimmed = (newPassword || '').trim();
      if (!trimmed) throw new Error('Password is required.');
      state.settingsPassword = trimmed;
      persistDB();
    },
  };

  // ---------------------------------------------------------------- utils

  function todayIso() { return new Date().toISOString().slice(0, 10); }
  function buildBackupPayload() {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      categories: state.categories,
      suppliers: state.suppliers,
      equipment: state.equipment,
      invoices: state.invoices,
      settingsPassword: state.settingsPassword,
    };
  }
  function fmt(n) { return '$' + (parseFloat(n) || 0).toFixed(2); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function attr(s) { return esc(s); }
  function uid() { return 'id_' + Math.random().toString(36).slice(2); }
  function alphaSort(a, b) { return a.localeCompare(b, undefined, { sensitivity: 'base' }); }

  // A trash-can icon button, used in place of a "Delete"/"Remove" text
  // button wherever that button just triggers a confirm step (or, for
  // low-stakes rows like a filter/service line, is the removal itself).
  function trashButton(action, label, extraAttrs) {
    return `<button class="btn-icon" data-action="${action}" aria-label="${attr(label)}" title="${attr(label)}" ${extraAttrs || ''}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
    </button>`;
  }

  // A small "i" badge that reveals a popover of help text on click, instead
  // of that text sitting permanently on the page. `html` is trusted markup
  // (a hardcoded help string, occasionally with a link) — never user input.
  function infoIcon(id, html) {
    return `
      <span class="info-icon-wrap">
        <button type="button" class="info-icon-btn" data-action="toggleInfo" data-info-id="${id}" aria-label="More info">i</button>
        ${state.openInfoId === id ? `<div class="info-popover">${html}</div>` : ''}
      </span>
    `;
  }

  function equipmentById(id) { return state.equipment.find((e) => e.id === Number(id)) || null; }
  function equipmentByName(name) {
    const t = (name || '').trim().toLowerCase();
    if (!t) return null;
    return state.equipment.find((e) => e.name.toLowerCase() === t) || null;
  }
  function categoryColor(name) {
    const c = state.categories.find((c) => c.name === name);
    return c ? c.color : 'var(--color-neutral-500)';
  }
  function allLineItems() {
    const out = [];
    state.invoices.forEach((inv) => inv.lineItems.forEach((li) => {
      const eq = state.equipment.find((e) => e.id === li.equipmentId);
      out.push({ ...li, invoiceId: inv.id, fileName: inv.fileName, equipment: eq ? eq.name : '' });
    }));
    return out;
  }
  function getYears() {
    const set = new Set([new Date().getFullYear()]);
    allLineItems().forEach((li) => { if (li.date) set.add(parseInt(li.date.slice(0, 4), 10)); });
    return Array.from(set).sort((a, b) => b - a);
  }
  function yearOptionsHtml(selected) {
    return getYears().map((y) => `<option value="${y}" ${Number(selected) === y ? 'selected' : ''}>${y}</option>`).join('');
  }

  function serviceStatus(pct) {
    if (pct >= 1) return { color: 'oklch(55% 0.21 27)', label: 'Overdue' };
    if (pct >= 0.9) return { color: 'oklch(68% 0.17 55)', label: 'Due now' };
    if (pct >= 0.75) return { color: 'oklch(76% 0.15 90)', label: 'Due soon' };
    return { color: 'oklch(56% 0.14 150)', label: 'OK' };
  }
  function serviceDotsFor(eq) {
    const cur = parseFloat(eq.hourEnd);
    return (eq.services || []).map((sv) => {
      const interval = parseFloat(sv.interval);
      const last = parseFloat(sv.lastHours);
      if (isNaN(interval) || interval <= 0 || isNaN(last) || isNaN(cur)) return { name: sv.name, color: 'var(--color-neutral-400)' };
      const st = serviceStatus(Math.max(0, cur - last) / interval);
      return { name: sv.name + ' — ' + st.label, color: st.color };
    });
  }
  function equipmentTotal(eq) {
    return allLineItems().filter((li) => li.equipmentId === eq.id).reduce((s, li) => s + (parseFloat(li.totalCost) || 0), 0);
  }
  function equipmentCount(eq) {
    return allLineItems().filter((li) => li.equipmentId === eq.id).length;
  }

  // ---------------------------------------------------------------- focus preservation

  function captureFocus() {
    const el = document.activeElement;
    if (!el || !$app.contains(el) || !el.id) return null;
    return { id: el.id, start: el.selectionStart, end: el.selectionEnd };
  }
  function restoreFocus(f) {
    if (!f) return;
    const el = document.getElementById(f.id);
    if (!el) return;
    el.focus();
    if (typeof f.start === 'number' && el.setSelectionRange) {
      try { el.setSelectionRange(f.start, f.end); } catch (e) { /* not a text field */ }
    }
  }

  // ---------------------------------------------------------------- render loop

  function render() {
    const focus = captureFocus();
    $app.innerHTML = renderRoot();
    restoreFocus(focus);
    populateDatalists();
  }

  function populateDatalists() {
    const supList = document.getElementById('supplierList');
    if (supList) supList.innerHTML = state.suppliers.map((s) => `<option value="${attr(s.name)}"></option>`).join('');
    const eqList = document.getElementById('equipmentDatalist');
    if (eqList) eqList.innerHTML = state.equipment.map((e) => `<option value="${attr(e.name)}"></option>`).join('');
  }

  function renderRoot() {
    if (state.loading) return `<div style="padding:60px;text-align:center;color:var(--color-neutral-700);">Loading…</div>`;
    return `
      <div style="min-height:100vh;display:flex;flex-direction:column;">
        ${renderNav()}
        ${state.loadError ? renderErrorBanner() : ''}
        ${state.driveToast ? renderDriveToast() : ''}
        ${renderView()}
        ${renderModals()}
      </div>
    `;
  }

  // Google Drive setup fields, shown in Settings → Storage the first time
  // Drive is picked as the storage mode (before a Client ID is saved).
  function driveSetupFields() {
    return `
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div class="field"><label>Google OAuth Client ID</label><input class="input" id="drive-setup-client-id" data-action="setDriveClientIdDraft" data-on="input" value="${attr(state.driveClientIdDraft)}" placeholder="xxxxxxxxxx.apps.googleusercontent.com"></div>
        <div class="field"><label>Google API key (optional, enables folder selection)</label><input class="input" id="drive-setup-api-key" data-action="setDriveApiKeyDraft" data-on="input" value="${attr(state.driveApiKeyDraft)}" placeholder="AIza…"></div>
        <div class="field"><label>Google Cloud project number (needed alongside the API key)</label><input class="input" id="drive-setup-app-id" data-action="setDriveAppIdDraft" data-on="input" value="${attr(state.driveAppIdDraft)}" placeholder="e.g. 123456789012"></div>
        <div><button class="btn btn-secondary" data-action="saveDriveSetup" ${state.driveBusy || !state.driveClientIdDraft.trim() ? 'disabled' : ''}>${state.driveBusy ? 'Connecting…' : 'Connect'}</button></div>
      </div>
    `;
  }

  function renderDriveToast() {
    return `
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;padding:10px 32px;background:var(--color-neutral-800);color:var(--color-bg);font-size:14px;">
        ${esc(state.driveToast)}
      </div>
    `;
  }

  function renderErrorBanner() {
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 32px;background:var(--color-accent-100);border-bottom:2px solid var(--color-accent);">
        <div style="font-size:14px;color:var(--color-accent-700);">${esc(state.loadError)}</div>
        <button class="btn btn-ghost" data-action="dismissError">Dismiss</button>
      </div>
    `;
  }

  function navBtn(view, label, active, extra) {
    return `<button class="btn ${active ? 'btn-primary' : 'btn-ghost'}" data-action="setView" data-view="${view}" ${extra || ''}>${label}</button>`;
  }

  function navSaveBusy() {
    return state.storageMode === 'drive' ? state.driveBusy : state.storageMode === 'local' ? state.localBusy : false;
  }

  function renderNav() {
    const v = state.view;
    return `
      <div class="nav" style="justify-content:space-between;padding:20px 44px;min-height:96px;">
        <div style="display:flex;align-items:center;gap:16px;">
          <div class="nav-brand">Veteran Equipment Expense</div>
          ${state.storageMode !== 'none' ? `
          <button data-action="headerSaveNow" aria-label="Save now" title="${navSaveBusy() ? 'Saving…' : 'Save now'}" ${navSaveBusy() ? 'disabled' : ''} style="padding:4px;background:none;border:none;color:var(--color-text);cursor:pointer;display:flex;align-items:center;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path><path d="M12 12v9"></path><path d="m16 16-4-4-4 4"></path></svg>
          </button>
          <button data-action="confirmRestoreLatest" aria-label="Download latest" title="Download latest" ${navSaveBusy() ? 'disabled' : ''} style="padding:4px;background:none;border:none;color:var(--color-text);cursor:pointer;display:flex;align-items:center;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          </button>` : ''}
        </div>
        <div style="display:flex;gap:10px;align-items:center;">
          ${navBtn('dashboard', 'Dashboard', v === 'dashboard', 'style="font-size:17px;padding:14px 22px;"')}
          ${navBtn('upload', 'Expense', v === 'upload', 'style="font-size:17px;padding:14px 22px;"')}
          ${navBtn('maintenance', 'Maintenance', v === 'maintenance', 'style="font-size:15px;padding:14px 18px;"')}
          ${navBtn('history', 'Equipment', v === 'history' || v === 'detail', 'style="font-size:15px;padding:14px 18px;"')}
          ${navBtn('yearly', 'Reports', v === 'yearly', 'style="font-size:15px;padding:14px 18px;"')}
          <button class="btn ${v === 'analytics' ? 'btn-primary' : 'btn-ghost'}" data-action="setView" data-view="analytics" aria-label="Advanced reporting" title="Advanced reporting" style="padding:14px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v16a2 2 0 0 0 2 2h16"></path><path d="M18 17V9"></path><path d="M13 17V5"></path><path d="M8 17v-3"></path></svg>
          </button>
          <button class="btn ${v === 'settings' ? 'btn-primary' : 'btn-ghost'}" data-action="settingsClick" aria-label="Settings" style="padding:14px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"></path><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"></path></svg>
          </button>
        </div>
      </div>
    `;
  }

  function renderView() {
    switch (state.view) {
      case 'dashboard': return renderDashboard();
      case 'upload': return renderExpense();
      case 'maintenance': return renderMaintenance();
      case 'history': return renderEquipmentList();
      case 'detail': return renderEquipmentDetail();
      case 'yearly': return renderYearly();
      case 'analytics': return renderAnalytics();
      case 'settings': return state.settingsUnlocked ? renderSettings() : renderDashboard();
      default: return renderDashboard();
    }
  }

  // ---------------------------------------------------------------- dashboard

  const WRENCH_PATH = 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z';
  const GEAR_PATHS = [
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z',
  ];

  // A hardcoded, dependency-free mechanic-shop motif for the dashboard banner —
  // inline SVG so it always renders (no photo upload, no external image request).
  function dashboardBannerArt() {
    return `
      <svg viewBox="0 0 1600 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style="position:absolute;inset:0;width:100%;height:100%;">
        <g fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="1">
          <g transform="translate(1360,10) scale(6.2)">${GEAR_PATHS.map((p) => `<path d="${p}"/>`).join('')}</g>
          <g transform="translate(60,150) rotate(-18) scale(9.5)"><path d="${WRENCH_PATH}"/></g>
          <g transform="translate(1080,150) rotate(28) scale(5.5)"><path d="${WRENCH_PATH}"/></g>
          <g transform="translate(210,-10) scale(3.4)">${GEAR_PATHS.map((p) => `<path d="${p}"/>`).join('')}</g>
        </g>
        <g fill="rgba(255,255,255,0.14)">
          <circle cx="560" cy="55" r="3"/>
          <circle cx="640" cy="95" r="2.2"/>
          <circle cx="720" cy="40" r="2.6"/>
          <circle cx="820" cy="110" r="2"/>
          <circle cx="910" cy="60" r="2.4"/>
        </g>
      </svg>
    `;
  }

  function renderDashboard() {
    const years = getYears();
    const dashYear = state.dashboardYear || years[0];
    const items = allLineItems().filter((li) => li.date && li.date.slice(0, 4) === String(dashYear));
    const dashRaw = state.equipment.map((eq) => ({
      name: eq.name,
      category: eq.category,
      total: items.filter((li) => li.equipmentId === eq.id).reduce((s, li) => s + (parseFloat(li.totalCost) || 0), 0),
    })).sort((a, b) => b.total - a.total);
    const dashTotal = dashRaw.reduce((s, r) => s + r.total, 0);
    const top5 = dashRaw.slice(0, 5);

    const catTotalsRaw = state.categories.map((cat) => ({
      name: cat.name,
      color: cat.color,
      total: dashRaw.filter((r) => r.category === cat.name).reduce((s, r) => s + r.total, 0),
    })).filter((c) => c.total > 0).sort((a, b) => b.total - a.total);
    const catGrandTotal = catTotalsRaw.reduce((s, c) => s + c.total, 0) || 1;
    let acc = 0;
    const legend = catTotalsRaw.map((c) => {
      const pct = c.total / catGrandTotal;
      const seg = { ...c, pctLabel: Math.round(pct * 100) + '%', start: acc * 360, end: (acc + pct) * 360, totalFormatted: fmt(c.total) };
      acc += pct;
      return seg;
    });
    const gradient = legend.length ? 'conic-gradient(' + legend.map((c) => `${c.color} ${c.start.toFixed(1)}deg ${c.end.toFixed(1)}deg`).join(', ') : '';
    const gradientCss = legend.length ? gradient + ')' : 'var(--color-neutral-100)';

    window.__categoryPieLegend = legend; // used by mousemove handler

    return `
      <div style="position:relative;height:220px;overflow:hidden;flex-shrink:0;background:linear-gradient(135deg, var(--color-neutral-800), var(--color-neutral-900));">
        ${dashboardBannerArt()}
        <div style="position:absolute;inset:0;background:linear-gradient(180deg, rgba(32,30,29,0.25) 0%, rgba(32,30,29,0.8) 100%);"></div>
        <div style="position:absolute;inset:0;display:flex;align-items:flex-end;padding:0 32px 24px;">
          <div style="max-width:1000px;width:100%;margin:0 auto;display:flex;justify-content:space-between;align-items:center;">
            <h1 style="font-size:56px;margin:0;color:#fff;">${dashYear}</h1>
            <select class="input" style="width:110px;" data-action="setDashboardYear" data-on="change">${yearOptionsHtml(dashYear)}</select>
          </div>
        </div>
      </div>
      <div style="padding:40px 32px;max-width:1000px;width:100%;margin:0 auto;box-sizing:border-box;">
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin:0 0 24px;">
          <button class="btn btn-primary" data-action="goUploadInvoice">Upload invoice</button>
          <button class="btn btn-secondary" data-action="goManualExpense">Add manual expense</button>
        </div>
        <div class="card" style="margin:0 0 24px;">
          <div class="card-kicker">Total fleet expenses, ${dashYear}</div>
          <div style="font-family:var(--font-heading);font-size:48px;">${fmt(dashTotal)}</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;align-items:start;">
          <div>
            <div class="card-title" style="margin-bottom:12px;">Top 5 Equipment by Expense</div>
            <table class="table">
              <thead><tr><th>#</th><th>Equipment</th><th style="text-align:right;">Total</th></tr></thead>
              <tbody>
                ${top5.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td style="text-align:right;font-family:var(--font-heading);">${fmt(r.total)}</td></tr>`).join('') || `<tr><td colspan="3" class="text-muted">No expenses yet.</td></tr>`}
              </tbody>
            </table>
          </div>
          <div style="display:flex;flex-direction:column;gap:24px;align-items:center;justify-content:center;height:100%;">
            <div class="card-title">Expense Category Breakdown</div>
            <div style="position:relative;width:220px;height:220px;flex-shrink:0;">
              <div id="pie-chart" data-action="pieMove" data-on="mousemove" data-leave-action="pieLeave" style="width:220px;height:220px;border-radius:50%;background:${gradientCss};cursor:default;"></div>
              ${state.pieTip ? `
                <div style="position:absolute;left:${state.pieTip.x}px;top:${state.pieTip.y - 12}px;transform:translate(-50%,-100%);pointer-events:none;background:var(--color-text);color:var(--color-bg);padding:8px 10px;white-space:nowrap;z-index:5;box-shadow:var(--shadow-md);">
                  <div style="font-family:var(--font-heading);font-size:13px;letter-spacing:0.04em;text-transform:uppercase;">${esc(state.pieTip.name)}</div>
                  <div style="font-size:13px;margin-top:2px;">${state.pieTip.totalFormatted} · ${state.pieTip.pctLabel}</div>
                </div>` : ''}
            </div>
            <div style="display:flex;flex-direction:column;gap:10px;">
              ${legend.map((c) => `
                <div style="display:flex;align-items:center;gap:10px;">
                  <div style="width:14px;height:14px;border-radius:4px;background:${c.color};flex-shrink:0;"></div>
                  <div style="min-width:140px;">${esc(c.name)}</div>
                  <div style="font-family:var(--font-heading);">${c.totalFormatted}</div>
                  <div style="color:var(--color-neutral-700);font-size:13px;">(${c.pctLabel})</div>
                </div>`).join('') || `<div class="text-muted">No spending recorded for ${dashYear}.</div>`}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ---------------------------------------------------------------- expense (upload / manual / all)

  function renderExpense() {
    const mode = state.addExpenseMode;
    return `
      <div style="padding:40px 32px;max-width:1200px;width:100%;margin:0 auto;box-sizing:border-box;">
        <h1 style="font-size:28px;margin:0 0 8px;">Expenses</h1>
        <p class="text-muted" style="max-width:640px;">Upload an invoice to extract line items automatically, enter a single expense by hand, or browse everything you've logged.</p>
        <div style="display:flex;gap:8px;margin-bottom:28px;">
          <button class="btn ${mode === 'upload' ? 'btn-primary' : 'btn-ghost'}" data-action="setAddMode" data-mode="upload">Upload Invoice</button>
          <button class="btn ${mode === 'manual' ? 'btn-primary' : 'btn-ghost'}" data-action="setAddMode" data-mode="manual">Manual Expense</button>
          <button class="btn ${mode === 'all' ? 'btn-primary' : 'btn-ghost'}" data-action="setAddMode" data-mode="all">All Expenses</button>
        </div>
        ${mode === 'all' ? renderAllExpenses() : ''}
        ${mode === 'manual' ? renderManualExpense() : ''}
        ${mode === 'upload' ? renderUploadExpense() : ''}
      </div>
    `;
  }

  function renderAllExpenses() {
    const term = state.allExpSearch.trim().toLowerCase();
    const lines = allLineItems();
    const filtered = term ? lines.filter((li) => [li.part, li.vendor, li.equipment, li.date].some((v) => (v || '').toLowerCase().includes(term))) : lines;
    const amt = (li) => parseFloat(li.totalCost) || 0;
    const sort = state.allExpSort;
    const sorted = [...filtered].sort((a, b) => {
      if (sort === 'oldest') return (a.date || '').localeCompare(b.date || '');
      if (sort === 'highest') return amt(b) - amt(a);
      if (sort === 'lowest') return amt(a) - amt(b);
      return (b.date || '').localeCompare(a.date || '');
    });
    const total = sorted.reduce((s, li) => s + amt(li), 0);
    return `
      <div style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap;margin-bottom:20px;">
        <div class="field" style="flex:1;min-width:280px;"><label>Search</label>
          <input class="input" id="all-exp-search" data-action="setAllExpSearch" data-on="input" placeholder="Part, vendor, equipment, or date…" value="${attr(state.allExpSearch)}">
        </div>
        <div class="field" style="width:200px;"><label>Sort by</label>
          <select class="input" id="all-exp-sort" data-action="setAllExpSort" data-on="change">
            <option value="newest" ${sort === 'newest' ? 'selected' : ''}>Newest first</option>
            <option value="oldest" ${sort === 'oldest' ? 'selected' : ''}>Oldest first</option>
            <option value="highest" ${sort === 'highest' ? 'selected' : ''}>Highest cost</option>
            <option value="lowest" ${sort === 'lowest' ? 'selected' : ''}>Lowest cost</option>
          </select>
        </div>
        <div style="padding-bottom:8px;color:var(--color-neutral-700);font-size:13px;">${sorted.length}${sorted.length === 1 ? ' expense' : ' expenses'} · ${fmt(total)}</div>
      </div>
      <table class="table">
        <thead><tr><th>Date</th><th>Part</th><th>Vendor</th><th>Equipment</th><th style="text-align:right;">Qty</th><th style="text-align:right;">Total</th></tr></thead>
        <tbody>
          ${sorted.map((li) => `<tr><td style="white-space:nowrap;">${esc(li.date || '—')}</td><td>${esc(li.part || '—')}</td><td>${esc(li.vendor || '—')}</td><td>${esc(li.equipment || 'Unassigned')}</td><td style="text-align:right;">${esc(li.qty || '')}</td><td style="text-align:right;font-family:var(--font-heading);">${fmt(li.totalCost)}</td></tr>`).join('')}
        </tbody>
      </table>
      ${sorted.length === 0 ? `<div class="text-muted" style="margin-top:16px;">${lines.length === 0 ? 'No expenses logged yet.' : 'No expenses match that search.'}</div>` : ''}
    `;
  }

  function vendorQuickAdd(vendor, actionName, idAttr) {
    const trimmed = (vendor || '').trim();
    if (!trimmed) return '';
    const known = state.suppliers.some((s) => s.name.toLowerCase() === trimmed.toLowerCase());
    if (known) return '';
    return `<button class="btn btn-ghost" style="flex-shrink:0;white-space:nowrap;" data-action="${actionName}" ${idAttr} title="Add to supplier list">+ New</button>`;
  }

  function renderManualExpense() {
    const rows = state.standaloneRows;
    const saveDisabled = !rows.some((r) => r.part.trim() && equipmentByName(r.equipment));
    return `
      <div style="display:flex;flex-direction:column;gap:12px;padding:20px;border:2px solid var(--color-divider);max-width:1200px;">
        ${rows.map((row, i) => `
          <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;padding-bottom:12px;border-bottom:1px solid var(--color-divider);">
            <div class="field" style="flex:2;min-width:320px;"><label>Part</label><input class="input" id="row-${i}-part" data-action="updateStandaloneRow" data-index="${i}" data-field="part" data-on="input" style="width:100%;" value="${attr(row.part)}"></div>
            <div class="field"><label>Qty</label><input class="input" id="row-${i}-qty" data-action="updateStandaloneRow" data-index="${i}" data-field="qty" data-on="input" style="width:70px" type="number" value="${attr(row.qty)}"></div>
            <div class="field"><label>Unit&nbsp;Cost</label><input class="input" id="row-${i}-unitCost" data-action="updateStandaloneRow" data-index="${i}" data-field="unitCost" data-on="input" style="width:100px" type="number" value="${attr(row.unitCost)}"></div>
            <div class="field"><label>Total&nbsp;Cost</label><input class="input" id="row-${i}-totalCost" data-action="updateStandaloneRow" data-index="${i}" data-field="totalCost" data-on="input" style="width:100px" type="number" value="${attr(row.totalCost)}"></div>
            <div class="field" style="flex:1;min-width:180px;">
              <label>Vendor</label>
              <div style="display:flex;gap:6px;">
                <input class="input" id="row-${i}-vendor" data-action="updateStandaloneRow" data-index="${i}" data-field="vendor" data-on="input" style="width:100%;" list="supplierList" value="${attr(row.vendor)}">
                ${vendorQuickAdd(row.vendor, 'quickAddSupplierRow', `data-index="${i}"`)}
              </div>
            </div>
            <div class="field"><label>Date</label><input class="input" id="row-${i}-date" data-action="updateStandaloneRow" data-index="${i}" data-field="date" data-on="change" style="width:150px" type="date" value="${attr(row.date)}"></div>
            <div class="field" style="flex:1;min-width:240px;">
              <label>Equipment</label>
              <input class="input" id="row-${i}-equipment" data-action="updateStandaloneRow" data-index="${i}" data-field="equipment" data-on="input" style="width:100%;" list="equipmentDatalist" placeholder="Start typing…" value="${attr(row.equipment)}">
            </div>
            ${rows.length > 1 ? trashButton('removeStandaloneRow', 'Remove row', `data-index="${i}"`) : ''}
          </div>
        `).join('')}
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary" data-action="addStandaloneRow">+ Add another line</button>
          <button class="btn btn-primary" data-action="saveAllStandalone" ${saveDisabled ? 'disabled' : ''}>Save all expenses</button>
        </div>
      </div>
    `;
  }

  function renderUploadExpense() {
    const p = state.pendingInvoice;
    if (!p) {
      return `
        <label for="invoiceFile" style="display:flex;flex-direction:column;align-items:flex-start;gap:12px;border:2px dashed var(--color-divider);padding:48px;cursor:pointer;max-width:520px;">
          <span class="btn btn-primary">Choose invoice file</span>
          <span class="text-muted" style="font-size:14px;">JPG, PNG, or PDF</span>
        </label>
        <input id="invoiceFile" type="file" accept="image/*,application/pdf" style="display:none;" data-action="fileChange" data-on="change">
      `;
    }
    const isImage = (p.mimeType || '').startsWith('image');
    const isPdf = p.mimeType === 'application/pdf';
    const rows = p.lineItems || [];
    const saveDisabled = rows.length === 0 || rows.some((it) => !equipmentByName(it.equipment));
    return `
      <div style="max-width:360px;">
        <div style="border:2px solid var(--color-divider);padding:12px;">
          ${isImage ? `<img src="${p.dataUrl}" style="width:100%;display:block;">` : ''}
          ${isPdf ? `<div style="padding:40px 12px;text-align:center;color:var(--color-neutral-700);">PDF uploaded — preview not shown</div>` : ''}
        </div>
        <div style="margin-top:8px;font-size:13px;color:var(--color-neutral-700);">${esc(p.fileName)}</div>
        <button class="btn btn-ghost btn-block" style="margin-top:16px;" data-action="cancelPending">Upload different file</button>
      </div>
      <div style="margin-top:32px;">
        ${p.extracting ? `<div class="tag tag-accent" style="margin-bottom:16px;">${esc(p.status || 'Reading invoice…')}</div>` : ''}
        ${p.error ? `<div style="border:2px solid var(--color-accent);padding:12px;margin-bottom:16px;color:var(--color-accent-700);">${esc(p.error)}</div>` : ''}
        ${rows.length ? `
          <table class="table">
            <thead><tr><th>Part</th><th>Qty</th><th>Unit&nbsp;Cost</th><th>Total&nbsp;Cost</th><th>Vendor</th><th>Date</th><th>Equipment</th><th></th></tr></thead>
            <tbody>
              ${rows.map((item) => `
                <tr>
                  <td><input class="input" id="pend-${item.id}-part" data-action="updatePendingItem" data-id="${item.id}" data-field="part" data-on="input" style="width:240px" value="${attr(item.part)}"></td>
                  <td><input class="input" id="pend-${item.id}-qty" data-action="updatePendingItem" data-id="${item.id}" data-field="qty" data-on="input" style="width:60px" type="number" value="${attr(item.qty)}"></td>
                  <td><input class="input" id="pend-${item.id}-unitCost" data-action="updatePendingItem" data-id="${item.id}" data-field="unitCost" data-on="input" style="width:80px" type="number" value="${attr(item.unitCost)}"></td>
                  <td><input class="input" id="pend-${item.id}-totalCost" data-action="updatePendingItem" data-id="${item.id}" data-field="totalCost" data-on="input" style="width:80px" type="number" value="${attr(item.totalCost)}"></td>
                  <td><input class="input" id="pend-${item.id}-vendor" data-action="updatePendingItem" data-id="${item.id}" data-field="vendor" data-on="input" style="width:130px" list="supplierList" value="${attr(item.vendor)}"></td>
                  <td><input class="input" id="pend-${item.id}-date" data-action="updatePendingItem" data-id="${item.id}" data-field="date" data-on="change" style="width:120px" type="date" value="${attr(item.date)}"></td>
                  <td><input class="input" id="pend-${item.id}-equipment" data-action="updatePendingItem" data-id="${item.id}" data-field="equipment" data-on="input" style="width:160px" list="equipmentDatalist" placeholder="Start typing…" value="${attr(item.equipment)}"></td>
                  <td>${trashButton('removePendingItem', 'Remove line item', `data-id="${item.id}"`)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div style="display:flex;gap:12px;margin-top:20px;">
            <button class="btn btn-secondary" data-action="addPendingRow">+ Add line item</button>
            <button class="btn btn-primary" data-action="saveInvoice" ${saveDisabled ? 'disabled' : ''}>Save invoice</button>
          </div>
          ${saveDisabled ? `<div style="margin-top:10px;font-size:13px;color:var(--color-neutral-700);">Every line needs an equipment assignment before saving.</div>` : ''}
        ` : ''}
      </div>
    `;
  }

  // ---------------------------------------------------------------- equipment list (history)

  function equipmentCardHtml(eq) {
    const total = equipmentTotal(eq);
    const count = equipmentCount(eq);
    const manageOpen = state.manageOpenFor === eq.id;
    const confirming = state.confirmDeleteFor === eq.id;
    const formOpen = state.manualFormOpenFor === eq.id;
    const dots = serviceDotsFor(eq);
    return `
      <div class="card" style="margin-bottom:8px;padding:8px 14px;position:relative;">
        <div style="display:flex;flex-direction:row;align-items:center;gap:16px;">
          <div style="width:8px;height:8px;border-radius:50%;background:${categoryColor(eq.category)};flex-shrink:0;"></div>
          <div class="card-title" style="font-size:15px;flex:1 1 180px;min-width:0;">${esc(eq.name)}</div>
          ${eq.vin ? `<div style="font-size:12px;color:var(--color-neutral-700);flex:0 0 auto;white-space:nowrap;">${esc(eq.vin)}</div>` : ''}
          <div class="card-meta" style="flex:0 0 auto;white-space:nowrap;">${count}${count === 1 ? ' expense' : ' expenses'}</div>
          <div style="font-family:var(--font-heading);font-size:16px;flex:0 0 auto;white-space:nowrap;">${fmt(total)}</div>
          <div style="display:flex;gap:4px;flex:0 0 auto;">
            ${dots.map((d) => `<span title="${attr(d.name)}" style="width:10px;height:10px;background:${d.color};display:inline-block;"></span>`).join('')}
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex:0 0 auto;position:relative;">
            <button class="btn btn-secondary" data-action="viewEquipment" data-id="${eq.id}">View</button>
            <button class="btn btn-ghost" data-action="toggleManage" data-id="${eq.id}">Manage</button>
            ${manageOpen ? `
              <div style="position:absolute;top:100%;right:0;margin-top:4px;background:var(--color-bg);border:2px solid var(--color-divider);z-index:5;min-width:200px;display:flex;flex-direction:column;">
                <button class="btn btn-ghost" style="justify-content:flex-start;" data-action="startEditEquipment" data-id="${eq.id}">Edit</button>
                <button class="btn btn-ghost" style="justify-content:flex-start;" data-action="openManualForm" data-id="${eq.id}">+ Add Expense</button>
                ${state.settingsUnlocked ? `<button class="btn btn-ghost" style="justify-content:flex-start;" data-action="confirmDeleteEquipment" data-id="${eq.id}">Delete</button>` : ''}
              </div>` : ''}
          </div>
        </div>
        ${confirming ? `
          <div style="margin-top:12px;padding:16px;border:2px solid var(--color-accent);display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <div style="color:var(--color-accent-700);">Delete ${esc(eq.name)} and its ${count}${count === 1 ? ' expense' : ' expenses'}? This can't be undone.</div>
            <button class="btn btn-primary" data-action="deleteEquipment" data-id="${eq.id}">Delete equipment</button>
            <button class="btn btn-ghost" data-action="cancelDeleteEquipment">Cancel</button>
          </div>` : ''}
        ${formOpen ? renderInlineManualForm(eq) : ''}
      </div>
    `;
  }

  function renderInlineManualForm(eq) {
    const f = state.manualForm || blankManualForm();
    const saveDisabled = !f.part.trim();
    return `
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:12px;padding:16px;border:2px solid var(--color-divider);">
        <div class="field"><label>Part</label><input class="input" id="mf-part" data-action="updateManualForm" data-field="part" data-on="input" style="width:280px" value="${attr(f.part)}"></div>
        <div class="field"><label>Qty</label><input class="input" id="mf-qty" data-action="updateManualForm" data-field="qty" data-on="input" style="width:60px" type="number" value="${attr(f.qty)}"></div>
        <div class="field"><label>Unit&nbsp;Cost</label><input class="input" id="mf-unitCost" data-action="updateManualForm" data-field="unitCost" data-on="input" style="width:80px" type="number" value="${attr(f.unitCost)}"></div>
        <div class="field"><label>Total&nbsp;Cost</label><input class="input" id="mf-totalCost" data-action="updateManualForm" data-field="totalCost" data-on="input" style="width:80px" type="number" value="${attr(f.totalCost)}"></div>
        <div class="field">
          <label>Vendor</label>
          <div style="display:flex;gap:6px;">
            <input class="input" id="mf-vendor" data-action="updateManualForm" data-field="vendor" data-on="input" style="width:130px" list="supplierList" value="${attr(f.vendor)}">
            ${vendorQuickAdd(f.vendor, 'quickAddSupplierManual', '')}
          </div>
        </div>
        <div class="field"><label>Date</label><input class="input" id="mf-date" data-action="updateManualForm" data-field="date" data-on="change" style="width:130px" type="date" value="${attr(f.date)}"></div>
        <button class="btn btn-primary" data-action="saveManualExpense" data-id="${eq.id}" ${saveDisabled ? 'disabled' : ''}>Save expense</button>
        <button class="btn btn-ghost" data-action="closeManualForm">Cancel</button>
      </div>
    `;
  }

  // Every service interval across every piece of equipment, in one place,
  // sorted most-urgent-first — the same status math as the per-equipment
  // detail view's "Service Status" card (serviceStatus()), just rolled up.
  function renderMaintenance() {
    const rows = [];
    state.equipment.forEach((eq) => {
      const cur = parseFloat(eq.hourEnd);
      (eq.services || []).forEach((sv) => {
        const interval = parseFloat(sv.interval);
        const last = parseFloat(sv.lastHours);
        const known = !isNaN(interval) && interval > 0 && !isNaN(last) && !isNaN(cur);
        const used = known ? Math.max(0, cur - last) : 0;
        const pct = known ? used / interval : 0;
        const st = known ? serviceStatus(pct) : { color: 'var(--color-neutral-500)', label: 'Not set' };
        const remaining = known ? interval - used : null;
        rows.push({
          eqId: eq.id, eqName: eq.name, category: eq.category, svId: sv.id, svName: sv.name,
          known, pct, color: st.color, label: st.label,
          detail: known
            ? (remaining >= 0 ? `${Math.round(remaining)} hrs left` : `${Math.round(-remaining)} hrs overdue`)
            : 'Set interval, last-change hours and current meter',
        });
      });
    });

    const order = { Overdue: 0, 'Due now': 1, 'Due soon': 2, OK: 3, 'Not set': 4 };
    rows.sort((a, b) => (order[a.label] - order[b.label]) || b.pct - a.pct);
    const counts = rows.reduce((acc, r) => { acc[r.label] = (acc[r.label] || 0) + 1; return acc; }, {});
    const summaryColors = { Overdue: 'oklch(55% 0.21 27)', 'Due now': 'oklch(68% 0.17 55)', 'Due soon': 'oklch(76% 0.15 90)', OK: 'oklch(56% 0.14 150)' };
    const summaryTiles = Object.keys(summaryColors).map((label) => `
      <div class="card" style="flex:1;min-width:120px;"><div class="card-kicker">${esc(label)}</div><div style="font-family:var(--font-heading);font-size:28px;color:${summaryColors[label]};">${counts[label] || 0}</div></div>
    `).join('');

    return `
      <div style="padding:40px 32px;max-width:1000px;width:100%;margin:0 auto;box-sizing:border-box;">
        <h1 style="font-size:28px;margin:0 0 8px;">Maintenance</h1>
        <p class="text-muted" style="max-width:640px;margin-bottom:24px;">Every service interval across all equipment, most urgent first — based on each item's current hour meter.</p>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:28px;">${summaryTiles}</div>
        ${rows.length ? `
          <div style="display:flex;flex-direction:column;gap:10px;">
            ${rows.map((r) => `
              <div class="card" style="padding:14px 18px;">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
                  <div>
                    <button class="btn btn-ghost" style="padding:0;font-family:var(--font-heading);font-size:16px;" data-action="viewEquipment" data-id="${r.eqId}">${esc(r.eqName)}</button>
                    <span class="card-meta">${esc(r.category)} · ${esc(r.svName)}</span>
                  </div>
                  <div style="display:flex;align-items:center;gap:12px;">
                    <span style="font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:${r.color};">${esc(r.label)}</span>
                    <span class="card-meta">${esc(r.detail)}</span>
                    ${r.known ? `<button class="btn btn-ghost" style="padding:4px 10px;font-size:12px;" data-action="logService" data-eq="${r.eqId}" data-sv="${r.svId}">Mark done</button>` : ''}
                  </div>
                </div>
                <div style="height:8px;background:var(--color-neutral-200);position:relative;margin-top:10px;">
                  <div style="position:absolute;left:0;top:0;bottom:0;width:${Math.min(100, Math.round(r.pct * 100))}%;background:${r.color};"></div>
                </div>
              </div>
            `).join('')}
          </div>
        ` : `<div class="text-muted">No service intervals set up yet. Add them from an equipment's edit screen.</div>`}
      </div>
    `;
  }

  function renderEquipmentList() {
    if (state.selectedCategory) return renderEquipmentCategoryView();
    const term = state.equipmentSearch.trim().toLowerCase();
    const searchActive = term.length > 0;
    let body;
    if (searchActive) {
      const results = state.equipment.filter((eq) => eq.name.toLowerCase().includes(term) || (eq.make || '').toLowerCase().includes(term) || (eq.model || '').toLowerCase().includes(term)).sort((a, b) => alphaSort(a.name, b.name));
      body = results.length
        ? results.map(equipmentCardHtml).join('')
        : `<div class="text-muted">No equipment matches "${esc(state.equipmentSearch)}".</div>`;
    } else if (state.equipmentListMode === 'all') {
      body = [...state.equipment].sort((a, b) => alphaSort(a.name, b.name)).map(equipmentCardHtml).join('');
    } else {
      const tiles = state.categories.map((cat) => {
        const n = state.equipment.filter((e) => e.category === cat.name).length;
        return `
          <button class="card" style="text-align:left;cursor:pointer;border:2px solid var(--color-divider);background:var(--color-bg);width:100%;" data-action="selectCategory" data-name="${attr(cat.name)}">
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="width:12px;height:12px;border-radius:50%;background:${cat.color};flex-shrink:0;"></div>
              <div class="card-title">${esc(cat.name)}</div>
            </div>
            <div class="card-meta">${n} equipment</div>
          </button>
        `;
      }).join('');
      body = `<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));gap:16px;">${tiles}</div>`;
    }
    return `
      <div style="padding:40px 32px;max-width:1100px;width:100%;margin:0 auto;box-sizing:border-box;">
        <h1 style="font-size:28px;margin:0 0 16px;">Equipment List</h1>
        <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-bottom:24px;">
          <input class="input" id="equipment-search" data-action="setEquipmentSearch" data-on="input" style="width:100%;max-width:360px;" placeholder="Search by name, make, or model…" value="${attr(state.equipmentSearch)}">
          <div style="display:flex;gap:8px;">
            <button class="btn ${state.equipmentListMode === 'categories' ? 'btn-primary' : 'btn-ghost'}" data-action="setEquipmentListMode" data-mode="categories">By Category</button>
            <button class="btn ${state.equipmentListMode === 'all' ? 'btn-primary' : 'btn-ghost'}" data-action="setEquipmentListMode" data-mode="all">All Equipment (A–Z)</button>
          </div>
        </div>
        ${body}
      </div>
    `;
  }

  function renderEquipmentCategoryView() {
    const cat = state.selectedCategory;
    const list = state.equipment.filter((e) => e.category === cat).sort((a, b) => alphaSort(a.name, b.name));
    return `
      <div style="padding:40px 32px;max-width:1100px;width:100%;margin:0 auto;box-sizing:border-box;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;gap:16px;">
          <div>
            <button class="btn btn-ghost" style="margin-bottom:8px;" data-action="backToCategories">← Categories</button>
            <h1 style="font-size:28px;margin:0;">${esc(cat)}</h1>
          </div>
          ${state.settingsUnlocked ? `<button class="btn btn-secondary" data-action="openAddEquipmentModal">+ Add equipment</button>` : ''}
        </div>
        ${list.map(equipmentCardHtml).join('') || `<div class="text-muted">No equipment in this category yet.</div>`}
      </div>
    `;
  }

  // ---------------------------------------------------------------- equipment detail

  function renderEquipmentDetail() {
    const eq = equipmentById(state.detailEquipmentId);
    if (!eq) return renderEquipmentList();
    const items = allLineItems().filter((li) => li.equipmentId === eq.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const total = items.reduce((s, i) => s + (parseFloat(i.totalCost) || 0), 0);
    const curMeter = parseFloat(eq.hourEnd);
    const services = (eq.services || []).map((sv) => {
      const interval = parseFloat(sv.interval);
      const last = parseFloat(sv.lastHours);
      const known = !isNaN(interval) && interval > 0 && !isNaN(last) && !isNaN(curMeter);
      const used = known ? Math.max(0, curMeter - last) : 0;
      const pct = known ? used / interval : 0;
      const st = known ? serviceStatus(pct) : { color: 'var(--color-neutral-500)', label: 'Not set' };
      const remaining = known ? interval - used : 0;
      const detailLabel = known
        ? (remaining >= 0 ? `${Math.round(used)} / ${Math.round(interval)} hrs · ${Math.round(remaining)} hrs left` : `${Math.round(used)} / ${Math.round(interval)} hrs · ${Math.round(-remaining)} hrs over`)
        : 'Set interval, last-change hours and current meter';
      return { ...sv, color: st.color, statusLabel: st.label, pctWidth: Math.min(100, Math.round(pct * 100)) + '%', detailLabel };
    });

    const hStart = parseFloat(eq.hourStart), hEnd = parseFloat(eq.hourEnd);
    let hoursRun = null, hourWarningText = '';
    if (!isNaN(hStart) && !isNaN(hEnd)) {
      hoursRun = hEnd - hStart;
      if (hoursRun < 0) { hoursRun = null; hourWarningText = 'Ending hours must be higher than starting hours.'; }
      else if (hoursRun === 0) hourWarningText = 'Enter an ending hour reading higher than the start to get a rate.';
    } else {
      hourWarningText = 'Enter the hour-meter reading at the start and end of the period to see cost per hour.';
    }
    const makeModel = [eq.make, eq.model].filter(Boolean).join(' ');

    return `
      <div style="padding:40px 32px;max-width:1000px;width:100%;margin:0 auto;box-sizing:border-box;">
        <button class="btn btn-ghost" style="margin-bottom:16px;" data-action="backToHistory">← Back</button>
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <h1 style="font-size:28px;margin:0;">${esc(eq.name)}</h1>
            <button class="btn-icon" data-action="startEditEquipment" data-id="${eq.id}" aria-label="Edit equipment">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path><path d="m15 5 4 4"></path></svg>
            </button>
            <button class="btn-icon" data-action="openHourCalc" aria-label="Operating cost per hour">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="0"></rect><line x1="8" y1="6" x2="16" y2="6"></line><line x1="8" y1="10" x2="8" y2="10"></line><line x1="12" y1="10" x2="12" y2="10"></line><line x1="16" y1="10" x2="16" y2="10"></line><line x1="8" y1="14" x2="8" y2="14"></line><line x1="12" y1="14" x2="12" y2="14"></line><line x1="16" y1="14" x2="16" y2="18"></line><line x1="8" y1="18" x2="12" y2="18"></line></svg>
            </button>
          </div>
          <div style="font-family:var(--font-heading);font-size:24px;">${fmt(total)}</div>
        </div>
        ${makeModel ? `<div class="card-meta" style="margin-bottom:4px;">${esc(makeModel)}</div>` : ''}
        ${eq.vin ? `<div class="card-meta" style="margin-bottom:4px;">VIN / Serial: ${esc(eq.vin)}</div>` : ''}
        ${eq.manual ? `<div class="card-meta" style="margin-bottom:4px;">Manual: <a href="${eq.manual.dataUrl}" target="_blank" rel="noopener" download="${attr(eq.manual.fileName)}">${esc(eq.manual.fileName)}</a></div>` : ''}
        ${eq.info ? `<div class="card-meta" style="margin-bottom:24px;">${esc(eq.info)}</div>` : ''}

        <div style="display:flex;align-items:baseline;justify-content:space-between;margin:28px 0 12px;gap:16px;">
          <div class="card-title">Service Status</div>
          <div style="display:flex;align-items:center;gap:10px;">
            <label style="font-size:13px;color:var(--color-neutral-700);">Current hour meter</label>
            <input class="input" id="cur-hours" data-action="setCurrentHours" data-on="change" style="width:130px;" type="number" step="0.1" placeholder="0" value="${attr(eq.hourEnd)}">
          </div>
        </div>
        <div class="card" style="padding:20px;margin-bottom:36px;">
          ${services.length ? `
            <div style="display:flex;flex-direction:column;gap:18px;">
              ${services.map((sv) => `
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:6px;">
                    <div style="display:flex;align-items:center;gap:10px;">
                      <span style="width:12px;height:12px;background:${sv.color};display:inline-block;"></span>
                      <span style="font-family:var(--font-heading);font-size:16px;">${esc(sv.name)}</span>
                      <span style="font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:${sv.color};">${sv.statusLabel}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:12px;">
                      <span class="card-meta">${sv.detailLabel}</span>
                      <button class="btn btn-ghost" style="padding:4px 10px;font-size:12px;" data-action="logService" data-eq="${eq.id}" data-sv="${sv.id}">Mark done</button>
                    </div>
                  </div>
                  <div style="height:12px;background:var(--color-neutral-200);position:relative;">
                    <div style="position:absolute;left:0;top:0;bottom:0;width:${sv.pctWidth};background:${sv.color};"></div>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : `<div class="card-meta">No service intervals set. Use the edit button above to add engine oil, hydraulic oil, gearbox and any other interval.</div>`}
        </div>

        ${(eq.filters || []).length ? `
          <div class="card-title" style="margin-bottom:12px;">Filters</div>
          <table class="table" style="margin-bottom:36px;">
            <thead><tr><th>Type</th><th>Part Number</th></tr></thead>
            <tbody>${eq.filters.map((f) => `<tr><td>${esc(f.type)}</td><td>${esc(f.partNumber)}</td></tr>`).join('')}</tbody>
          </table>
        ` : ''}

        <div class="card-title" style="margin-bottom:12px;">Notes</div>
        <div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:20px;flex-wrap:wrap;">
          <div class="field" style="flex:1;min-width:260px;"><label>Note</label><input class="input" id="note-text" data-action="setNoteText" data-on="input" style="width:100%;" placeholder="e.g. Replace hydraulic filter every 250 hrs" value="${attr(state.noteText)}"></div>
          <div class="field"><label>Due date (optional)</label><input class="input" id="note-date" data-action="setNoteDate" data-on="change" type="date" value="${attr(state.noteDate)}"></div>
          <button class="btn btn-primary" data-action="addNote" data-id="${eq.id}" ${!state.noteText.trim() ? 'disabled' : ''}>Add note</button>
        </div>
        ${(eq.notes || []).map((n) => `
          <div class="card" style="margin-bottom:12px;padding:16px;">
            <div style="display:flex;justify-content:space-between;gap:16px;">
              <div>
                <div>${esc(n.text)}</div>
                ${n.date ? `<div class="card-meta">Due ${esc(n.date)}</div>` : ''}
              </div>
              ${trashButton('removeNote', 'Remove note', `data-id="${n.id}"`)}
            </div>
          </div>
        `).join('')}

        <div class="card-title" style="margin:36px 0 12px;">Invoice history</div>
        ${items.length ? `
          <table class="table" style="margin-bottom:36px;">
            <thead><tr><th>Date</th><th>Part</th><th>Vendor</th><th>Qty</th><th>Total</th><th>Source</th><th></th></tr></thead>
            <tbody>
              ${items.map((li) => `<tr><td>${esc(li.date)}</td><td>${esc(li.part)}</td><td>${esc(li.vendor)}</td><td>${esc(li.qty)}</td><td>${fmt(li.totalCost)}</td><td>${esc(li.fileName)}</td><td>${trashButton('removeLineItem', 'Delete expense line', `data-id="${li.id}"`)}</td></tr>`).join('')}
            </tbody>
          </table>
        ` : `<div class="text-muted" style="margin-bottom:36px;">No expenses recorded yet.</div>`}
      </div>
      ${state.hourCalcOpen ? renderHourCalcModal(eq, hoursRun, hourWarningText, total) : ''}
    `;
  }

  function renderHourCalcModal(eq, hoursRun, hourWarningText, total) {
    return `
      <div class="dialog-backdrop">
        <div class="dialog" style="max-width:520px;">
          <div class="dialog-title">Operating cost per hour</div>
          <div class="dialog-body">
            <div class="card-meta" style="margin-bottom:20px;">${esc(eq.name)}</div>
            <div style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap;">
              <div class="field"><label>Starting hours</label><input class="input" id="hc-start" data-action="setHourStart" data-on="change" style="width:150px;" type="number" step="0.1" placeholder="0" value="${attr(eq.hourStart)}"></div>
              <div class="field"><label>Ending hours</label><input class="input" id="hc-end" data-action="setHourEnd" data-on="change" style="width:150px;" type="number" step="0.1" placeholder="0" value="${attr(eq.hourEnd)}"></div>
            </div>
            <div style="border-top:2px solid var(--color-divider);margin-top:20px;padding-top:20px;display:grid;grid-template-columns:repeat(3,1fr);gap:20px;">
              <div><div class="card-meta" style="margin-bottom:6px;">Hours run</div><div style="font-family:var(--font-heading);font-size:22px;">${hoursRun !== null ? hoursRun.toLocaleString(undefined, { maximumFractionDigits: 1 }) + ' hrs' : '—'}</div></div>
              <div><div class="card-meta" style="margin-bottom:6px;">Total expense</div><div style="font-family:var(--font-heading);font-size:22px;">${fmt(total)}</div></div>
              <div><div class="card-meta" style="margin-bottom:6px;">Cost per hour</div><div style="font-family:var(--font-heading);font-size:22px;color:var(--color-accent-700);">${hoursRun && hoursRun > 0 ? fmt(total / hoursRun) + ' / hr' : '—'}</div></div>
            </div>
            ${hourWarningText ? `<div style="margin-top:16px;font-size:13px;color:var(--color-neutral-700);">${esc(hourWarningText)}</div>` : ''}
          </div>
          <div class="dialog-actions"><button class="btn btn-primary" data-action="closeHourCalc">Done</button></div>
        </div>
      </div>
    `;
  }

  // ---------------------------------------------------------------- yearly totals

  function renderYearly() {
    const years = getYears();
    const selectedYear = state.year || years[0];
    const mode = state.yearlyGroupMode;
    const inYear = allLineItems().filter((li) => li.date && li.date.slice(0, 4) === String(selectedYear));

    let source;
    if (mode === 'category') {
      source = state.categories.map((cat) => ({
        name: cat.name, color: cat.color,
        total: inYear.filter((li) => { const eq = equipmentById(li.equipmentId); return eq && eq.category === cat.name; }).reduce((s, li) => s + (parseFloat(li.totalCost) || 0), 0),
      }));
    } else if (mode === 'vendor') {
      const agg = {};
      inYear.forEach((li) => { const v = (li.vendor || '').trim() || 'Unknown vendor'; agg[v] = (agg[v] || 0) + (parseFloat(li.totalCost) || 0); });
      source = Object.keys(agg).map((v) => ({ name: v, total: agg[v] }));
    } else {
      source = state.equipment.map((eq) => ({
        name: eq.name, category: eq.category, make: eq.make, model: eq.model,
        total: inYear.filter((li) => li.equipmentId === eq.id).reduce((s, li) => s + (parseFloat(li.totalCost) || 0), 0),
      }));
    }

    const term = state.yearlySearch.trim().toLowerCase();
    const filtered = term ? source.filter((r) => (mode === 'equipment') ? (r.name.toLowerCase().includes(term) || (r.make || '').toLowerCase().includes(term) || (r.model || '').toLowerCase().includes(term)) : r.name.toLowerCase().includes(term)) : source;

    let sorted;
    const sortMode = state.yearlySortMode;
    if (sortMode === 'alpha') sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    else if (sortMode === 'least') sorted = [...filtered].sort((a, b) => a.total - b.total);
    else if (mode === 'equipment' && (sortMode === 'category' || sortMode === 'mostPerCategory')) sorted = [...filtered].sort((a, b) => a.category.localeCompare(b.category) || b.total - a.total);
    else sorted = [...filtered].sort((a, b) => b.total - a.total);

    const maxVal = Math.max(1, ...filtered.map((r) => r.total));
    const grandTotal = filtered.reduce((s, r) => s + r.total, 0);
    const identityLabel = mode === 'category' ? 'Category' : mode === 'vendor' ? 'Vendor' : 'Equipment';
    const placeholder = mode === 'equipment' ? 'Search by name, make, or model…' : mode === 'category' ? 'Search categories…' : 'Search vendors…';

    return `
      <div style="padding:40px 32px;max-width:900px;width:100%;margin:0 auto;box-sizing:border-box;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:16px;">
          <h1 style="font-size:28px;margin:0;">Yearly Totals</h1>
          <select class="input" style="width:110px;" data-action="setYearlySelectedYear" data-on="change">${yearOptionsHtml(selectedYear)}</select>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:20px;">
          <button class="btn ${mode === 'category' ? 'btn-primary' : 'btn-ghost'}" data-action="setYearlyMode" data-mode="category">Categories</button>
          <button class="btn ${mode === 'equipment' ? 'btn-primary' : 'btn-ghost'}" data-action="setYearlyMode" data-mode="equipment">Equipment</button>
          <button class="btn ${mode === 'vendor' ? 'btn-primary' : 'btn-ghost'}" data-action="setYearlyMode" data-mode="vendor">Vendors</button>
        </div>
        <input class="input" id="yearly-search" data-action="setYearlySearch" data-on="input" style="width:100%;margin-bottom:20px;" placeholder="${placeholder}" value="${attr(state.yearlySearch)}">
        <div class="field" style="max-width:280px;margin-bottom:20px;">
          <label>Sort by</label>
          <select class="input" id="yearly-sort" data-action="setYearlySort" data-on="change">
            <option value="most" ${sortMode === 'most' ? 'selected' : ''}>Most expensive</option>
            <option value="least" ${sortMode === 'least' ? 'selected' : ''}>Least expensive</option>
            <option value="alpha" ${sortMode === 'alpha' ? 'selected' : ''}>Alphabetical</option>
            ${mode === 'equipment' ? `
              <option value="category" ${sortMode === 'category' ? 'selected' : ''}>Category</option>
              <option value="mostPerCategory" ${sortMode === 'mostPerCategory' ? 'selected' : ''}>Most expensive in each category</option>
            ` : ''}
          </select>
        </div>
        <table class="table">
          <thead><tr><th>${identityLabel}</th>${mode === 'equipment' ? '<th>Category</th>' : ''}<th style="width:35%;">Spend</th><th style="text-align:right;">Total</th>${mode === 'equipment' ? '<th></th>' : ''}</tr></thead>
          <tbody>
            ${sorted.map((r) => {
              const barColor = mode === 'category' ? (r.color || categoryColor(r.name)) : mode === 'equipment' ? categoryColor(r.category) : 'var(--color-accent)';
              const eq = mode === 'equipment' ? equipmentByName(r.name) : null;
              return `<tr>
                <td>${esc(r.name)}</td>
                ${mode === 'equipment' ? `<td>${esc(r.category)}</td>` : ''}
                <td><div style="background:var(--color-neutral-100);height:16px;"><div style="background:${barColor};height:16px;width:${Math.round((r.total / maxVal) * 100)}%;"></div></div></td>
                <td style="text-align:right;font-family:var(--font-heading);">${fmt(r.total)}</td>
                ${mode === 'equipment' ? `<td>${eq ? `<button class="btn btn-secondary" data-action="viewEquipment" data-id="${eq.id}">View</button>` : ''}</td>` : ''}
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot><tr><td style="font-family:var(--font-heading);">Total</td><td></td><td style="text-align:right;font-family:var(--font-heading);">${fmt(grandTotal)}</td></tr></tfoot>
        </table>
      </div>
    `;
  }

  // ---------------------------------------------------------------- advanced reporting

  function renderAnalytics() {
    const mode = state.analyticsMode;
    return `
      <div style="padding:40px 32px;max-width:1100px;width:100%;margin:0 auto;box-sizing:border-box;">
        <h1 style="font-size:28px;margin:0 0 8px;">Advanced Reporting</h1>
        <p class="text-muted" style="max-width:640px;">Compare spending year over year, or drill into what a single vendor cost you on a single machine.</p>
        <div style="display:flex;gap:8px;margin-bottom:24px;flex-wrap:wrap;">
          <button class="btn ${mode === 'vendor' ? 'btn-primary' : 'btn-ghost'}" data-action="setAnMode" data-mode="vendor">Vendor Comparison</button>
          <button class="btn ${mode === 'equipment' ? 'btn-primary' : 'btn-ghost'}" data-action="setAnMode" data-mode="equipment">Equipment Comparison</button>
          <button class="btn ${mode === 'cross' ? 'btn-primary' : 'btn-ghost'}" data-action="setAnMode" data-mode="cross">Vendor &gt; Equipment</button>
        </div>
        ${mode === 'cross' ? renderAnalyticsCross() : renderAnalyticsYoY()}
      </div>
    `;
  }

  function renderAnalyticsYoY() {
    const isVendorMode = state.analyticsMode === 'vendor';
    const years = getYears();
    const sortedYears = [...years].sort((a, b) => b - a);
    const yearB = state.anYearB || sortedYears[0];
    const yearA = state.anYearA || (sortedYears[1] || sortedYears[0]);
    const sameYear = yearA === yearB;
    const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + '$' + Math.abs(n).toFixed(2);
    const deltaColor = (n) => (n > 0 ? 'var(--color-accent-700)' : n < 0 ? 'var(--color-neutral-700)' : 'var(--color-text)');

    const lines = allLineItems();
    const keyOf = (li) => isVendorMode ? ((li.vendor || '').trim() || 'Unknown vendor') : (li.equipment || 'Unassigned');
    const agg = {};
    lines.forEach((li) => {
      if (!li.date) return;
      const y = parseInt(li.date.slice(0, 4), 10);
      if (y !== yearA && y !== yearB) return;
      const k = keyOf(li);
      if (!agg[k]) agg[k] = { a: 0, b: 0 };
      const amt = parseFloat(li.totalCost) || 0;
      if (sameYear) { agg[k].a += amt; agg[k].b += amt; } else agg[k][y === yearA ? 'a' : 'b'] += amt;
    });

    const term = state.anSearch.trim().toLowerCase();
    let rows = Object.keys(agg).map((k) => ({ name: k, a: agg[k].a, b: agg[k].b, delta: agg[k].b - agg[k].a })).filter((r) => (r.a > 0 || r.b > 0) && (!term || r.name.toLowerCase().includes(term)));

    const effSort = sameYear && (state.anSort === 'biggestIncrease' || state.anSort === 'biggestDecrease') ? 'most' : state.anSort;
    if (effSort === 'alpha') rows.sort((x, y) => x.name.localeCompare(y.name));
    else if (effSort === 'most') rows.sort((x, y) => y.b - x.b || y.a - x.a);
    else if (effSort === 'biggestDecrease') rows.sort((x, y) => x.delta - y.delta);
    else rows.sort((x, y) => y.delta - x.delta);

    const maxVal = Math.max(1, ...rows.map((r) => Math.max(r.a, r.b)));
    const totalA = rows.reduce((s, r) => s + r.a, 0);
    const totalB = rows.reduce((s, r) => s + r.b, 0);
    const totalDelta = totalB - totalA;
    const showDelta = !sameYear;

    return `
      <div style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap;margin-bottom:24px;">
        <div class="field" style="width:130px;"><label>Compare year</label><select class="input" data-action="setAnYearA" data-on="change">${yearOptionsHtml(yearA)}</select></div>
        <div class="field" style="width:130px;"><label>Against year</label><select class="input" data-action="setAnYearB" data-on="change">${yearOptionsHtml(yearB)}</select></div>
        <div class="field" style="flex:1;min-width:220px;"><label>Search</label><input class="input" id="an-search" data-action="setAnSearch" data-on="input" style="width:100%;" placeholder="${isVendorMode ? 'Search vendors…' : 'Search equipment…'}" value="${attr(state.anSearch)}"></div>
        <div class="field" style="width:190px;"><label>Sort by</label>
          <select class="input" data-action="setAnSort" data-on="change">
            ${!sameYear ? `<option value="biggestIncrease" ${effSort === 'biggestIncrease' ? 'selected' : ''}>Biggest increase</option><option value="biggestDecrease" ${effSort === 'biggestDecrease' ? 'selected' : ''}>Biggest decrease</option>` : ''}
            <option value="most" ${effSort === 'most' ? 'selected' : ''}>Highest total spend</option>
            <option value="alpha" ${effSort === 'alpha' ? 'selected' : ''}>Alphabetical</option>
          </select>
        </div>
      </div>
      ${sameYear ? `<div style="padding:12px 14px;border:2px solid var(--color-accent);background:var(--color-accent-100);margin-bottom:20px;font-size:14px;">${sortedYears.length < 2 ? `Only ${yearB} has expenses so far — showing single-year totals. Once another year has entries you can compare them here.` : `Both selectors are set to ${yearB} — pick a different year to compare against.`}</div>` : ''}
      <div style="display:flex;gap:20px;margin-bottom:20px;">
        ${showDelta ? `<div class="card" style="flex:1;"><div class="card-kicker">${yearA} total</div><div style="font-family:var(--font-heading);font-size:32px;">${fmt(totalA)}</div></div>` : ''}
        <div class="card" style="flex:1;"><div class="card-kicker">${yearB} total</div><div style="font-family:var(--font-heading);font-size:32px;">${fmt(totalB)}</div></div>
        ${showDelta ? `<div class="card" style="flex:1;"><div class="card-kicker">Change</div><div style="font-family:var(--font-heading);font-size:32px;color:${deltaColor(totalDelta)};">${signed(totalDelta)}</div><div class="card-meta">${totalA > 0 ? (totalDelta >= 0 ? '+' : '−') + Math.abs(Math.round((totalDelta / totalA) * 100)) + '% vs ' + yearA : ''}</div></div>` : ''}
      </div>
      <table class="table">
        <thead><tr><th>${isVendorMode ? 'Vendor' : 'Equipment'}</th><th style="width:26%;">Spend</th>${showDelta ? `<th style="text-align:right;">${yearA}</th>` : ''}<th style="text-align:right;">${yearB}</th>${showDelta ? '<th style="text-align:right;">Change</th>' : ''}</tr></thead>
        <tbody>
          ${rows.map((r) => `
            <tr>
              <td>${esc(r.name)}</td>
              <td><div style="display:flex;flex-direction:column;gap:4px;">
                ${showDelta ? `<div style="background:var(--color-neutral-100);height:10px;"><div style="background:var(--color-neutral-500);height:10px;width:${Math.round((r.a / maxVal) * 100)}%;"></div></div>` : ''}
                <div style="background:var(--color-neutral-100);height:10px;"><div style="background:var(--color-accent);height:10px;width:${Math.round((r.b / maxVal) * 100)}%;"></div></div>
              </div></td>
              ${showDelta ? `<td style="text-align:right;font-family:var(--font-heading);">${fmt(r.a)}</td>` : ''}
              <td style="text-align:right;font-family:var(--font-heading);">${fmt(r.b)}</td>
              ${showDelta ? `<td style="text-align:right;font-family:var(--font-heading);color:${deltaColor(r.delta)};">${signed(r.delta)}<div style="font-family:var(--font-body);font-size:12px;color:var(--color-neutral-700);">${r.a > 0 ? (r.delta >= 0 ? '+' : '−') + Math.abs(Math.round((r.delta / r.a) * 100)) + '%' : (r.b > 0 ? 'new' : '')}</div></td>` : ''}
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${showDelta ? `<div style="display:flex;gap:20px;margin-top:12px;font-size:12px;color:var(--color-neutral-700);"><div style="display:flex;align-items:center;gap:6px;"><div style="width:14px;height:10px;background:var(--color-neutral-500);"></div>${yearA}</div><div style="display:flex;align-items:center;gap:6px;"><div style="width:14px;height:10px;background:var(--color-accent);"></div>${yearB}</div></div>` : ''}
      ${rows.length === 0 ? `<div class="text-muted" style="margin-top:16px;">No spending recorded in either year.</div>` : ''}
    `;
  }

  function renderAnalyticsCross() {
    const lines = allLineItems();
    const vendor = state.anCrossVendor, equipment = state.anCrossEquipment;
    const vendorSet = new Set(); lines.forEach((li) => { if ((li.vendor || '').trim()) vendorSet.add(li.vendor.trim()); });
    const crossLines = lines.filter((li) => (!vendor || (li.vendor || '').trim() === vendor) && (!equipment || li.equipment === equipment));
    const byYear = {};
    crossLines.forEach((li) => {
      const y = li.date ? li.date.slice(0, 4) : 'No date';
      if (!byYear[y]) byYear[y] = { total: 0, count: 0 };
      byYear[y].total += parseFloat(li.totalCost) || 0;
      byYear[y].count += 1;
    });
    const yearKeys = Object.keys(byYear).sort();
    const maxCross = Math.max(1, ...yearKeys.map((y) => byYear[y].total));
    const rows = yearKeys.map((y, i) => {
      const prev = i > 0 ? byYear[yearKeys[i - 1]].total : null;
      const d = prev === null ? null : byYear[y].total - prev;
      return { year: y, total: byYear[y].total, count: byYear[y].count, barWidth: Math.round((byYear[y].total / maxCross) * 100) + '%', deltaFormatted: d === null ? '—' : ((d > 0 ? '+' : d < 0 ? '−' : '') + '$' + Math.abs(d).toFixed(2)), deltaColor: d === null ? 'var(--color-neutral-700)' : (d > 0 ? 'var(--color-accent-700)' : d < 0 ? 'var(--color-neutral-700)' : 'var(--color-text)') };
    }).reverse();
    const crossTotal = crossLines.reduce((s, li) => s + (parseFloat(li.totalCost) || 0), 0);

    return `
      <div style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap;margin-bottom:24px;">
        <div class="field" style="flex:1;min-width:240px;"><label>Vendor</label>
          <select class="input" style="width:100%;" data-action="setAnCrossVendor" data-on="change">
            <option value="">All vendors</option>
            ${[...vendorSet].sort((a, b) => a.localeCompare(b)).map((v) => `<option value="${attr(v)}" ${v === vendor ? 'selected' : ''}>${esc(v)}</option>`).join('')}
          </select>
        </div>
        <div class="field" style="flex:1;min-width:240px;"><label>Equipment</label>
          <select class="input" style="width:100%;" data-action="setAnCrossEquipment" data-on="change">
            <option value="">All equipment</option>
            ${state.equipment.map((e) => `<option value="${attr(e.name)}" ${e.name === equipment ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="card" style="margin-bottom:20px;">
        <div class="card-kicker">${esc(vendor || 'All vendors')} · ${esc(equipment || 'All equipment')} — all years</div>
        <div style="font-family:var(--font-heading);font-size:40px;">${fmt(crossTotal)}</div>
        <div class="card-meta">${crossLines.length}${crossLines.length === 1 ? ' line item' : ' line items'}</div>
      </div>
      <table class="table">
        <thead><tr><th>Year</th><th style="width:35%;">Spend</th><th style="text-align:right;">Total</th><th style="text-align:right;">Lines</th><th style="text-align:right;">vs prior year</th></tr></thead>
        <tbody>
          ${rows.map((r) => `<tr><td style="font-family:var(--font-heading);">${r.year}</td><td><div style="background:var(--color-neutral-100);height:16px;"><div style="background:var(--color-accent);height:16px;width:${r.barWidth};"></div></div></td><td style="text-align:right;font-family:var(--font-heading);">${fmt(r.total)}</td><td style="text-align:right;">${r.count}</td><td style="text-align:right;color:${r.deltaColor};">${r.deltaFormatted}</td></tr>`).join('')}
        </tbody>
      </table>
      ${rows.length === 0 ? `<div class="text-muted" style="margin-top:16px;">No expenses match that vendor and equipment combination.</div>` : ''}
      ${crossLines.length ? `
        <h2 style="font-size:20px;margin:32px 0 12px;">Line items</h2>
        <table class="table">
          <thead><tr><th>Date</th><th>Part</th><th>Vendor</th><th>Equipment</th><th style="text-align:right;">Qty</th><th style="text-align:right;">Total</th></tr></thead>
          <tbody>
            ${[...crossLines].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((li) => `<tr><td>${esc(li.date || '—')}</td><td>${esc(li.part || '—')}</td><td>${esc(li.vendor || '—')}</td><td>${esc(li.equipment || '—')}</td><td style="text-align:right;">${esc(li.qty || '')}</td><td style="text-align:right;font-family:var(--font-heading);">${fmt(li.totalCost)}</td></tr>`).join('')}
          </tbody>
        </table>
      ` : ''}
    `;
  }

  // ---------------------------------------------------------------- settings

  function settingsSectionHeader(label, addBtnHtml) {
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h2 style="font-size:20px;margin:0;">${label}</h2>
        ${addBtnHtml || ''}
      </div>
    `;
  }

  function renderDriveBackupSection() {
    const isError = /failed|expired|Add your|Could not/i.test(state.driveMessage || '');
    if (!state.driveClientId) {
      const setupInfo = `One-time setup, done once per Google account: create an OAuth Client ID (Web
        application) at <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">console.cloud.google.com/apis/credentials</a>,
        enable the "Google Drive API" for that project, and under "Authorized JavaScript origins" add
        <code>${esc(window.location.origin)}</code>. The app will only ever be able to see or edit the
        one backup file it creates for itself, never the rest of your Drive.`;
      return `
        <div class="card" style="padding:16px 20px;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:12px;">
            <div class="card-title">Google Drive</div>
            ${infoIcon('drive-setup', setupInfo)}
          </div>
          ${driveSetupFields()}
          ${state.driveMessage ? `<div style="margin-top:10px;font-size:13px;color:${isError ? 'var(--color-accent-700)' : 'var(--color-neutral-700)'};">${esc(state.driveMessage)}</div>` : ''}
        </div>
      `;
    }
    const canChooseFolder = state.driveApiKey && state.driveAppId;
    const statusInfo = `This is where your data actually lives — every change auto-saves here every 15
      seconds. Use the icons in the header to save or download the latest on demand.`;
    const apiKeyInfo = `Needed only for "Select folder". Create an API key on the same credentials page,
      enable "Picker API" in the Library, then under "API restrictions" allow both "Picker API" and
      "Google Drive API".`;
    const appIdInfo = `Your Cloud project's project number (not the project ID, not the Client ID) —
      found on the Cloud Console dashboard. Needed alongside the API key for "Select folder" to work
      reliably.`;
    return `
      <div class="card" style="padding:16px 20px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:12px;">
          <div class="card-title">Google Drive</div>
          ${infoIcon('drive-status', statusInfo)}
        </div>
        <div style="margin-bottom:8px;">Last saved to Drive: <strong>${state.driveLastBackupAt ? new Date(state.driveLastBackupAt).toLocaleString() : 'Never'}</strong></div>
        <div style="margin-bottom:12px;">Backup folder: <strong>${state.driveFolderName ? esc(state.driveFolderName) : 'My Drive (root)'}</strong></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-primary" data-action="driveBackupNow" ${state.driveBusy ? 'disabled' : ''}>${state.driveBusy ? 'Working…' : 'Save now'}</button>
          <button class="btn btn-secondary" data-action="chooseDriveFolder" ${state.driveBusy || !canChooseFolder ? 'disabled' : ''} title="${canChooseFolder ? '' : 'Add a Google API key and project number below to enable this'}">Select folder</button>
          ${state.driveFolderId ? `<button class="btn btn-ghost" data-action="clearDriveFolder">Use Drive root</button>` : ''}
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:16px;padding-top:16px;border-top:1px solid var(--color-divider);">
          <div class="field" style="flex:1;min-width:220px;">
            <label style="display:flex;align-items:center;gap:6px;">Google API key ${state.driveApiKey ? '(set)' : ''} ${infoIcon('drive-apikey', apiKeyInfo)}</label>
            <input class="input" id="drive-api-key" data-action="setDriveApiKeyDraft" data-on="input" value="${attr(state.driveApiKeyDraft)}" placeholder="${state.driveApiKey ? '••••••••••••' : 'AIza…'}">
          </div>
          <div class="field" style="flex:1;min-width:220px;">
            <label style="display:flex;align-items:center;gap:6px;">Google Cloud project number ${state.driveAppId ? '(set)' : ''} ${infoIcon('drive-appid', appIdInfo)}</label>
            <input class="input" id="drive-app-id" data-action="setDriveAppIdDraft" data-on="input" value="${attr(state.driveAppIdDraft)}" placeholder="${state.driveAppId ? state.driveAppId : 'e.g. 123456789012'}">
          </div>
          <div><button class="btn btn-secondary" data-action="saveDriveApiKey" ${!state.driveApiKeyDraft.trim() && !state.driveAppIdDraft.trim() ? 'disabled' : ''}>Save</button></div>
        </div>
        ${state.driveMessage ? `<div style="margin-top:10px;font-size:13px;color:${isError ? 'var(--color-accent-700)' : 'var(--color-neutral-700)'};">${esc(state.driveMessage)}</div>` : ''}
      </div>
    `;
  }

  function renderLocalFolderSection() {
    if (!LocalStore.supported()) {
      return `
        <div class="card" style="padding:16px 20px;">
          <div class="card-title" style="margin-bottom:8px;">Local</div>
          <div style="color:var(--color-neutral-700);font-size:14px;line-height:1.5;">
            This browser doesn't support picking a local folder to save to — that needs Chrome or Edge on a
            computer. Try Google Drive instead, or open this app in a supported browser.
          </div>
        </div>
      `;
    }
    const statusInfo = `Saves one file (farm-fleet-expenses-backup.json) directly into a folder you
      choose. Only works in this browser, on this device — nothing syncs anywhere else, and only
      Chrome/Edge support it. Use the icons in the header to save or download the latest on demand.`;
    return `
      <div class="card" style="padding:16px 20px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:12px;">
          <div class="card-title">Local</div>
          ${infoIcon('local-status', statusInfo)}
        </div>
        <div style="margin-bottom:8px;">Folder: <strong>${state.localFolderName ? esc(state.localFolderName) : 'Not chosen yet'}</strong></div>
        <div style="margin-bottom:12px;">Last saved: <strong>${state.localLastSavedAt ? new Date(state.localLastSavedAt).toLocaleString() : 'Never'}</strong></div>
        ${state.localNeedsReconnect ? `<div style="margin-bottom:12px;padding:12px 16px;border:2px solid var(--color-accent);color:var(--color-accent-700);font-size:13px;">This browser needs you to reconnect to the folder before it can load or save — click "Select folder" and pick the same one again.</div>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-primary" data-action="${state.localFolderName ? 'confirmChangeLocalFolder' : 'chooseLocalFolder'}" ${state.localBusy ? 'disabled' : ''}>${state.localBusy ? 'Working…' : 'Select folder'}</button>
          ${state.localFolderName ? `<button class="btn btn-secondary" data-action="localSaveNow" ${state.localBusy ? 'disabled' : ''}>Save now</button>` : ''}
        </div>
        ${state.localMessage ? `<div style="margin-top:10px;font-size:13px;color:var(--color-neutral-700);">${esc(state.localMessage)}</div>` : ''}
      </div>
    `;
  }

  function renderStorageSection() {
    const modes = [
      { key: 'drive', label: 'Google Drive' },
      { key: 'local', label: 'Local' },
    ];
    const locked = state.storageMode !== 'none' && !state.storageChangeConfirming;
    const currentLabel = (modes.find((m) => m.key === state.storageMode) || {}).label || '';
    const modeInfo = `Whatever's selected is where changes save automatically every 15 seconds, and
      where the app loads its data from every time it opens. Switching doesn't erase anything — it just
      changes where future saves go, and it's locked once set so it doesn't get changed by accident.`;
    return `
      <div class="card" style="padding:16px 20px;margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:12px;">
          <div class="card-title">Where your data lives</div>
          ${infoIcon('storage-mode', modeInfo)}
        </div>
        ${locked ? `
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <div>Connected to: <strong>${esc(currentLabel)}</strong></div>
            <button class="btn btn-ghost" data-action="startChangeStorage">Change location</button>
          </div>
        ` : `
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${modes.map((m) => `<button class="btn ${state.storageMode === m.key ? 'btn-primary' : 'btn-ghost'}" data-action="setStorageMode" data-mode="${m.key}">${m.label}</button>`).join('')}
            ${state.storageMode !== 'none' ? `<button class="btn btn-ghost" data-action="cancelChangeStorage">Cancel</button>` : ''}
          </div>
        `}
      </div>
      ${state.storageMode === 'drive' ? renderDriveBackupSection() : ''}
      ${state.storageMode === 'local' ? renderLocalFolderSection() : ''}
    `;
  }

  function renderSettings() {
    const eqRows = [...state.equipment].sort((a, b) => alphaSort(a.name, b.name));
    const catBody = `
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
        ${state.categories.map((cat) => `
          <div class="card" style="padding:8px 14px;display:flex;flex-direction:row;align-items:center;gap:12px;">
            <div style="width:8px;height:8px;border-radius:50%;background:${cat.color};flex-shrink:0;"></div>
            <div class="card-title" style="font-size:15px;flex:1 1 auto;min-width:0;">${esc(cat.name)}</div>
            <div class="card-meta">${state.equipment.filter((e) => e.category === cat.name).length} equipment</div>
            <button class="btn-icon" data-action="openCategoryEditModal" data-id="${cat.id}" aria-label="Edit category">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path><path d="m15 5 4 4"></path></svg>
            </button>
          </div>
        `).join('')}
      </div>
    `;
    const eqBody = eqRows.map((eq) => `
      <div class="card" style="margin-bottom:6px;padding:8px 14px;">
        <div style="display:flex;flex-direction:row;align-items:center;gap:12px;">
          <div class="card-title" style="font-size:15px;flex:1 1 auto;min-width:0;">${esc(eq.name)}</div>
          <div class="card-meta">${esc(eq.category)}</div>
          <div style="display:flex;gap:4px;">${serviceDotsFor(eq).map((d) => `<span title="${attr(d.name)}" style="width:10px;height:10px;background:${d.color};display:inline-block;"></span>`).join('')}</div>
          <button class="btn-icon" data-action="startEditEquipment" data-id="${eq.id}" aria-label="Edit equipment">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path><path d="m15 5 4 4"></path></svg>
          </button>
          ${trashButton('confirmDeleteEquipment', 'Delete equipment', `data-id="${eq.id}"`)}
        </div>
        ${state.confirmDeleteFor === eq.id ? `
          <div style="margin-top:12px;padding:16px;border:2px solid var(--color-accent);display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <div style="color:var(--color-accent-700);">Delete ${esc(eq.name)} and all its recorded expenses? This can't be undone.</div>
            <button class="btn btn-primary" data-action="deleteEquipment" data-id="${eq.id}">Delete equipment</button>
            <button class="btn btn-ghost" data-action="cancelDeleteEquipment">Cancel</button>
          </div>` : ''}
      </div>
    `).join('');
    const supBody = state.suppliers.map((sup) => `
      <div class="card" style="margin-bottom:6px;padding:8px 14px;">
        <div style="display:flex;flex-direction:row;align-items:center;gap:12px;">
          <div class="card-title" style="font-size:15px;flex:1 1 auto;min-width:0;">${esc(sup.name)}</div>
          <button class="btn-icon" data-action="openSupplierEditModal" data-id="${sup.id}" aria-label="Edit supplier">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path><path d="m15 5 4 4"></path></svg>
          </button>
          ${trashButton('confirmDeleteSupplier', 'Delete supplier', `data-id="${sup.id}"`)}
        </div>
        ${state.confirmDeleteSupplierFor === sup.id ? `
          <div style="margin-top:12px;padding:16px;border:2px solid var(--color-accent);display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <div style="color:var(--color-accent-700);">Remove ${esc(sup.name)} from the supplier list?</div>
            <button class="btn btn-primary" data-action="deleteSupplier" data-id="${sup.id}">Remove</button>
            <button class="btn btn-ghost" data-action="cancelDeleteSupplier">Cancel</button>
          </div>` : ''}
      </div>
    `).join('');
    const TABS = [
      { key: 'general', label: 'General' },
      { key: 'categories', label: 'Categories' },
      { key: 'equipment', label: 'Equipment' },
      { key: 'suppliers', label: 'Suppliers' },
      { key: 'backup', label: 'Storage' },
    ];
    const tab = TABS.some((t) => t.key === state.settingsTab) ? state.settingsTab : 'general';

    let body;
    if (tab === 'general') {
      body = `
        <div class="card" style="margin-bottom:24px;">
          <div class="card-title">Settings password</div>
          <div class="card-body" style="margin:8px 0 16px;color:var(--color-neutral-700);">Anyone who knows this password can open Settings. Change it here — it's stored only in this browser.</div>
          <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;">
            <div class="field" style="flex:1;max-width:240px;"><label>New password</label><input class="input" id="change-password-draft" data-action="setChangePasswordDraft" data-on="input" value="${attr(state.changePasswordDraft)}"></div>
            <button class="btn btn-secondary" data-action="saveChangePassword" ${!state.changePasswordDraft.trim() ? 'disabled' : ''}>Update password</button>
          </div>
        </div>
        <div class="card">
          <div class="card-title">Support</div>
          <div class="card-body" style="margin:8px 0 0;color:var(--color-neutral-700);">
            Contact us for support at <a href="mailto:electrical@veterancolony.com">electrical@veterancolony.com</a>.
            Support is not free and is billed at $120/hour, one-hour minimum.
          </div>
        </div>
      `;
    } else if (tab === 'categories') {
      body = settingsSectionHeader('Categories', `<button class="btn btn-secondary" data-action="openCategoryAddModal">+ Add category</button>`) + catBody;
    } else if (tab === 'equipment') {
      body = settingsSectionHeader('Equipment', `<button class="btn btn-secondary" data-action="openAddEquipmentModal">+ Add equipment</button>`) + eqBody;
    } else if (tab === 'suppliers') {
      body = settingsSectionHeader('Suppliers', `<button class="btn btn-secondary" data-action="openSupplierAddModal">+ Add supplier</button>`) + supBody;
    } else {
      body = settingsSectionHeader('Storage', `<button class="btn btn-secondary" data-action="backupNow">Download JSON</button>`) + `
        <div class="card" style="padding:16px 20px;margin-bottom:16px;">
          <div style="color:var(--color-neutral-700);font-size:14px;line-height:1.5;">Downloads a single JSON file with everything currently loaded — every category, equipment record, expense, and supplier. Whatever's picked below is the real, always-current copy; this is just a manual export for your own records.</div>
        </div>
        ${renderStorageSection()}
      `;
    }

    return `
      <div style="padding:40px 32px;max-width:900px;width:100%;margin:0 auto;box-sizing:border-box;">
        <h1 style="font-size:28px;margin:0 0 20px;">Settings</h1>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:28px;padding-bottom:20px;border-bottom:2px solid var(--color-divider);">
          ${TABS.map((t) => `<button class="btn ${tab === t.key ? 'btn-primary' : 'btn-ghost'}" data-action="setSettingsTab" data-tab="${t.key}">${t.label}</button>`).join('')}
        </div>
        ${body}
      </div>
    `;
  }

  // ---------------------------------------------------------------- modals

  function filterRowsHtml(prefix, filters) {
    return `
      ${(filters || []).map((f, i) => `
        <div style="display:flex;gap:8px;margin-bottom:8px;">
          <input class="input" id="${prefix}-filter-${i}-type" style="flex:1 1 0;min-width:0;" placeholder="Filter type (e.g. Air, Oil, Fuel)" data-action="${prefix}UpdateFilter" data-index="${i}" data-field="type" data-on="input" value="${attr(f.type)}">
          <input class="input" id="${prefix}-filter-${i}-partNumber" style="flex:1 1 0;min-width:0;" placeholder="Part number" data-action="${prefix}UpdateFilter" data-index="${i}" data-field="partNumber" data-on="input" value="${attr(f.partNumber)}">
          ${trashButton(prefix + 'RemoveFilter', 'Remove filter', `data-index="${i}"`)}
        </div>
      `).join('')}
      <button class="btn btn-ghost" data-action="${prefix}AddFilter">+ Add filter type</button>
    `;
  }

  function serviceRowsHtml(prefix, services) {
    return `
      <div class="card-meta" style="margin-bottom:10px;">Name the service, how often it is due in hours, and the hour reading at the last change.</div>
      ${(services || []).map((sv, i) => `
        <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center;">
          <input class="input" id="${prefix}-service-${i}-name" style="flex:1 1 auto;min-width:0;" placeholder="e.g. Engine oil" data-action="${prefix}UpdateService" data-index="${i}" data-field="name" data-on="input" value="${attr(sv.name)}">
          <input class="input" id="${prefix}-service-${i}-interval" style="width:150px;flex:0 0 auto;" type="number" step="1" placeholder="Every hrs" data-action="${prefix}UpdateService" data-index="${i}" data-field="interval" data-on="input" value="${attr(sv.interval)}">
          <input class="input" id="${prefix}-service-${i}-lastHours" style="width:160px;flex:0 0 auto;" type="number" step="0.1" placeholder="Last at hrs" data-action="${prefix}UpdateService" data-index="${i}" data-field="lastHours" data-on="input" value="${attr(sv.lastHours)}">
          ${trashButton(prefix + 'RemoveService', 'Remove service interval', `data-index="${i}"`)}
        </div>
      `).join('')}
      <button class="btn btn-ghost" data-action="${prefix}AddService">+ Add service interval</button>
    `;
  }

  function renderEquipmentModal(prefix, draft, title, saveAction, saveLabel, saveDisabled) {
    return `
      <div class="dialog-backdrop">
        <div class="dialog" style="max-width:900px;width:92vw;">
          <div class="dialog-title">${title}</div>
          <div class="dialog-body" style="display:flex;flex-direction:column;gap:16px;">
            <div class="field"><label>Name</label><input class="input" id="${prefix}-name" data-action="${prefix}Update" data-field="name" data-on="input" value="${attr(draft.name)}" placeholder="e.g. Combine 5"></div>
            <div style="display:flex;gap:16px;">
              <div class="field" style="flex:1;"><label>Make</label><input class="input" id="${prefix}-make" data-action="${prefix}Update" data-field="make" data-on="input" value="${attr(draft.make)}" placeholder="e.g. John Deere"></div>
              <div class="field" style="flex:1;"><label>Model</label><input class="input" id="${prefix}-model" data-action="${prefix}Update" data-field="model" data-on="input" value="${attr(draft.model)}" placeholder="e.g. 9430"></div>
            </div>
            <div class="field"><label>Category</label>
              <select class="input" id="${prefix}-category" data-action="${prefix}Update" data-field="category" data-on="change">
                ${state.categories.map((c) => `<option value="${attr(c.name)}" ${c.name === draft.category ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
              </select>
            </div>
            <div class="field"><label>VIN / Serial number</label><input class="input" id="${prefix}-vin" data-action="${prefix}Update" data-field="vin" data-on="input" value="${attr(draft.vin)}"></div>
            <div class="field"><label>Notes</label><textarea class="input" id="${prefix}-info" rows="3" data-action="${prefix}Update" data-field="info" data-on="input">${esc(draft.info)}</textarea></div>
            <div class="field"><label>Filters</label>${filterRowsHtml(prefix, draft.filters)}</div>
            <div class="field"><label>Service intervals</label>${serviceRowsHtml(prefix, draft.services)}</div>
            <div class="field">
              <label>User manual</label>
              ${draft.manual ? `
                <div style="display:flex;align-items:center;gap:10px;">
                  <a href="${draft.manual.dataUrl}" target="_blank" rel="noopener" download="${attr(draft.manual.fileName)}">${esc(draft.manual.fileName)}</a>
                  ${trashButton(prefix + 'RemoveManual', 'Remove manual')}
                </div>
              ` : `<input type="file" id="${prefix}-manual-file" accept="application/pdf,image/*" data-action="${prefix}UpdateManual" data-on="change">`}
              ${draft.manualError ? `<div style="color:var(--color-accent-700);font-size:13px;margin-top:4px;">${esc(draft.manualError)}</div>` : ''}
            </div>
          </div>
          <div class="dialog-actions">
            <button class="btn btn-ghost" data-action="${prefix}Cancel">Cancel</button>
            <button class="btn btn-primary" data-action="${saveAction}" ${saveDisabled ? 'disabled' : ''}>${saveLabel}</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderCategoryModal(prefix, draft, title, saveAction, saveLabel, saveDisabled) {
    return `
      <div class="dialog-backdrop">
        <div class="dialog">
          <div class="dialog-title">${title}</div>
          <div class="dialog-body">
            <div class="field"><label>Name</label><input class="input" id="${prefix}-name" data-action="${prefix}Update" data-field="name" data-on="input" value="${attr(draft.name)}" placeholder="e.g. Sprayer"></div>
            <div class="field">
              <label>Color</label>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                ${COLOR_SWATCHES.map((sw) => `<button data-action="${prefix}Color" data-color="${attr(sw)}" style="width:32px;height:32px;border-radius:50%;background:${sw};cursor:pointer;border:${sw === draft.color ? '3px solid var(--color-text)' : '3px solid transparent'};"></button>`).join('')}
              </div>
            </div>
          </div>
          <div class="dialog-actions">
            <button class="btn btn-ghost" data-action="${prefix}Cancel">Cancel</button>
            <button class="btn btn-primary" data-action="${saveAction}" ${saveDisabled ? 'disabled' : ''}>${saveLabel}</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderModals() {
    let html = '';
    if (state.editModalOpenFor) {
      const d = state.editModalDraft;
      html += renderEquipmentModal('edit', d, 'Edit equipment', 'saveEditModal', 'Save', !d.name.trim());
    }
    if (state.addModalOpen) {
      const d = state.addModalDraft;
      html += renderEquipmentModal('add', d, 'Add equipment', 'saveAddModal', 'Add equipment', !d.name.trim());
    }
    if (state.categoryAddModalOpen) {
      const d = state.categoryAddDraft;
      html += renderCategoryModal('categoryAdd', d, 'Add category', 'saveCategoryAdd', 'Add category', !d.name.trim());
    }
    if (state.categoryEditModalOpenFor) {
      html += renderCategoryModal('categoryEdit', { name: state.categoryEditDraft, color: state.categoryEditColorDraft }, 'Rename category', 'saveCategoryEdit', 'Save', !state.categoryEditDraft.trim());
    }
    if (state.supplierAddModalOpen) {
      html += `
        <div class="dialog-backdrop"><div class="dialog">
          <div class="dialog-title">Add supplier</div>
          <div class="dialog-body" style="display:flex;flex-direction:column;gap:16px;">
            <div class="field"><label>Name</label><input class="input" id="supplier-add-name" data-action="supplierAddUpdate" data-on="input" value="${attr(state.supplierAddDraft)}" placeholder="e.g. Ag Parts Co."></div>
          </div>
          <div class="dialog-actions"><button class="btn btn-ghost" data-action="supplierAddCancel">Cancel</button><button class="btn btn-primary" data-action="saveSupplierAdd" ${!state.supplierAddDraft.trim() ? 'disabled' : ''}>Add supplier</button></div>
        </div></div>`;
    }
    if (state.supplierEditModalOpenFor) {
      html += `
        <div class="dialog-backdrop"><div class="dialog">
          <div class="dialog-title">Rename supplier</div>
          <div class="dialog-body" style="display:flex;flex-direction:column;gap:16px;">
            <div class="field"><label>Name</label><input class="input" id="supplier-edit-name" data-action="supplierEditUpdate" data-on="input" value="${attr(state.supplierEditDraft)}"></div>
          </div>
          <div class="dialog-actions"><button class="btn btn-ghost" data-action="supplierEditCancel">Cancel</button><button class="btn btn-primary" data-action="saveSupplierEdit" ${!state.supplierEditDraft.trim() ? 'disabled' : ''}>Save</button></div>
        </div></div>`;
    }
    if (state.settingsPasswordModalOpen) {
      html += `
        <div class="dialog-backdrop"><div class="dialog">
          <div class="dialog-title">Enter settings password</div>
          <div class="dialog-body">
            <div class="field"><label>Password</label><input class="input" id="settings-password-input" type="password" data-action="settingsPasswordChange" data-on="input" value="${attr(state.settingsPasswordInput)}"></div>
            ${state.settingsPasswordError ? `<div style="color:var(--color-accent-700);font-size:13px;">Incorrect password.</div>` : ''}
          </div>
          <div class="dialog-actions"><button class="btn btn-ghost" data-action="settingsPasswordCancel">Cancel</button><button class="btn btn-primary" data-action="settingsPasswordSubmit">Unlock</button></div>
        </div></div>`;
    }
    if (state.restoreConfirmOpen) {
      const sourceLabel = state.storageMode === 'drive' ? 'Google Drive' : 'your local folder';
      html += `
        <div class="dialog-backdrop"><div class="dialog">
          <div class="dialog-title">Download latest?</div>
          <div class="dialog-body">This replaces everything currently loaded with what's saved in ${esc(sourceLabel)}. Any changes not yet saved will be lost.</div>
          <div class="dialog-actions"><button class="btn btn-ghost" data-action="cancelRestoreLatest">Cancel</button><button class="btn btn-primary" data-action="doRestoreLatest">Download</button></div>
        </div></div>`;
    }
    if (state.localFolderChangeConfirming) {
      html += `
        <div class="dialog-backdrop"><div class="dialog">
          <div class="dialog-title">Change folder?</div>
          <div class="dialog-body">If the folder you pick next already has a backup file in it, that data will load in and replace what's here. If it doesn't, what's currently loaded will be saved there instead. Auto-save will start going to the new folder from then on — this device won't touch "${esc(state.localFolderName)}" again unless you pick it back.</div>
          <div class="dialog-actions"><button class="btn btn-ghost" data-action="cancelChangeLocalFolder">Cancel</button><button class="btn btn-primary" data-action="chooseLocalFolder">Continue</button></div>
        </div></div>`;
    }
    if (state.storageChangeAuthOpen) {
      html += `
        <div class="dialog-backdrop"><div class="dialog">
          <div class="dialog-title">Confirm password</div>
          <div class="dialog-body">Changing your storage location can affect where your data loads from. Enter the settings password to continue.</div>
          <div class="field"><label>Password</label><input class="input" id="storage-change-auth-input" type="password" data-action="setStorageChangeAuthInput" data-on="input" value="${attr(state.storageChangeAuthInput)}"></div>
          ${state.storageChangeAuthError ? `<div style="color:var(--color-accent-700);font-size:13px;">Incorrect password.</div>` : ''}
          <div class="dialog-actions"><button class="btn btn-ghost" data-action="cancelStorageChangeAuth">Cancel</button><button class="btn btn-primary" data-action="submitStorageChangeAuth">Confirm</button></div>
        </div></div>`;
    }
    return html;
  }

  // ---------------------------------------------------------------- data mutation helpers

  function mutate(fn) {
    try {
      fn();
      state.loadError = '';
    } catch (e) {
      state.loadError = e.message;
    }
    render();
  }

  function equipmentDraftPayload(d) {
    return { name: d.name.trim(), category: d.category, make: d.make, model: d.model, vin: d.vin, info: d.info, filters: d.filters, services: d.services, manual: d.manual || null };
  }

  // A manual is embedded directly in the equipment record as a data URL, so
  // it's backed up and restored with everything else through the same JSON
  // file — no separate upload plumbing needed. Capped well under what a
  // single Drive/local-folder JSON write should comfortably handle.
  const MAX_MANUAL_BYTES = 15 * 1024 * 1024;

  // ---------------------------------------------------------------- edit/add equipment modal shared logic

  function draftFor(prefix) { return prefix === 'edit' ? state.editModalDraft : state.addModalDraft; }

  function registerEquipmentModalActions(prefix) {
    Actions[prefix + 'Update'] = (e, d) => { draftFor(prefix)[d.field] = e.target.value; render(); };
    Actions[prefix + 'AddFilter'] = () => { draftFor(prefix).filters.push({ type: '', partNumber: '' }); render(); };
    Actions[prefix + 'UpdateFilter'] = (e, d) => { draftFor(prefix).filters[Number(d.index)][d.field] = e.target.value; render(); };
    Actions[prefix + 'RemoveFilter'] = (e, d) => { draftFor(prefix).filters.splice(Number(d.index), 1); render(); };
    Actions[prefix + 'AddService'] = () => { draftFor(prefix).services.push({ name: '', interval: '', lastHours: '' }); render(); };
    Actions[prefix + 'UpdateService'] = (e, d) => { draftFor(prefix).services[Number(d.index)][d.field] = e.target.value; render(); };
    Actions[prefix + 'RemoveService'] = (e, d) => { draftFor(prefix).services.splice(Number(d.index), 1); render(); };
    Actions[prefix + 'UpdateManual'] = (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const draft = draftFor(prefix);
      if (file.size > MAX_MANUAL_BYTES) {
        draft.manualError = 'That file is too large (max 15 MB).';
        render();
        return;
      }
      draft.manualError = '';
      const reader = new FileReader();
      reader.onload = () => {
        draft.manual = { fileName: file.name, mimeType: file.type || 'application/octet-stream', dataUrl: reader.result };
        render();
      };
      reader.onerror = () => { draft.manualError = 'Could not read that file.'; render(); };
      reader.readAsDataURL(file);
    };
    Actions[prefix + 'RemoveManual'] = () => { draftFor(prefix).manual = null; draftFor(prefix).manualError = ''; render(); };
  }

  function registerCategoryModalActions(prefix, getDraft) {
    Actions[prefix + 'Update'] = (e) => { getDraft().name = e.target.value; render(); };
    Actions[prefix + 'Color'] = (e, d) => { getDraft().color = d.color; render(); };
  }

  // ---------------------------------------------------------------- actions

  const Actions = {
    setView(e, d) {
      state.view = d.view;
      state.manageOpenFor = null;
      if (d.view !== 'history') state.selectedCategory = null;
      render();
    },
    settingsClick() {
      if (state.settingsUnlocked) { state.view = 'settings'; render(); return; }
      state.settingsPasswordModalOpen = true;
      state.settingsPasswordInput = '';
      state.settingsPasswordError = false;
      render();
    },
    settingsPasswordChange(e) { state.settingsPasswordInput = e.target.value; state.settingsPasswordError = false; render(); },
    settingsPasswordCancel() { state.settingsPasswordModalOpen = false; render(); },
    settingsPasswordSubmit() {
      if (state.settingsPasswordInput === state.settingsPassword) {
        state.settingsUnlocked = true;
        state.settingsPasswordModalOpen = false;
        state.view = 'settings';
      } else {
        state.settingsPasswordError = true;
      }
      render();
    },
    setChangePasswordDraft(e) { state.changePasswordDraft = e.target.value; render(); },
    saveChangePassword() {
      mutate(() => {
        Store.changeSettingsPassword(state.changePasswordDraft);
        state.changePasswordDraft = '';
      });
    },
    backupNow() {
      try {
        const payload = buildBackupPayload();
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'farm-fleet-backup-' + todayIso() + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) { /* ignore */ }
      render();
    },
    dismissError() { state.loadError = ''; render(); },

    setDriveClientIdDraft(e) { state.driveClientIdDraft = e.target.value; render(); },
    setDriveApiKeyDraft(e) { state.driveApiKeyDraft = e.target.value; render(); },
    setDriveAppIdDraft(e) { state.driveAppIdDraft = e.target.value; render(); },
    async saveDriveSetup() {
      const id = state.driveClientIdDraft.trim();
      if (!id) return;
      state.driveClientId = id;
      state.driveApiKey = state.driveApiKeyDraft.trim();
      state.driveAppId = state.driveAppIdDraft.trim();
      state.driveClientIdDraft = '';
      state.driveApiKeyDraft = '';
      state.driveAppIdDraft = '';
      state.driveFileId = '';
      state.driveMessage = '';
      persistDriveConfig();
      state.driveBusy = true;
      render();
      try {
        await loadOrInitFromDrive(true);
        state.driveMessage = 'Connected to Google Drive.';
      } catch (err) {
        state.driveMessage = err.message === 'UNAUTHORIZED'
          ? 'Google sign-in was cancelled or access was denied — try again.'
          : ('Could not connect: ' + err.message);
      }
      state.driveBusy = false;
      render();
    },
    saveDriveApiKey() {
      const key = state.driveApiKeyDraft.trim();
      const appId = state.driveAppIdDraft.trim();
      if (!key && !appId) return;
      if (key) state.driveApiKey = key;
      if (appId) state.driveAppId = appId;
      state.driveApiKeyDraft = '';
      state.driveAppIdDraft = '';
      state.driveMessage = '';
      persistDriveConfig();
      render();
    },
    async chooseDriveFolder() {
      if (!state.driveApiKey || !state.driveAppId) { state.driveMessage = 'Add a Google API key and project number above to enable folder selection.'; render(); return; }
      state.driveBusy = true;
      state.driveMessage = '';
      render();
      try {
        const folder = await Drive.pickFolder(state.driveClientId, state.driveApiKey, state.driveAppId, false);
        if (folder) {
          state.driveFolderId = folder.id;
          state.driveFolderName = folder.name;
          state.driveFileId = ''; // re-resolve (or create fresh) inside the newly chosen folder
          state.driveMessage = 'Backup folder set to "' + folder.name + '".';
          persistDriveConfig();
        }
      } catch (err) {
        state.driveMessage = 'Could not open folder picker: ' + err.message;
      }
      state.driveBusy = false;
      render();
    },
    clearDriveFolder() {
      state.driveFolderId = '';
      state.driveFolderName = '';
      state.driveFileId = '';
      state.driveMessage = '';
      persistDriveConfig();
      render();
    },
    async driveBackupNow() {
      if (state.driveBusy) return;
      state.driveBusy = true;
      state.driveMessage = '';
      render();
      try {
        const payload = buildBackupPayload();
        const fileId = await Drive.backup(state.driveClientId, state.driveFileId, payload, false, state.driveFolderId);
        state.driveFileId = fileId;
        state.driveLastBackupAt = new Date().toISOString();
        const staleFolder = handleStaleDriveFolder();
        state.driveMessage = staleFolder
          ? 'Backed up to Google Drive — the saved folder wasn’t reachable, so this went to "My Drive" root instead.'
          : 'Backed up to Google Drive.';
        state.loadError = '';
        dataDirty = false;
        persistDriveConfig();
        showDriveToast('Backed up to Google Drive.');
      } catch (err) {
        const msg = err.message === 'UNAUTHORIZED'
          ? 'Google Drive access expired or was denied — try again to reconnect.'
          : ('Backup failed: ' + err.message);
        state.driveMessage = msg;
        state.loadError = msg;
      }
      state.driveBusy = false;
      render();
    },
    toggleInfo(e, d) {
      state.openInfoId = state.openInfoId === d.infoId ? null : d.infoId;
      render();
    },

    startChangeStorage() {
      state.storageChangeAuthPending = 'mode';
      state.storageChangeAuthOpen = true;
      state.storageChangeAuthInput = '';
      state.storageChangeAuthError = false;
      render();
    },
    cancelChangeStorage() { state.storageChangeConfirming = false; render(); },
    setStorageChangeAuthInput(e) { state.storageChangeAuthInput = e.target.value; state.storageChangeAuthError = false; render(); },
    cancelStorageChangeAuth() {
      state.storageChangeAuthOpen = false;
      state.storageChangeAuthPending = null;
      state.storageChangeAuthInput = '';
      render();
    },
    submitStorageChangeAuth() {
      if (state.storageChangeAuthInput !== state.settingsPassword) {
        state.storageChangeAuthError = true;
        render();
        return;
      }
      const pending = state.storageChangeAuthPending;
      state.storageChangeAuthOpen = false;
      state.storageChangeAuthPending = null;
      state.storageChangeAuthInput = '';
      if (pending === 'mode') state.storageChangeConfirming = true;
      else if (pending === 'folder') state.localFolderChangeConfirming = true;
      render();
    },
    setStorageMode(e, d) {
      state.storageMode = d.mode;
      state.storageChangeConfirming = false;
      state.driveMessage = '';
      state.localMessage = '';
      persistStorageMode();
      render();
      // Switching to a mode that's already configured (e.g. going back to
      // Drive after trying Local) should immediately pull in whatever's
      // saved there, same as first setting it up does.
      if (d.mode === 'drive' && state.driveClientId) {
        loadOrInitFromDrive(false).then(render).catch(() => {});
      } else if (d.mode === 'local') {
        loadOrInitFromLocal(false).then(render).catch(() => { state.localNeedsReconnect = true; render(); });
      }
    },
    headerSaveNow() {
      if (state.storageMode === 'drive') Actions.driveBackupNow();
      else if (state.storageMode === 'local') Actions.localSaveNow();
    },
    confirmRestoreLatest() { state.restoreConfirmOpen = true; render(); },
    cancelRestoreLatest() { state.restoreConfirmOpen = false; render(); },
    doRestoreLatest() {
      state.restoreConfirmOpen = false;
      if (state.storageMode === 'drive') performDriveRestore(state.driveFileId);
      else if (state.storageMode === 'local') Actions.doLocalRestore();
    },
    confirmChangeLocalFolder() {
      state.storageChangeAuthPending = 'folder';
      state.storageChangeAuthOpen = true;
      state.storageChangeAuthInput = '';
      state.storageChangeAuthError = false;
      render();
    },
    cancelChangeLocalFolder() { state.localFolderChangeConfirming = false; render(); },
    async chooseLocalFolder() {
      state.localFolderChangeConfirming = false;
      state.localBusy = true;
      state.localMessage = '';
      render();
      try {
        const name = await LocalStore.pickFolder();
        // Auto-retrieve: if this folder already has a backup file (e.g. it
        // was used before, or is shared/synced), load it instead of
        // overwriting it with whatever's currently in memory.
        await loadOrInitFromLocal(true);
        state.localMessage = 'Folder set to "' + name + '".';
      } catch (err) {
        state.localMessage = 'Could not set folder: ' + err.message;
      }
      state.localBusy = false;
      render();
    },
    async localSaveNow() {
      if (state.localBusy) return;
      state.localBusy = true;
      state.localMessage = '';
      render();
      try {
        await LocalStore.backup(buildBackupPayload(), true);
        state.localLastSavedAt = new Date().toISOString();
        state.localNeedsReconnect = false;
        dataDirty = false;
        state.localMessage = 'Saved to the local folder.';
        showDriveToast('Saved to local folder.');
      } catch (err) {
        if (err.message === 'PERMISSION_NEEDED') {
          state.localNeedsReconnect = true;
          state.localMessage = 'Click "Select folder" again to reconnect.';
        } else {
          state.localMessage = 'Save failed: ' + err.message;
        }
      }
      state.localBusy = false;
      render();
    },
    async doLocalRestore() {
      state.localBusy = true;
      state.localMessage = '';
      render();
      try {
        const data = await LocalStore.restore(true);
        applyRestoredData(data);
        dataDirty = false;
        state.localNeedsReconnect = false;
        state.localMessage = 'Loaded from the local folder.';
        state.loadError = '';
        state.view = 'dashboard';
        state.selectedCategory = null;
        state.detailEquipmentId = null;
        showDriveToast('Loaded from local folder.');
      } catch (err) {
        if (err.message === 'PERMISSION_NEEDED') {
          state.localNeedsReconnect = true;
          state.localMessage = 'Click "Select folder" again to reconnect.';
        } else {
          state.localMessage = 'Load failed: ' + err.message;
        }
      }
      state.localBusy = false;
      render();
    },

    setDashboardYear(e) { state.dashboardYear = parseInt(e.target.value, 10); render(); },
    goUploadInvoice() { state.view = 'upload'; state.addExpenseMode = 'upload'; render(); },
    goManualExpense() { state.view = 'upload'; state.addExpenseMode = 'manual'; render(); },
    pieMove(e) {
      const legend = window.__categoryPieLegend || [];
      const r = e.currentTarget.getBoundingClientRect();
      const cx = r.width / 2, cy = r.height / 2;
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const dx = x - cx, dy = y - cy;
      if (Math.sqrt(dx * dx + dy * dy) > cx) { if (state.pieTip) { state.pieTip = null; render(); } return; }
      let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
      if (deg < 0) deg += 360;
      const seg = legend.find((c) => deg >= c.start && deg < c.end) || legend[legend.length - 1];
      if (!seg) return;
      state.pieTip = { name: seg.name, totalFormatted: seg.totalFormatted, pctLabel: seg.pctLabel, x, y };
      render();
    },
    pieLeave() { state.pieTip = null; render(); },

    setAddMode(e, d) { state.addExpenseMode = d.mode; render(); },
    setAllExpSearch(e) { state.allExpSearch = e.target.value; render(); },
    setAllExpSort(e) { state.allExpSort = e.target.value; render(); },

    updateStandaloneRow(e, d) {
      const row = state.standaloneRows[Number(d.index)];
      row[d.field] = e.target.value;
      if (d.field === 'qty' || d.field === 'unitCost') {
        const qty = parseFloat(d.field === 'qty' ? e.target.value : row.qty) || 0;
        const unitCost = parseFloat(d.field === 'unitCost' ? e.target.value : row.unitCost) || 0;
        row.totalCost = (qty * unitCost) ? String(+(qty * unitCost).toFixed(2)) : '';
      }
      render();
    },
    addStandaloneRow() { state.standaloneRows.push(blankStandaloneRow()); render(); },
    removeStandaloneRow(e, d) {
      if (state.standaloneRows.length > 1) state.standaloneRows.splice(Number(d.index), 1);
      render();
    },
    quickAddSupplierRow(e, d) {
      const row = state.standaloneRows[Number(d.index)];
      mutate(() => Store.createSupplier(row.vendor));
    },
    quickAddSupplierManual() {
      mutate(() => Store.createSupplier(state.manualForm.vendor));
    },
    saveAllStandalone() {
      const validRows = state.standaloneRows.filter((r) => r.part.trim() && equipmentByName(r.equipment));
      if (!validRows.length) return;
      const lineItems = validRows.map((r) => ({ part: r.part, qty: r.qty, unitCost: r.unitCost, totalCost: r.totalCost, vendor: r.vendor, date: r.date, equipmentId: equipmentByName(r.equipment).id }));
      mutate(() => {
        Store.saveInvoice({ fileName: 'Manual entry', lineItems });
        state.standaloneRows = [blankStandaloneRow()];
        state.view = 'history';
      });
    },

    fileChange(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        const mimeType = file.type || 'image/jpeg';
        state.pendingInvoice = { fileName: file.name, dataUrl, mimeType, extracting: true, error: '', lineItems: [] };
        render();
        extractInvoice(dataUrl, mimeType);
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    },
    cancelPending() { state.pendingInvoice = null; render(); },
    updatePendingItem(e, d) {
      const item = state.pendingInvoice.lineItems.find((it) => it.id === d.id);
      item[d.field] = e.target.value;
      if (d.field === 'qty' || d.field === 'unitCost') {
        const qty = parseFloat(d.field === 'qty' ? e.target.value : item.qty) || 0;
        const unitCost = parseFloat(d.field === 'unitCost' ? e.target.value : item.unitCost) || 0;
        item.totalCost = (qty * unitCost) ? String(+(qty * unitCost).toFixed(2)) : '';
      }
      render();
    },
    removePendingItem(e, d) {
      state.pendingInvoice.lineItems = state.pendingInvoice.lineItems.filter((it) => it.id !== d.id);
      render();
    },
    addPendingRow() {
      state.pendingInvoice.lineItems.push({ id: uid(), part: '', qty: '1', unitCost: '', totalCost: '', vendor: '', date: todayIso(), equipment: '' });
      render();
    },
    saveInvoice() {
      const p = state.pendingInvoice;
      const lineItems = p.lineItems.map((it) => ({ part: it.part, qty: it.qty, unitCost: it.unitCost, totalCost: it.totalCost, vendor: it.vendor, date: it.date, equipmentId: (equipmentByName(it.equipment) || {}).id }));
      mutate(() => {
        Store.saveInvoice({ fileName: p.fileName, lineItems });
        state.pendingInvoice = null;
        state.view = 'history';
      });
    },

    setEquipmentSearch(e) { state.equipmentSearch = e.target.value; render(); },
    setEquipmentListMode(e, d) { state.equipmentListMode = d.mode; render(); },
    selectCategory(e, d) { state.selectedCategory = d.name; render(); },
    backToCategories() { state.selectedCategory = null; render(); },
    viewEquipment(e, d) { state.view = 'detail'; state.detailEquipmentId = Number(d.id); state.noteText = ''; state.noteDate = ''; state.hourCalcOpen = false; render(); },
    backToHistory() { state.view = 'history'; render(); },
    toggleManage(e, d) { const id = Number(d.id); state.manageOpenFor = state.manageOpenFor === id ? null : id; render(); },
    openManualForm(e, d) { state.manualFormOpenFor = Number(d.id); state.manualForm = blankManualForm(); state.manageOpenFor = null; render(); },
    closeManualForm() { state.manualFormOpenFor = null; state.manualForm = null; render(); },
    updateManualForm(e, d) {
      state.manualForm[d.field] = e.target.value;
      if (d.field === 'qty' || d.field === 'unitCost') {
        const qty = parseFloat(d.field === 'qty' ? e.target.value : state.manualForm.qty) || 0;
        const unitCost = parseFloat(d.field === 'unitCost' ? e.target.value : state.manualForm.unitCost) || 0;
        state.manualForm.totalCost = (qty * unitCost) ? String(+(qty * unitCost).toFixed(2)) : '';
      }
      render();
    },
    saveManualExpense(e, d) {
      const eqId = Number(d.id);
      const f = state.manualForm;
      if (!f.part.trim()) return;
      mutate(() => {
        Store.saveInvoice({ fileName: 'Manual entry', lineItems: [{ ...f, equipmentId: eqId }] });
        state.manualFormOpenFor = null;
        state.manualForm = null;
      });
    },
    confirmDeleteEquipment(e, d) { state.confirmDeleteFor = Number(d.id); state.manageOpenFor = null; render(); },
    cancelDeleteEquipment() { state.confirmDeleteFor = null; render(); },
    deleteEquipment(e, d) {
      const id = Number(d.id);
      mutate(() => {
        Store.deleteEquipment(id);
        state.confirmDeleteFor = null;
        if (state.detailEquipmentId === id) { state.detailEquipmentId = null; state.view = 'history'; }
      });
    },

    openHourCalc() { state.hourCalcOpen = true; render(); },
    closeHourCalc() { state.hourCalcOpen = false; render(); },
    setHourStart(e) { mutate(() => Store.updateHours(state.detailEquipmentId, { start: e.target.value })); },
    setHourEnd(e) { mutate(() => Store.updateHours(state.detailEquipmentId, { end: e.target.value })); },
    setCurrentHours(e) { mutate(() => Store.updateHours(state.detailEquipmentId, { end: e.target.value })); },
    logService(e, d) { mutate(() => Store.logService(Number(d.eq), Number(d.sv))); },
    setNoteText(e) { state.noteText = e.target.value; render(); },
    setNoteDate(e) { state.noteDate = e.target.value; render(); },
    addNote(e, d) {
      if (!state.noteText.trim()) return;
      mutate(() => {
        Store.addNote(Number(d.id), { text: state.noteText, date: state.noteDate });
        state.noteText = ''; state.noteDate = '';
      });
    },
    removeNote(e, d) { mutate(() => Store.deleteNote(Number(d.id))); },
    removeLineItem(e, d) { mutate(() => Store.deleteLineItem(Number(d.id))); },

    startEditEquipment(e, d) {
      const eq = equipmentById(d.id);
      state.editModalOpenFor = eq.id;
      state.editModalDraft = { name: eq.name, make: eq.make, model: eq.model, category: eq.category, vin: eq.vin, info: eq.info, filters: eq.filters.map((f) => ({ ...f })), services: eq.services.map((s) => ({ ...s })), manual: eq.manual || null, manualError: '' };
      state.manageOpenFor = null;
      render();
    },
    editCancel() { state.editModalOpenFor = null; state.editModalDraft = null; render(); },
    saveEditModal() {
      const id = state.editModalOpenFor;
      const payload = equipmentDraftPayload(state.editModalDraft);
      if (!payload.name) return;
      mutate(() => {
        Store.updateEquipment(id, payload);
        state.editModalOpenFor = null;
        state.editModalDraft = null;
      });
    },

    openAddEquipmentModal() {
      state.addModalOpen = true;
      state.addModalDraft = { name: '', category: state.selectedCategory || (state.categories[0] || {}).name || 'Other', make: '', model: '', vin: '', info: '', filters: [], services: [], manual: null, manualError: '' };
      render();
    },
    addCancel() { state.addModalOpen = false; state.addModalDraft = null; render(); },
    saveAddModal() {
      const payload = equipmentDraftPayload(state.addModalDraft);
      if (!payload.name) return;
      mutate(() => {
        Store.createEquipment(payload);
        state.addModalOpen = false;
        state.addModalDraft = null;
      });
    },

    openCategoryAddModal() { state.categoryAddModalOpen = true; state.categoryAddDraft = { name: '', color: COLOR_SWATCHES[0] }; render(); },
    categoryAddCancel() { state.categoryAddModalOpen = false; state.categoryAddDraft = null; render(); },
    saveCategoryAdd() {
      const d = state.categoryAddDraft;
      if (!d.name.trim()) return;
      mutate(() => {
        Store.createCategory({ name: d.name.trim(), color: d.color });
        state.categoryAddModalOpen = false;
        state.categoryAddDraft = null;
      });
    },
    openCategoryEditModal(e, d) {
      const cat = state.categories.find((c) => c.id === Number(d.id));
      state.categoryEditModalOpenFor = cat.id;
      state.categoryEditDraft = cat.name;
      state.categoryEditColorDraft = cat.color;
      render();
    },
    categoryEditCancel() { state.categoryEditModalOpenFor = null; render(); },
    saveCategoryEdit() {
      const id = state.categoryEditModalOpenFor;
      const name = state.categoryEditDraft.trim();
      if (!name) return;
      const oldName = (state.categories.find((c) => c.id === id) || {}).name;
      mutate(() => {
        Store.updateCategory(id, { name, color: state.categoryEditColorDraft });
        if (state.selectedCategory === oldName) state.selectedCategory = name;
        state.categoryEditModalOpenFor = null;
      });
    },

    openSupplierAddModal() { state.supplierAddModalOpen = true; state.supplierAddDraft = ''; render(); },
    supplierAddUpdate(e) { state.supplierAddDraft = e.target.value; render(); },
    supplierAddCancel() { state.supplierAddModalOpen = false; render(); },
    saveSupplierAdd() {
      if (!state.supplierAddDraft.trim()) return;
      mutate(() => {
        Store.createSupplier(state.supplierAddDraft);
        state.supplierAddModalOpen = false;
      });
    },
    openSupplierEditModal(e, d) {
      const sup = state.suppliers.find((s) => s.id === Number(d.id));
      state.supplierEditModalOpenFor = sup.id;
      state.supplierEditDraft = sup.name;
      render();
    },
    supplierEditUpdate(e) { state.supplierEditDraft = e.target.value; render(); },
    supplierEditCancel() { state.supplierEditModalOpenFor = null; render(); },
    saveSupplierEdit() {
      const id = state.supplierEditModalOpenFor;
      if (!state.supplierEditDraft.trim()) return;
      mutate(() => {
        Store.updateSupplier(id, state.supplierEditDraft);
        state.supplierEditModalOpenFor = null;
      });
    },
    confirmDeleteSupplier(e, d) { state.confirmDeleteSupplierFor = Number(d.id); render(); },
    cancelDeleteSupplier() { state.confirmDeleteSupplierFor = null; render(); },
    deleteSupplier(e, d) { mutate(() => { Store.deleteSupplier(Number(d.id)); state.confirmDeleteSupplierFor = null; }); },

    setYearlySelectedYear(e) { state.year = parseInt(e.target.value, 10); render(); },
    setYearlyMode(e, d) { state.yearlyGroupMode = d.mode; render(); },
    setYearlySearch(e) { state.yearlySearch = e.target.value; render(); },
    setYearlySort(e) { state.yearlySortMode = e.target.value; render(); },

    setAnMode(e, d) { state.analyticsMode = d.mode; state.anSearch = ''; render(); },
    setAnYearA(e) { state.anYearA = parseInt(e.target.value, 10); render(); },
    setAnYearB(e) { state.anYearB = parseInt(e.target.value, 10); render(); },
    setAnSearch(e) { state.anSearch = e.target.value; render(); },
    setAnSort(e) { state.anSort = e.target.value; render(); },
    setAnCrossVendor(e) { state.anCrossVendor = e.target.value; render(); },
    setAnCrossEquipment(e) { state.anCrossEquipment = e.target.value; render(); },
  };

  registerEquipmentModalActions('edit');
  registerEquipmentModalActions('add');
  registerCategoryModalActions('categoryAdd', () => state.categoryAddDraft);
  registerCategoryModalActions('categoryEdit', () => ({ get name() { return state.categoryEditDraft; }, set name(v) { state.categoryEditDraft = v; }, get color() { return state.categoryEditColorDraft; }, set color(v) { state.categoryEditColorDraft = v; } }));

  Actions.setSettingsTab = (e, d) => { state.settingsTab = d.tab; render(); };

  async function extractInvoice(dataUrl, mimeType) {
    const isPdf = mimeType === 'application/pdf';
    const setStatus = (status) => { if (state.pendingInvoice) { state.pendingInvoice.status = status; render(); } };
    setStatus(isPdf ? 'Reading the PDF text…' : 'Scanning the image (OCR)…');
    try {
      const text = await InvoiceParser.readInvoiceText(dataUrl, mimeType, (p) => {
        setStatus('Scanning the image (OCR) — ' + Math.round(p * 100) + '%');
      });
      setStatus('Finding line items…');
      const { items } = InvoiceParser.parseInvoiceLines(text);
      const rows = items.map((it) => ({ ...it, id: uid(), equipment: '' }));
      if (state.pendingInvoice) {
        state.pendingInvoice.extracting = false;
        state.pendingInvoice.status = '';
        state.pendingInvoice.error = rows.length ? '' : 'No line items were recognized on this invoice. Add them by hand below — the vendor and date fields are yours to fill in.';
        state.pendingInvoice.lineItems = rows.length ? rows : [{ id: uid(), part: '', qty: '1', unitCost: '', totalCost: '', vendor: '', date: todayIso(), equipment: '' }];
      }
    } catch (err) {
      const scanned = err && err.message === 'SCANNED_PDF';
      if (state.pendingInvoice) {
        state.pendingInvoice.extracting = false;
        state.pendingInvoice.status = '';
        state.pendingInvoice.error = scanned
          ? 'This PDF is a scan with no text layer, so there is nothing to read directly. Save the page as a JPG or PNG and upload that instead, or enter the lines by hand below.'
          : 'Could not read this invoice automatically. Add line items manually below.';
        state.pendingInvoice.lineItems = [{ id: uid(), part: '', qty: '1', unitCost: '', totalCost: '', vendor: '', date: todayIso(), equipment: '' }];
      }
    }
    render();
  }

  // ---------------------------------------------------------------- event delegation

  function dispatch(e) {
    // Close any open info popover on a click that isn't inside it or its
    // icon — otherwise it just sits there, invisible-but-solid, blocking
    // clicks on whatever's underneath until the same icon is clicked again.
    if (e.type === 'click' && state.openInfoId && !e.target.closest('.info-icon-wrap')) {
      state.openInfoId = null;
      render();
    }
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const on = el.dataset.on || 'click';
    if (on !== e.type) return;
    const fn = Actions[el.dataset.action];
    if (fn) fn(e, el.dataset, el);
  }
  $app.addEventListener('click', dispatch);
  $app.addEventListener('change', dispatch);
  $app.addEventListener('input', dispatch);
  $app.addEventListener('submit', dispatch);
  $app.addEventListener('mousemove', (e) => {
    const el = e.target.closest('#pie-chart');
    if (el) Actions.pieMove({ ...e, currentTarget: el });
  });
  $app.addEventListener('mouseout', (e) => {
    const el = e.target.closest('#pie-chart');
    if (el && !el.contains(e.relatedTarget)) Actions.pieLeave();
  });

  // ---------------------------------------------------------------- init

  let driveToastTimer = null;
  function showDriveToast(text) {
    state.driveToast = text;
    render();
    if (driveToastTimer) clearTimeout(driveToastTimer);
    driveToastTimer = setTimeout(() => { state.driveToast = ''; render(); }, 4000);
  }

  // Runs every 15s. Silent by design either way — auto-save should never pop
  // a Google consent screen, a folder-permission prompt, or an error banner
  // on its own; it just quietly does nothing if the active storage isn't
  // reachable right now (Settings shows a way to reconnect).
  async function autoSaveDriveTick() {
    if (state.driveBusy || !dataDirty) return;
    try {
      const payload = buildBackupPayload();
      const fileId = await Drive.backup(state.driveClientId, state.driveFileId, payload, false, state.driveFolderId);
      state.driveFileId = fileId;
      state.driveLastBackupAt = new Date().toISOString();
      handleStaleDriveFolder();
      dataDirty = false;
      persistDriveConfig();
      render();
    } catch (err) { /* silent — see comment above */ }
  }

  async function autoSaveLocalTick() {
    if (state.localBusy || !dataDirty) return;
    try {
      await LocalStore.backup(buildBackupPayload(), false);
      state.localLastSavedAt = new Date().toISOString();
      state.localNeedsReconnect = false;
      dataDirty = false;
      render();
    } catch (err) {
      if (err.message === 'PERMISSION_NEEDED') state.localNeedsReconnect = true;
    }
  }

  async function autoSaveTick() {
    if (state.storageMode === 'drive' && state.driveClientId) await autoSaveDriveTick();
    else if (state.storageMode === 'local') await autoSaveLocalTick();
  }

  async function init() {
    loadStorageMode();
    loadDriveConfig();
    resetData();
    state.loading = false;
    render();
    setInterval(autoSaveTick, 15000);
    // Non-blocking background sync: the dashboard is already showing
    // (empty) by the time this resolves, so whatever's in the configured
    // storage just populates it once it arrives — nothing gates the UI on
    // this.
    try {
      if (state.storageMode === 'drive' && state.driveClientId) {
        await loadOrInitFromDrive(false);
        render();
      } else if (state.storageMode === 'local') {
        await loadOrInitFromLocal(false);
        render();
      }
    } catch (err) { /* silent — Settings shows a way to reconnect */ }
  }

  init();
})();


