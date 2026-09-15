import { Truck } from 'lucide-react';
import { BRAND_GLYPHS } from './brand-icon-paths';

type SocialKey = 'facebook' | 'line' | 'youtube' | 'tiktok' | 'instagram';

// Real brand colours for each round social badge; the glyph sits in white on top.
const SOCIAL_BACKGROUND: Record<SocialKey, string> = {
  facebook: '#0866FF',
  line: '#06C755',
  youtube: '#FF0000',
  tiktok: '#000000',
  instagram:
    'radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)',
};

function Glyph({ path, fill, size }: { path: string; fill: string; size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path d={path} fill={fill} />
    </svg>
  );
}

/**
 * Round social badge in the service's own colours. With `href` it is a link that
 * pops like every other card; without it (an account not opened yet) it still
 * shows the real logo, slightly muted and not clickable.
 */
export function SocialBadge({ service, href, label }: { service: SocialKey; href?: string; label?: string }) {
  const glyph = BRAND_GLYPHS[service];
  const name = label || glyph.title;
  const className =
    'grid size-10 place-items-center rounded-full shadow-[0_6px_14px_-6px_rgb(0_0_0/0.45)] ring-1 ring-white/15';
  const style = { background: SOCIAL_BACKGROUND[service] };
  if (!href)
    return (
      <span
        role="img"
        aria-label={`${name} (ยังไม่เปิดใช้งาน)`}
        className={`${className} opacity-70`}
        style={style}
      >
        <Glyph path={glyph.path} fill="#fff" size={19} />
      </span>
    );
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={name}
      className={`tsk-pop ${className}`}
      style={style}
    >
      <Glyph path={glyph.path} fill="#fff" size={19} />
    </a>
  );
}

const card =
  'grid h-9 min-w-16 place-items-center rounded-lg bg-white px-2.5 shadow-[0_6px_14px_-8px_rgb(0_0_0/0.5)]';

/** Accepted payment methods as their real marks on white cards. */
export function PaymentBadges() {
  return (
    <ul className="flex flex-wrap items-center gap-2" aria-label="ช่องทางการชำระเงิน">
      <li className={card} title="Visa">
        <svg
          viewBox="0 0 24 24"
          width={46}
          height={20}
          aria-label="Visa"
          role="img"
          preserveAspectRatio="xMidYMid meet"
        >
          <path d={BRAND_GLYPHS.visa.path} fill={BRAND_GLYPHS.visa.hex} />
        </svg>
      </li>
      <li className={card} title="Mastercard">
        <svg viewBox="0 0 38 24" width={40} height={25} aria-label="Mastercard" role="img">
          <circle cx="14" cy="12" r="9" fill="#EB001B" />
          <circle cx="24" cy="12" r="9" fill="#F79E1B" />
          <path d="M19 4.4a9 9 0 0 1 0 15.2 9 9 0 0 1 0-15.2Z" fill="#FF5F00" />
        </svg>
      </li>
      <li className={card} title="PromptPay">
        <span className="text-[13px] font-black leading-none tracking-tight" aria-label="PromptPay">
          <span className="text-[#003D6A]">Prompt</span>
          <span className="text-[#0A9DDA]">Pay</span>
        </span>
      </li>
      <li className={`${card} gap-1`} title="เก็บเงินปลายทาง (COD)">
        <span
          className="flex items-center gap-1 text-[12px] font-black text-emerald-800"
          aria-label="เก็บเงินปลายทาง COD"
        >
          <Truck size={16} strokeWidth={2.4} aria-hidden="true" />
          COD
        </span>
      </li>
    </ul>
  );
}
