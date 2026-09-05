// Thin fetch wrapper for the Farm Fleet Expenses API.
const Api = (() => {
  async function req(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) throw new Error((data && data.error) || ('Request failed (' + res.status + ')'));
    return data;
  }

  return {
    login: (username, password) => req('POST', '/api/login', { username, password }),
    logout: () => req('POST', '/api/logout'),
    me: () => req('GET', '/api/me'),
    state: () => req('GET', '/api/state'),

    createUser: (data) => req('POST', '/api/users', data),
    updateUser: (id, data) => req('PUT', '/api/users/' + id, data),
    deleteUser: (id) => req('DELETE', '/api/users/' + id),

    createCategory: (data) => req('POST', '/api/categories', data),
    updateCategory: (id, data) => req('PUT', '/api/categories/' + id, data),

    createSupplier: (name) => req('POST', '/api/suppliers', { name }),
    updateSupplier: (id, name) => req('PUT', '/api/suppliers/' + id, { name }),
    deleteSupplier: (id) => req('DELETE', '/api/suppliers/' + id),

    createEquipment: (data) => req('POST', '/api/equipment', data),
    updateEquipment: (id, data) => req('PUT', '/api/equipment/' + id, data),
    deleteEquipment: (id) => req('DELETE', '/api/equipment/' + id),
    updateHours: (id, data) => req('PUT', '/api/equipment/' + id + '/hours', data),
    logService: (equipmentId, serviceId) => req('POST', '/api/equipment/' + equipmentId + '/service/' + serviceId + '/log'),

    addNote: (equipmentId, data) => req('POST', '/api/equipment/' + equipmentId + '/notes', data),
    deleteNote: (id) => req('DELETE', '/api/notes/' + id),

    saveInvoice: (data) => req('POST', '/api/invoices', data),
    deleteLineItem: (id) => req('DELETE', '/api/line-items/' + id),

    startNewYear: () => req('POST', '/api/start-new-year'),
  };
})();
