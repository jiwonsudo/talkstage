'use client';
import { createContext, useCallback, useContext, useState } from 'react';

type Item = { id: number; text: string; out: boolean };
const ToastCtx = createContext<(text: string) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const toast = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setItems((l) => [...l, { id, text, out: false }]);
    setTimeout(() => setItems((l) => l.map((t) => (t.id === id ? { ...t, out: true } : t))), 2400);
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), 2800);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      {items.map((t) => (
        <div key={t.id} className={`toast${t.out ? ' out' : ''}`} role="status">{t.text}</div>
      ))}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
