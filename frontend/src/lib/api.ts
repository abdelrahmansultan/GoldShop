import axios, { AxiosError } from "axios";

declare global {
  interface Window {
    goldshop?: { apiUrl?: string; mode?: string; print?: (opts?: { silent?: boolean }) => Promise<void>; platform?: string };
  }
}

const base = (window.goldshop?.apiUrl ?? import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
export const API_ROOT = `${base}/api/v1`;
export const MEDIA_ROOT = base;

const ACCESS = "gs.access";
const REFRESH = "gs.refresh";

export const tokens = {
  get access() { return sessionStorage.getItem(ACCESS); },
  get refresh() { return sessionStorage.getItem(REFRESH); },
  set(access: string, refresh?: string) {
    sessionStorage.setItem(ACCESS, access);
    if (refresh) sessionStorage.setItem(REFRESH, refresh);
  },
  clear() { sessionStorage.removeItem(ACCESS); sessionStorage.removeItem(REFRESH); },
};

export const api = axios.create({ baseURL: API_ROOT, timeout: 30000 });

api.interceptors.request.use((cfg) => {
  const t = tokens.access;
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  cfg.headers["Accept-Language"] = document.documentElement.lang || "ar";
  return cfg;
});

let refreshing: Promise<string | null> | null = null;
async function refreshAccess(): Promise<string | null> {
  const r = tokens.refresh;
  if (!r) return null;
  try {
    const { data } = await axios.post(`${API_ROOT}/auth/refresh/`, { refresh: r });
    tokens.set(data.access, data.refresh);
    return data.access;
  } catch {
    tokens.clear();
    return null;
  }
}

api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const cfg = error.config as (typeof error.config & { _retry?: boolean }) | undefined;
  if (error.response?.status === 401 && cfg && !cfg._retry && !cfg.url?.includes("auth/")) {
    cfg._retry = true;
    refreshing ??= refreshAccess().finally(() => { refreshing = null; });
    const t = await refreshing;
    if (t) {
      cfg.headers = cfg.headers ?? {};
      (cfg.headers as Record<string, string>).Authorization = `Bearer ${t}`;
      return api(cfg);
    }
    window.dispatchEvent(new Event("gs:logout"));
  }
  return Promise.reject(error);
});

/** Turn any API error into one readable message. */
export function errorMessage(e: unknown, fallback = "Error"): string {
  const ax = e as AxiosError<any>;
  const d = ax?.response?.data;
  if (!ax?.response) return ax?.message === "Network Error" ? "network" : (ax?.message ?? fallback);
  if (typeof d === "string") return d.slice(0, 200);
  if (d?.detail) return String(d.detail);
  if (d && typeof d === "object") {
    const flat = (v: any, k = ""): string[] =>
      Array.isArray(v) ? v.flatMap((x) => flat(x, k))
        : v && typeof v === "object" ? Object.entries(v).flatMap(([kk, vv]) => flat(vv, kk))
          : [k && k !== "non_field_errors" ? `${k}: ${v}` : String(v)];
    return flat(d).slice(0, 4).join(" · ");
  }
  return fallback;
}

export interface Page<T> { count: number; next: string | null; previous: string | null; results: T[] }

/** Download a CSV export through the authenticated API (keeps the JWT out of URLs). */
export async function downloadCsv(path: string, params: Record<string, unknown>, filename: string) {
  const res = await api.get(path, { params: { ...params, export: "csv" }, responseType: "blob" });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
