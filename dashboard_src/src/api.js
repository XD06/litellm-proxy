import { state } from "./state.js";

const conditionalGetCache = new Map();

export function adminQuery() {
  // Compatibility stub: the backend ignores ?admin_key= unless
  // server.allow_query_admin_key is enabled, and putting the raw key in the
  // URL leaks it into server access logs, PROXY_DEBUG dumps, and any
  // reverse-proxy logs in between. Auth goes via the X-Admin-Key header.
  return "";
}

export function withAdmin(path) {
  // Never append the admin key to the URL — every request already carries it
  // in the X-Admin-Key header (see apiGet/apiPost/apiPatch and the two raw
  // fetch call sites in app.js).
  return path;
}

export async function apiGet(path, { signal, cache = false } = {}) {
  const url = withAdmin(path);
  const cached = cache ? conditionalGetCache.get(url) : null;
  const headers = state.adminKey ? { "X-Admin-Key": state.adminKey } : {};
  if (cached?.etag) headers["If-None-Match"] = cached.etag;
  const resp = await fetch(url, { headers, signal });
  if (resp.status === 304 && cached) return cached.data;
  const data = await readJson(resp);
  if (!resp.ok) throw new Error(errorMessage(data, resp.status));
  if (cache) {
    const etag = resp.headers.get("ETag");
    if (etag) conditionalGetCache.set(url, { etag, data });
  }
  return data;
}

export async function apiPost(path, body) {
  const resp = await fetch(withAdmin(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(state.adminKey ? { "X-Admin-Key": state.adminKey } : {}),
    },
    body: JSON.stringify(body || {}),
  });
  const data = await readJson(resp);
  if (!resp.ok) throw new Error(errorMessage(data, resp.status));
  return data;
}

export async function apiPatch(path, body) {
  const resp = await fetch(withAdmin(path), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(state.adminKey ? { "X-Admin-Key": state.adminKey } : {}),
    },
    body: JSON.stringify(body || {}),
  });
  const data = await readJson(resp);
  if (!resp.ok) throw new Error(errorMessage(data, resp.status));
  return data;
}

export async function readJson(resp) {
  try {
    return await resp.json();
  } catch (_err) {
    return {};
  }
}

export function errorMessage(data, status) {
  return data?.error?.message || `HTTP ${status}`;
}

