import type { Product } from '@/features/catalog/types';

export type KitMode = 'manual' | 'ai';
export type SkillLevel = 'beginner' | 'pro' | 'expert';

export type KitLine = {
  product: Product;
  qty: number;
  variantId?: string;
  reason?: string;
  priority?: 'essential' | 'recommended' | 'optional';
};

export type AiKitRequest = {
  job: string;
  budget: number;
  level: SkillLevel;
  brand?: string;
  owned?: string;
  notes?: string;
};

export type AiKitResponse = {
  ok: boolean;
  title: string;
  summary: string;
  budget: number;
  total: number;
  remaining: number;
  items: Array<{
    id: string;
    qty: number;
    reason: string;
    priority: 'essential' | 'recommended' | 'optional';
  }>;
  warnings: string[];
  source: 'ai' | 'rules';
};
