'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, MessageSquareText, Play, Star, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Tabs } from 'radix-ui';
import { useMemo, useState } from 'react';
import type { Product } from '@/features/catalog/types';
import { legacyRequest } from '@/lib/legacy-api.client';
import { uploadReviewImage } from '@/lib/review-media.client';

type Tab = 'details' | 'specs' | 'video' | 'reviews';

type DetailBlock =
  | { kind: 'list'; items: string[] }
  | { kind: 'pair'; label: string; text: string }
  | { kind: 'text'; text: string };

const BULLET = /^[•●○◦·▪▫■□–\-*+✓✔☑★☆➤➔»>]\s*/;
const LABEL = /^([^:：\n]{2,40})[:：]\s*(.+)$/;

function detailBlocks(raw: unknown): DetailBlock[] {
  const description = String(raw || '')
    .trim()
    .replace(/[❖◆♦⬧◇]/g, '·')
    .replace(/\n{3,}/g, '\n\n');
  const blocks: DetailBlock[] = [];
  for (const line of description.split('\n')) {
    const text = line.trim();
    if (!text) continue;
    if (BULLET.test(text)) {
      const item = text.replace(BULLET, '').trim();
      if (!item) continue;
      const previous = blocks.at(-1);
      if (previous?.kind === 'list') previous.items.push(item);
      else blocks.push({ kind: 'list', items: [item] });
      continue;
    }
    const pair = LABEL.exec(text);
    if (pair) blocks.push({ kind: 'pair', label: pair[1]!.trim(), text: pair[2]!.trim() });
    else blocks.push({ kind: 'text', text });
  }
  return blocks;
}

function youtubeEmbed(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    let id = '';
    if (url.hostname === 'youtu.be') id = url.pathname.slice(1).split('/')[0] || '';
    if (/^(www\.)?youtube\.com$/.test(url.hostname)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
      else if (url.pathname.startsWith('/shorts/')) id = url.pathname.split('/')[2] || '';
      else if (url.pathname.startsWith('/embed/')) id = url.pathname.split('/')[2] || '';
    }
    return /^[A-Za-z0-9_-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : '';
  } catch {
    return '';
  }
}

export function ProductInfoTabs({
  product,
  canReview = false,
  csrf = '',
}: {
  product: Product;
  canReview?: boolean;
  csrf?: string;
}) {
  const [tab, setTab] = useState<Tab>('details');
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [reviewImages, setReviewImages] = useState<string[]>([]);
  const [uploadingReviewImages, setUploadingReviewImages] = useState(false);
  const [reviewNotice, setReviewNotice] = useState('');
  const queryClient = useQueryClient();
  const reviews = useQuery({
    queryKey: ['reviews.list', product.id],
    queryFn: () => legacyRequest<any>('reviews.list', { product_id: product.id }),
    enabled: tab === 'reviews',
    staleTime: 60_000,
  });
  const createReview = useMutation({
    mutationFn: () =>
      legacyRequest<any>(
        'reviews.create',
        { product_id: product.id, rating, comment, images: reviewImages, csrf },
        'POST',
      ),
    onSuccess: () => {
      setComment('');
      setRating(5);
      setReviewImages([]);
      setReviewNotice('ส่งรีวิวแล้ว ทีมงานจะตรวจสอบก่อนเผยแพร่บนหน้าสินค้า');
      void queryClient.invalidateQueries({ queryKey: ['reviews.list', product.id] });
    },
    onError: (error: any) => {
      const code = String(error?.code || error?.message || 'unknown_error');
      setReviewNotice(code === 'login_required' ? 'กรุณาเข้าสู่ระบบก่อนส่งรีวิว' : `ส่งรีวิวไม่สำเร็จ: ${code}`);
    },
  });
  async function attachReviewImages(files: File[]) {
    const remaining = Math.max(0, 5 - reviewImages.length);
    if (!remaining || !files.length) return;
    setUploadingReviewImages(true);
    setReviewNotice('');
    try {
      const uploaded: string[] = [];
      for (const file of files.slice(0, remaining)) {
        uploaded.push(await uploadReviewImage(file, { productId: product.id, csrf }));
      }
      setReviewImages((current) => [...current, ...uploaded].slice(0, 5));
    } catch (error) {
      setReviewNotice(`แนบรูปไม่สำเร็จ: ${error instanceof Error ? error.message : 'upload_failed'}`);
    } finally {
      setUploadingReviewImages(false);
    }
  }
  const blocks = useMemo(() => detailBlocks(product.description || (product as any).desc || ''), [product]);
  const specs = product.specs && typeof product.specs === 'object' ? Object.entries(product.specs) : [];
  const facts = [
    ['รุ่น', (product as any).model],
    ['หน่วยนับ', (product as any).unit],
    [
      'น้ำหนัก',
      Number((product as any).weight_kg || 0) > 0
        ? `${Number((product as any).weight_kg).toLocaleString('th-TH')} กก.`
        : '',
    ],
    ['การรับประกัน', (product as any).warranty],
    ['ผลิตที่', (product as any).origin],
    [
      'สั่งขั้นต่ำ',
      Number((product as any).min_order_qty || 1) > 1
        ? `${Number((product as any).min_order_qty).toLocaleString('th-TH')} ${(product as any).unit || 'ชิ้น'}`
        : '',
    ],
  ].filter(([, value]) => String(value || '').trim());
  const detailImages = Array.isArray((product as any).detailImages)
    ? (product as any).detailImages.map(String).filter(Boolean)
    : [];
  const embed = youtubeEmbed((product as any).review_video);
  const reviewRows = Array.isArray(reviews.data?.reviews) ? reviews.data.reviews : [];
  const count = Number(reviews.data?.count || reviewRows.length || 0);
  const average = Number(reviews.data?.average || 0);

  const items: Array<[Tab, string]> = [
    ['details', 'รายละเอียดสินค้า'],
    ['specs', 'ข้อมูลจำเพาะ'],
    ['video', 'วีดีโอแนะนำ'],
    ['reviews', `รีวิว${count ? ` (${count})` : ''}`],
  ];
  return (
    <Tabs.Root
      value={tab}
      onValueChange={(value) => setTab(value as Tab)}
      className="mt-10 block overflow-hidden rounded-3xl border bg-white shadow-sm"
      asChild
    >
      <section>
        <div className="overflow-x-auto border-b bg-slate-50/70">
          <Tabs.List className="flex min-w-max gap-1 p-2" aria-label="ข้อมูลสินค้า">
            {items.map(([key, label]) => (
              <Tabs.Trigger
                key={key}
                value={key}
                className={`rounded-xl px-4 py-2.5 text-sm font-bold ${tab === key ? 'bg-emerald-950 text-white' : 'text-slate-600 hover:bg-white'}`}
              >
                {label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </div>

        <Tabs.Content value={tab} className="p-5 sm:p-7">
          {tab === 'details' && (
            <div>
              {blocks.length ? (
                <div className="space-y-4 text-sm leading-7 text-slate-700">
                  {blocks.map((block, index) =>
                    block.kind === 'list' ? (
                      <ul key={index} className="ml-5 list-disc space-y-1 marker:text-emerald-700">
                        {block.items.map((item, itemIndex) => (
                          <li key={itemIndex}>{item}</li>
                        ))}
                      </ul>
                    ) : block.kind === 'pair' ? (
                      <p
                        key={index}
                        className="grid gap-1 rounded-xl bg-slate-50 p-3 sm:grid-cols-[180px_1fr]"
                      >
                        <strong className="text-slate-900">{block.label}</strong>
                        <span>{block.text}</span>
                      </p>
                    ) : (
                      <p key={index}>{block.text}</p>
                    ),
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  สินค้าคุณภาพจาก THAISERKIT SUPPLY พร้อมจัดส่งทั่วประเทศและบริการหลังการขาย
                </p>
              )}
              {detailImages.length > 0 && (
                <div className="mt-7 space-y-4">
                  {detailImages.map((image: string, index: number) => (
                    <div
                      key={`${image}-${index}`}
                      className="relative mx-auto aspect-[4/3] w-full max-w-4xl overflow-hidden rounded-2xl bg-slate-50"
                    >
                      <Image
                        src={image}
                        alt={`${product.name} รายละเอียด ${index + 1}`}
                        fill
                        sizes="(max-width: 1024px) 100vw, 900px"
                        className="object-contain"
                        unoptimized={image.startsWith('data:')}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'specs' && (
            <div>
              {facts.length || specs.length ? (
                <dl className="overflow-hidden rounded-2xl border">
                  {[...facts, ...specs].map(([label, value], index) => (
                    <div
                      key={`${String(label)}-${index}`}
                      className="grid gap-1 border-b p-3 text-sm last:border-b-0 sm:grid-cols-[220px_1fr]"
                    >
                      <dt className="font-bold text-slate-800">{String(label)}</dt>
                      <dd className="text-slate-600">
                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <Empty
                  icon={MessageSquareText}
                  title="ยังไม่มีข้อมูลจำเพาะเพิ่มเติม"
                  text="ติดต่อทีมงานเพื่อขอรายละเอียดของสินค้านี้ได้ทันที"
                />
              )}
            </div>
          )}

          {tab === 'video' &&
            (embed ? (
              <div className="aspect-video overflow-hidden rounded-2xl bg-black">
                <iframe
                  src={embed}
                  title={`วีดีโอแนะนำ ${product.name}`}
                  className="h-full w-full"
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            ) : (
              <Empty
                icon={Play}
                title="ยังไม่มีวีดีโอแนะนำสำหรับสินค้านี้"
                text="ทีมงานกำลังทยอยเพิ่มคลิปการใช้งานจริง หากต้องการข้อมูลเพิ่มเติมสามารถสอบถามทีมงานได้"
              />
            ))}

          {tab === 'reviews' && (
            <div className="space-y-6">
              <section className="rounded-2xl border bg-slate-50 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-black text-slate-900">เขียนรีวิวสินค้า</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      ลูกค้าที่เข้าสู่ระบบสามารถส่งรีวิวได้ รีวิวใหม่จะอยู่ในสถานะรอตรวจสอบ และระบบจะติดป้าย “ซื้อจริง”
                      ให้อัตโนมัติเมื่อพบออเดอร์ของสินค้านี้
                    </p>
                  </div>
                  {!canReview && (
                    <Link
                      href={`/login?redirect=${encodeURIComponent(`/products/${product.id}`)}`}
                      className="rounded-xl bg-emerald-950 px-3 py-2 text-xs font-bold text-white"
                    >
                      เข้าสู่ระบบเพื่อรีวิว
                    </Link>
                  )}
                </div>
                {canReview && (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      setReviewNotice('');
                      if (comment.trim() && !uploadingReviewImages) createReview.mutate();
                    }}
                    className="mt-4 grid gap-3"
                  >
                    <div>
                      <span className="mb-1 block text-xs font-bold text-slate-600">คะแนน</span>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setRating(star)}
                            aria-label={`${star} ดาว`}
                            className={`text-2xl ${star <= rating ? 'text-amber-500' : 'text-slate-300'}`}
                          >
                            ★
                          </button>
                        ))}
                      </div>
                    </div>
                    <label>
                      <span className="mb-1.5 block text-xs font-bold text-slate-600">ความคิดเห็น</span>
                      <textarea
                        required
                        minLength={2}
                        maxLength={2000}
                        rows={4}
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                        className="w-full rounded-xl border bg-white p-3 text-sm outline-none focus:border-emerald-600"
                        placeholder="บอกประสบการณ์ใช้งานจริง จุดเด่น หรือคำแนะนำสำหรับลูกค้าคนอื่น"
                      />
                    </label>
                    <div>
                      <span className="mb-1.5 block text-xs font-bold text-slate-600">
                        รูปประกอบ (สูงสุด 5 รูป, รูปละไม่เกิน 5 MB)
                      </span>
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-emerald-600">
                        <ImagePlus size={15} />
                        {uploadingReviewImages ? 'กำลังอัปโหลด…' : 'แนบรูป'}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                          multiple
                          disabled={uploadingReviewImages || reviewImages.length >= 5}
                          className="sr-only"
                          onChange={(event) => {
                            const files = Array.from(event.target.files || []);
                            event.currentTarget.value = '';
                            void attachReviewImages(files);
                          }}
                        />
                      </label>
                      {reviewImages.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {reviewImages.map((image, index) => (
                            <div
                              key={`${image}-${index}`}
                              className="relative size-20 overflow-hidden rounded-xl border bg-white"
                            >
                              <img
                                src={image}
                                alt={`รูปรีวิว ${index + 1}`}
                                className="size-full object-cover"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setReviewImages((current) =>
                                    current.filter((_, itemIndex) => itemIndex !== index),
                                  )
                                }
                                className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white"
                                aria-label={`ลบรูปรีวิว ${index + 1}`}
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="submit"
                        disabled={createReview.isPending || uploadingReviewImages || !comment.trim()}
                        className="rounded-xl bg-emerald-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                      >
                        {createReview.isPending ? 'กำลังส่ง…' : 'ส่งรีวิว'}
                      </button>
                      {reviewNotice && (
                        <p
                          className={`text-xs font-semibold ${reviewNotice.startsWith('ส่งรีวิวแล้ว') ? 'text-emerald-700' : 'text-rose-700'}`}
                        >
                          {reviewNotice}
                        </p>
                      )}
                    </div>
                  </form>
                )}
              </section>
              <div>
                {reviews.isPending ? (
                  <p className="py-10 text-center text-sm text-slate-500">กำลังโหลดรีวิว…</p>
                ) : reviews.isError ? (
                  <Empty icon={Star} title="โหลดรีวิวไม่สำเร็จ" text="กรุณาลองใหม่อีกครั้ง" />
                ) : reviewRows.length ? (
                  <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
                    <aside className="h-fit rounded-2xl bg-amber-50 p-5 text-center">
                      <strong className="text-4xl font-black text-amber-800">{average.toFixed(1)}</strong>
                      <div
                        className="mt-2 text-lg tracking-widest text-amber-500"
                        role="img"
                        aria-label={`คะแนนเฉลี่ย ${average.toFixed(1)} จาก 5`}
                      >
                        {[1, 2, 3, 4, 5].map((star) => (
                          <span key={star}>{star <= Math.round(average) ? '★' : '☆'}</span>
                        ))}
                      </div>
                      <p className="mt-1 text-xs text-amber-800">จาก {count.toLocaleString('th-TH')} รีวิว</p>
                    </aside>
                    <div className="space-y-3">
                      {reviewRows.map((review: any, index: number) => (
                        <article key={String(review.id || index)} className="rounded-2xl border p-4">
                          <header className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <strong className="text-sm">
                                {review.customer_name || review.name || 'ลูกค้า'}
                              </strong>
                              {review.verified_purchase && (
                                <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                  ซื้อจริง
                                </span>
                              )}
                            </div>
                            <span className="text-sm text-amber-500">
                              {[1, 2, 3, 4, 5]
                                .map((star) => (star <= Number(review.rating || 0) ? '★' : '☆'))
                                .join('')}
                            </span>
                          </header>
                          {(review.comment || review.text) && (
                            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                              {review.comment || review.text}
                            </p>
                          )}
                          {Array.isArray(review.images) && review.images.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {review.images.slice(0, 5).map((image: unknown, imageIndex: number) => (
                                <a
                                  key={`${String(image)}-${imageIndex}`}
                                  href={String(image)}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <img
                                    src={String(image)}
                                    alt={`รูปจากรีวิว ${index + 1}-${imageIndex + 1}`}
                                    className="size-20 rounded-xl border object-cover"
                                    loading="lazy"
                                  />
                                </a>
                              ))}
                            </div>
                          )}
                          <time className="mt-2 block text-[11px] text-slate-400">
                            {review.created_at
                              ? new Date(review.created_at).toLocaleDateString('th-TH', {
                                  dateStyle: 'medium',
                                })
                              : ''}
                          </time>
                        </article>
                      ))}
                    </div>
                  </div>
                ) : (
                  <Empty icon={Star} title="ยังไม่มีรีวิวสำหรับสินค้านี้" text="รีวิวจากลูกค้าที่ได้รับการอนุมัติจะแสดงที่นี่" />
                )}
              </div>
            </div>
          )}
        </Tabs.Content>
      </section>
    </Tabs.Root>
  );
}

function Empty({ icon: Icon, title, text }: { icon: typeof Star; title: string; text: string }) {
  return (
    <div className="grid place-items-center py-10 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-slate-100 text-slate-500">
        <Icon />
      </span>
      <strong className="mt-3">{title}</strong>
      <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">{text}</p>
    </div>
  );
}
