import { state } from "./state.js";

const conditionalGetCache = new Map();

export function adminQuery() {
  return state.adminKey ? `admin_key=${encodeURIComponent(state.adminKey)}` : "";
}

export function withAdmin(path) {
  const q = adminQuery();
  if (!q) return path;
  return path.includes("?") ? `${path}&${q}` : `${path}?${q}`;
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

