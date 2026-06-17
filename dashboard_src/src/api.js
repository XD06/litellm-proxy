import { state } from "./state.js";

export function adminQuery() {
  return state.adminKey ? `admin_key=${encodeURIComponent(state.adminKey)}` : "";
}

export function withAdmin(path) {
  const q = adminQuery();
  if (!q) return path;
  return path.includes("?") ? `${path}&${q}` : `${path}?${q}`;
}

export async function apiGet(path) {
  const resp = await fetch(withAdmin(path), {
    headers: state.adminKey ? { "X-Admin-Key": state.adminKey } : {},
  });
  const data = await readJson(resp);
  if (!resp.ok) throw new Error(errorMessage(data, resp.status));
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

