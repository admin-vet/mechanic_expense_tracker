// Google Drive backup — client-side only, using Google Identity Services' OAuth
// token client (no server, no client secret). Scope is drive.file: the app can
// only see/edit files it created itself (or a folder the user explicitly picks
// via the Google Picker below), never browse the rest of the user's Drive.
const Drive = (() => {
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const FILE_NAME = 'farm-fleet-expenses-backup.json';

  let tokenClient = null;
  let tokenClientId = null;
  let pickerApiLoading = null;

  function ensureTokenClient(clientId) {
    if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
      throw new Error('Google sign-in has not loaded yet — check your internet connection and try again.');
    }
    if (!tokenClient || tokenClientId !== clientId) {
      tokenClientId = clientId;
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: () => {}, // replaced per-request below
      });
    }
    return tokenClient;
  }

  function requestToken(clientId, interactive) {
    return new Promise((resolve, reject) => {
      let client;
      try { client = ensureTokenClient(clientId); } catch (e) { reject(e); return; }
      client.callback = (resp) => {
        if (resp.error) { reject(new Error(resp.error)); return; }
        resolve(resp.access_token);
      };
      try {
        client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
      } catch (e) { reject(e); }
    });
  }

  async function apiFetch(url, opts) {
    const res = await fetch(url, opts);
    if (res.status === 401) throw new Error('UNAUTHORIZED');
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error('Google Drive error (' + res.status + '): ' + text.slice(0, 200));
    }
    return res;
  }

  async function findBackupFile(token, folderId) {
    let q = `name='${FILE_NAME}' and trashed=false`;
    if (folderId) q += ` and '${folderId}' in parents`;
    const res = await apiFetch('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&spaces=drive&fields=files(id,name)', {
      headers: { Authorization: 'Bearer ' + token },
    });
    const data = await res.json();
    return (data.files && data.files[0]) ? data.files[0].id : null;
  }

  async function createBackupFile(token, content, folderId) {
    const boundary = 'ffe_' + Math.random().toString(36).slice(2);
    const metadata = { name: FILE_NAME, mimeType: 'application/json' };
    if (folderId) metadata.parents = [folderId];
    const body =
      '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) + '\r\n' +
      '--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' + content + '\r\n' +
      '--' + boundary + '--';
    const res = await apiFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary=' + boundary },
      body,
    });
    const data = await res.json();
    return data.id;
  }

  async function updateBackupFile(token, fileId, content) {
    await apiFetch('https://www.googleapis.com/upload/drive/v3/files/' + fileId + '?uploadType=media', {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: content,
    });
  }

  // Uploads `payload` to a single, stable backup file in the signed-in user's
  // Drive (inside `folderId` if given, else "My Drive" root), creating it on
  // the first run and overwriting it after that. `existingFileId` (if known)
  // skips the lookup. `interactive` forces the Google consent screen even if
  // a prior grant may have expired silently.
  async function backup(clientId, existingFileId, payload, interactive, folderId) {
    const token = await requestToken(clientId, interactive);
    const content = JSON.stringify(payload, null, 2);
    if (existingFileId) {
      try {
        await updateBackupFile(token, existingFileId, content);
        return existingFileId;
      } catch (e) {
        if (e.message === 'UNAUTHORIZED') throw e;
        existingFileId = null; // e.g. file was deleted — fall through to recreate
      }
    }
    const foundId = await findBackupFile(token, folderId);
    if (foundId) { await updateBackupFile(token, foundId, content); return foundId; }
    return createBackupFile(token, content, folderId);
  }

  function loadPickerApi() {
    if (window.google && window.google.picker) return Promise.resolve();
    if (pickerApiLoading) return pickerApiLoading;
    pickerApiLoading = new Promise((resolve, reject) => {
      if (!window.gapi) { reject(new Error('The Google API loader has not loaded yet — check your internet connection and try again.')); return; }
      window.gapi.load('picker', { callback: resolve, onerror: () => reject(new Error('Could not load the Google folder picker.')) });
    });
    return pickerApiLoading;
  }

  // Opens Google's own folder picker so the user can choose a destination
  // folder in their Drive without the app ever listing their files itself.
  // Resolves to {id, name}, or null if the user cancels.
  //
  // `appId` (the Cloud project *number*, not the project ID or OAuth client
  // ID) is required for the drive.file scope to actually register access to
  // a folder the app didn't create — without it, Picker still lets you click
  // a folder, but Drive never grants the token visibility into it, and every
  // later request against that folder ID comes back 404 "File not found".
  async function pickFolder(clientId, apiKey, appId, interactive) {
    if (!apiKey) throw new Error('Add a Google API key first (see Settings for setup steps).');
    if (!appId) throw new Error('Add your Google Cloud project number first (see Settings for setup steps).');
    const token = await requestToken(clientId, interactive);
    await loadPickerApi();
    return new Promise((resolve, reject) => {
      try {
        const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
          .setSelectFolderEnabled(true)
          .setIncludeFolders(true)
          .setMimeTypes('application/vnd.google-apps.folder');
        const picker = new google.picker.PickerBuilder()
          .setTitle('Choose a backup folder')
          .setAppId(appId)
          .addView(view)
          .setOAuthToken(token)
          .setDeveloperKey(apiKey)
          .setCallback((data) => {
            if (data.action === google.picker.Action.PICKED) {
              const doc = data.docs[0];
              resolve({ id: doc.id, name: doc.name });
            } else if (data.action === google.picker.Action.CANCEL) {
              resolve(null);
            }
          })
          .build();
        picker.setVisible(true);
      } catch (e) { reject(e); }
    });
  }

  function reset() { tokenClient = null; tokenClientId = null; }

  return { backup, pickFolder, reset };
})();
