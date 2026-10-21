import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { aplomb, sortie } from "../lib/motion";

const Ctx = createContext<(msg: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; msg: string } | null>(null);
  const minuteur = useRef<number>(0);

  const afficher = useCallback((msg: string) => {
    window.clearTimeout(minuteur.current);
    setToast({ id: Date.now(), msg });
    minuteur.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  return (
    <Ctx.Provider value={afficher}>
      {children}
      {/* Le conteneur centre ; le message monte et se pose. */}
      <div className="toast-zone" role="status" aria-live="polite">
        <AnimatePresence mode="wait">
          {toast && (
            <motion.div
              key={toast.id}
              className="toast"
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: aplomb }}
              exit={{ opacity: 0, y: 10, scale: 0.97, transition: sortie }}
            >
              {toast.msg}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
