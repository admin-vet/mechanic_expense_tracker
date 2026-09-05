// Google Drive backup — client-side only, using Google Identity Services' OAuth
// token client (no server, no client secret). Scope is drive.file: the app can
// only see/edit files it created itself, never the rest of the user's Drive.
const Drive = (() => {
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const FILE_NAME = 'farm-fleet-expenses-backup.json';

  let tokenClient = null;
  let tokenClientId = null;

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

  async function findBackupFile(token) {
    const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
    const res = await apiFetch('https://www.googleapis.com/drive/v3/files?q=' + q + '&spaces=drive&fields=files(id,name)', {
      headers: { Authorization: 'Bearer ' + token },
    });
    const data = await res.json();
    return (data.files && data.files[0]) ? data.files[0].id : null;
  }

  async function createBackupFile(token, content) {
    const boundary = 'ffe_' + Math.random().toString(36).slice(2);
    const metadata = { name: FILE_NAME, mimeType: 'application/json' };
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
  // Drive, creating it on the first run and overwriting it after that.
  // `existingFileId` (if known) skips the lookup. `interactive` forces the
  // Google consent screen even if a prior grant may have expired silently.
  async function backup(clientId, existingFileId, payload, interactive) {
    const token = await requestToken(clientId, interactive);
    const content = JSON.stringify(payload, null, 2);
    if (existingFileId) {
      try {
        await updateBackupFile(token, existingFileId, content);
        return existingFileId;
      } catch (e) {
        if (e.message !== 'UNAUTHORIZED') existingFileId = null; // e.g. file was deleted — fall through to recreate
        else throw e;
      }
    }
    const foundId = await findBackupFile(token);
    if (foundId) { await updateBackupFile(token, foundId, content); return foundId; }
    return createBackupFile(token, content);
  }

  function reset() { tokenClient = null; tokenClientId = null; }

  return { backup, reset };
})();
