import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

type Toast = { id: number; kind: "success" | "error"; text: string };
const Ctx = createContext<{ success(t: string): void; error(t: string): void }>({ success() {}, error() {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, kind, text }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), kind === "error" ? 7000 : 3500);
  }, []);
  return (
    <Ctx.Provider value={{ success: (t) => push("success", t), error: (t) => push("error", t) }}>
      {children}
      <div className="no-print fixed bottom-4 inset-x-0 z-[100] flex flex-col items-center gap-2 px-4 pointer-events-none">
        {items.map((t) => (
          <div key={t.id} role="status"
            className={`pointer-events-auto flex max-w-lg items-start gap-2 rounded-lg px-4 py-3 text-sm shadow-lg ${
              t.kind === "success" ? "bg-navy-900 text-white" : "bg-red-600 text-white"}`}>
            {t.kind === "success" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-gold-300" /> : <XCircle className="mt-0.5 size-4 shrink-0" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
