import { create } from 'zustand';

export type ToastTone = 'ok' | 'bad' | 'info';

type ToastState = {
  message: string;
  tone: ToastTone;
  visible: boolean;
  nonce: number;
  show: (message: string, options?: { tone?: ToastTone; duration?: number }) => void;
  hide: () => void;
};

let timer: ReturnType<typeof setTimeout> | undefined;

export const useToastStore = create<ToastState>((set) => ({
  message: '',
  tone: 'ok',
  visible: false,
  nonce: 0,
  show: (message, options) => {
    const tone = options?.tone || 'ok';
    const duration = options?.duration ?? (tone === 'bad' ? 5200 : 2400);
    if (timer) clearTimeout(timer);
    set((state) => ({ message: String(message || ''), tone, visible: true, nonce: state.nonce + 1 }));
    timer = setTimeout(() => set({ visible: false }), duration);
  },
  hide: () => {
    if (timer) clearTimeout(timer);
    set({ visible: false });
  },
}));

export function showToast(message: string, options?: { tone?: ToastTone; duration?: number }) {
  useToastStore.getState().show(message, options);
}
