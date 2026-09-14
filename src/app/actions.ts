'use server';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/server/auth/guards';
export async function revalidateCommerce() {
  await requireRole('admin', '/admin');
  revalidatePath('/', 'layout');
}
