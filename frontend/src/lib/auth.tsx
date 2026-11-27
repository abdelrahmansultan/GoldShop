import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, tokens } from "./api";
import i18n from "../i18n";

export interface Me {
  id: number; username: string; full_name: string; display_name: string; role: string;
  language: "ar" | "en"; capabilities: string[]; email: string; phone: string;
}

interface AuthCtx {
  user: Me | null; loading: boolean;
  login(username: string, password: string): Promise<void>;
  logout(): void;
  can(cap: string): boolean;
  refreshMe(): Promise<void>;
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    if (!tokens.access) { setUser(null); setLoading(false); return; }
    try { setUser((await api.get<Me>("/auth/me/")).data); } catch { setUser(null); }
    setLoading(false);
  }, []);

  useEffect(() => { void refreshMe(); }, [refreshMe]);

  const logout = useCallback(() => {
    const r = tokens.refresh;
    if (r) api.post("/auth/logout/", { refresh: r }).catch(() => undefined);
    tokens.clear();
    setUser(null);
  }, []);

  useEffect(() => {
    const h = () => { tokens.clear(); setUser(null); };
    window.addEventListener("gs:logout", h);
    return () => window.removeEventListener("gs:logout", h);
  }, []);

  const login = async (username: string, password: string) => {
    const { data } = await api.post("/auth/login/", { username, password });
    tokens.set(data.access, data.refresh);
    setUser(data.user);
    if (data.user?.language && data.user.language !== i18n.language) void i18n.changeLanguage(data.user.language);
  };

  const can = useCallback((cap: string) => !!user?.capabilities.includes(cap), [user]);

  return <Ctx.Provider value={{ user, loading, login, logout, can, refreshMe }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
