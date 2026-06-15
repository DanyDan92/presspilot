/* PressPilot V2 — api.js
   Thin fetch wrappers. All return parsed JSON or throw. */

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function apiGet(path) {
  const r = await fetch(path);
  if (r.status === 401) { window.location.href = '/login'; throw new Error('Unauthenticated'); }
  return r.json();
}

export async function apiPost(path, body) {
  const r = await fetch(path, { method:'POST', headers: JSON_HEADERS, body: JSON.stringify(body) });
  if (r.status === 401) { window.location.href = '/login'; throw new Error('Unauthenticated'); }
  return r.json();
}

export async function apiPut(path, body) {
  const r = await fetch(path, { method:'PUT', headers: JSON_HEADERS, body: JSON.stringify(body) });
  if (r.status === 401) { window.location.href = '/login'; throw new Error('Unauthenticated'); }
  return r.ok ? r.json() : null;
}

export async function apiPatch(path, body) {
  const r = await fetch(path, { method:'PATCH', headers: JSON_HEADERS, body: JSON.stringify(body) });
  if (r.status === 401) { window.location.href = '/login'; throw new Error('Unauthenticated'); }
  return r.ok ? r.json() : null;
}

export async function apiDelete(path) {
  const r = await fetch(path, { method:'DELETE' });
  if (r.status === 401) { window.location.href = '/login'; throw new Error('Unauthenticated'); }
  return r.ok;
}

// ── DOMAIN CALLS ─────────────────────────────────────────────────────────────
export const getConfig    = ()       => apiGet('/api/config');
export const getIssues    = ()       => apiGet('/api/issues');
export const getDashboard = ()       => apiGet('/api/dashboard');
export const getViews     = ()       => apiGet('/api/views');
export const getNumeros   = ()       => apiGet('/api/numeros');

export const getArticles  = (params) => apiGet('/api/articles?' + new URLSearchParams(params));
export const postArticle  = (body)   => apiPost('/api/articles', body);
export const putArticle   = (id, b)  => apiPut(`/api/articles/${id}`, b);
export const deleteArticle= (id)     => apiDelete(`/api/articles/${id}`);
export const bulkPatch    = (body)   => apiPatch('/api/articles/bulk', body);
export const duplicateArticles = (b) => apiPost('/api/articles/duplicate', b);

export const patchIssue   = (id, b)  => apiPatch(`/api/issues/${id}`, b);
export const postIssue    = (body)   => apiPost('/api/issues', body);
export const deleteIssue  = (id)     => apiDelete(`/api/issues/${id}`);
export const copyIssue    = (body)   => apiPost('/api/copy-issue', body);

export const getBilling         = ()       => apiGet('/api/billing');
export const postBillingMonth   = (body)   => apiPost('/api/billing/months', body);
export const deleteBillingMonth = (month)  => apiDelete(`/api/billing/months/${encodeURIComponent(month)}`);
export const postBillingLine    = (body)   => apiPost('/api/billing/lines', body);
export const patchBillingLine   = (id, b)  => apiPatch(`/api/billing/lines/${id}`, b);
export const deleteBillingLine  = (id)     => apiDelete(`/api/billing/lines/${id}`);
export const postBillingPayment = (body)   => apiPost('/api/billing/payments', body);
export const patchBillingPayment= (id, b)  => apiPatch(`/api/billing/payments/${id}`, b);
export const deleteBillingPayment= (id)    => apiDelete(`/api/billing/payments/${id}`);

export const getCDF       = (mag, num)=>apiGet(`/api/cdf?magazine=${encodeURIComponent(mag)}&numero=${encodeURIComponent(num)}`);
export const exportBackup = ()       => apiGet('/api/admin/export');

export const postView     = (body)   => apiPost('/api/views', body);
export const patchView    = (id, b)  => apiPatch(`/api/views/${id}`, b);
export const deleteView   = (id)     => apiDelete(`/api/views/${id}`);

export const postConfig   = (body)   => apiPost('/api/config', body);
export const putConfig    = (id, b)  => apiPut(`/api/config/${id}`, b);
export const deleteConfig = (id)     => apiDelete(`/api/config/${id}`);
