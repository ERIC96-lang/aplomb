import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

const Ctx = createContext<(msg: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);

  const toast = useCallback((m: string) => {
    setMsg(m);
    window.setTimeout(() => setMsg(null), 2600);
  }, []);

  return (
    <Ctx.Provider value={toast}>
      {children}
      {msg && <div className="toast">{msg}</div>}
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
