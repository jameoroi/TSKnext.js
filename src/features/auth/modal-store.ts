import { create } from 'zustand';
import type { AuthTab } from '@/components/auth/login-form';

type AuthModalState = {
  open: boolean;
  tab: AuthTab;
  redirect: string;
  show: (tab?: AuthTab, redirect?: string) => void;
  hide: () => void;
};

export const useAuthModalStore = create<AuthModalState>((set) => ({
  open: false,
  tab: 'customer',
  redirect: '/account',
  show: (tab = 'customer', redirect = '/account') => set({ open: true, tab, redirect }),
  hide: () => set({ open: false }),
}));
