import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type ToastTone = "success" | "error" | "warning" | "info";

type Toast = { id: number; message: string; tone: ToastTone };
type ToastOptions = { tone?: ToastTone; duration?: number };
type ToastContextValue = { show: (message: string, options?: ToastOptions) => void };

const ToastContext = createContext<ToastContextValue | null>(null);
const durations: Record<ToastTone, number> = { success: 4000, info: 4000, warning: 5500, error: 7000 };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);
  const show = useCallback((message: string, options: ToastOptions = {}) => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return;
    const tone = options.tone ?? "info";
    setToasts((current) => {
      const duplicate = current.find((toast) => toast.message === trimmedMessage && toast.tone === tone);
      if (duplicate) return current;
      const id = ++nextId.current;
      window.setTimeout(() => dismiss(id), options.duration ?? durations[tone]);
      return [...current, { id, message: trimmedMessage, tone }];
    });
  }, [dismiss]);
  const value = useMemo(() => ({ show }), [show]);

  return <ToastContext.Provider value={value}>{children}<div className="toast-viewport" aria-live="polite" aria-atomic="true">{toasts.map((toast) => <div key={toast.id} className={`toast toast-${toast.tone}`} role={toast.tone === "error" ? "alert" : "status"}><span>{toast.message}</span><button type="button" className="toast-dismiss" aria-label="Dismiss notification" onClick={() => dismiss(toast.id)}>×</button></div>)}</div></ToastContext.Provider>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider.");
  return context;
}

/** Displays transient API/action feedback without leaving an inline banner behind. */
export function ResponseToast({ message, tone = "info" }: { message: string | null | undefined; tone?: ToastTone }) {
  const { show } = useToast();
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (message && message !== previous.current) show(message, { tone });
    previous.current = message ?? null;
  }, [message, show, tone]);
  return null;
}
