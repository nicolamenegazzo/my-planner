import { useEffect, useState } from 'react';

interface ToastMessage {
  id: number;
  text: string;
  kind: 'error' | 'info';
}

const EVENT = 'mymonday:toast';
let nextId = 1;

export function toast(text: string, kind: ToastMessage['kind'] = 'info') {
  window.dispatchEvent(new CustomEvent<ToastMessage>(EVENT, { detail: { id: nextId++, text, kind } }));
}

export function toastError(e: unknown) {
  toast(e instanceof Error ? e.message : String(e), 'error');
}

export function Toaster() {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent<ToastMessage>).detail;
      setMessages((list) => [...list, msg]);
      setTimeout(() => setMessages((list) => list.filter((m) => m.id !== msg.id)), 4000);
    };
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);

  return (
    <div className="toaster">
      {messages.map((m) => (
        <div key={m.id} className={`toast toast-${m.kind}`}>
          {m.text}
        </div>
      ))}
    </div>
  );
}
