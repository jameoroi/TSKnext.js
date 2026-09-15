'use client';

import { Eye, ImagePlus, Pencil, Smile, Video } from 'lucide-react';
import { useRef, useState } from 'react';
import { scaleImageFile, uploadAdminImage } from '@/lib/admin-media.client';

const EMOJI = [
  '😀',
  '😊',
  '😍',
  '🥳',
  '😎',
  '🤩',
  '👍',
  '🙏',
  '👏',
  '💪',
  '🔥',
  '⚡',
  '✨',
  '🎉',
  '🎁',
  '🛒',
  '🛍️',
  '💰',
  '💸',
  '🏷️',
  '📣',
  '📢',
  '⏰',
  '🚚',
  '📦',
  '✅',
  '❤️',
  '💚',
  '⭐',
  '🌟',
  '🔧',
  '🔨',
  '🛠️',
  '⚙️',
  '🪚',
  '🔩',
  '🧰',
  '🌾',
  '🚜',
  '💧',
  '☀️',
  '🇹🇭',
];

const IMAGE_URL = /^https:\/\/\S+\.(?:png|jpe?g|webp|gif|avif)(?:\?\S*)?$|^https:\/\/\S+\/media\/\S+$/i;
const YOUTUBE = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/;
const VIDEO_URL =
  /^https:\/\/\S+\.(?:mp4|webm|mov)(?:\?\S*)?$|youtube\.com|youtu\.be|vimeo\.com|facebook\.com\/.*\/videos|tiktok\.com/i;

/**
 * A message box that takes pictures, video links and emoji.
 *
 * Pictures upload to managed media and go in as their address on a line of
 * their own; a video link on its own line becomes a clickable thumbnail. The
 * server renders the same rules into the email (newsletterHtml in the API), and
 * the preview here shows what the recipient will see.
 */
export function RichMessageField({
  value,
  onChange,
  csrf,
  disabled = false,
  rows = 8,
  className = 'textarea',
  required = false,
}: {
  value: string;
  onChange: (next: string) => void;
  csrf: string;
  disabled?: boolean;
  rows?: number;
  className?: string;
  required?: boolean;
}) {
  const area = useRef<HTMLTextAreaElement | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [preview, setPreview] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState('');

  function insert(text: string, ownLine = false) {
    const node = area.current;
    const start = node?.selectionStart ?? value.length;
    const end = node?.selectionEnd ?? value.length;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const piece = ownLine
      ? `${before && !before.endsWith('\n') ? '\n' : ''}${text}\n${after.startsWith('\n') ? '' : ''}`
      : text;
    const next = `${before}${piece}${after}`;
    onChange(next);
    requestAnimationFrame(() => {
      if (!node) return;
      const caret = before.length + piece.length;
      node.focus();
      node.setSelectionRange(caret, caret);
    });
  }

  async function addImages(files: File[]) {
    if (!files.length) return;
    setUploading(true);
    setProblem('');
    try {
      for (const file of files) {
        const prepared = await scaleImageFile(file, 1600);
        const url = await uploadAdminImage(prepared, { ownerType: 'newsletter', csrf });
        if (!/^https:\/\//i.test(url)) throw new Error('ต้องตั้งค่าที่เก็บรูป (R2) ก่อนจึงจะแนบรูปในอีเมลได้');
        insert(url, true);
      }
    } catch (error) {
      setProblem(`แนบรูปไม่สำเร็จ: ${error instanceof Error ? error.message : 'upload_failed'}`);
    } finally {
      setUploading(false);
    }
  }

  function addVideo() {
    const url = videoUrl.trim();
    if (!/^https:\/\//i.test(url)) {
      setProblem('ลิงก์วิดีโอต้องขึ้นต้นด้วย https://');
      return;
    }
    setProblem('');
    insert(url, true);
    setVideoUrl('');
  }

  const tool =
    'inline-flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:border-emerald-400 disabled:opacity-40';

  return (
    <div className="mt-1 grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <button
            type="button"
            className={tool}
            disabled={disabled}
            onClick={() => setEmojiOpen((open) => !open)}
          >
            <Smile size={14} /> อีโมจิ
          </button>
          {emojiOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 grid w-72 grid-cols-8 gap-1 rounded-xl border bg-white p-2 shadow-lg">
              {EMOJI.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="rounded-md p-1 text-lg hover:bg-emerald-50"
                  onClick={() => {
                    insert(emoji);
                    setEmojiOpen(false);
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
        <label className={`${tool} cursor-pointer`}>
          <ImagePlus size={14} /> {uploading ? 'กำลังอัปโหลด…' : 'แทรกรูป'}
          <input
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            disabled={disabled || uploading}
            onChange={(e) => {
              const files = Array.from(e.target.files || []) as File[];
              e.currentTarget.value = '';
              void addImages(files);
            }}
          />
        </label>
        <div className="flex items-center gap-1">
          <input
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="วางลิงก์ YouTube / วิดีโอ"
            className="h-8 w-52 rounded-lg border px-2 text-xs"
            disabled={disabled}
          />
          <button type="button" className={tool} disabled={disabled || !videoUrl.trim()} onClick={addVideo}>
            <Video size={14} /> แทรกวิดีโอ
          </button>
        </div>
        <button type="button" className={`${tool} ml-auto`} onClick={() => setPreview((open) => !open)}>
          {preview ? <Pencil size={14} /> : <Eye size={14} />} {preview ? 'แก้ไขข้อความ' : 'ดูตัวอย่าง'}
        </button>
      </div>
      {problem && <p className="text-xs font-semibold text-rose-700">{problem}</p>}
      {preview ? (
        <div className="min-h-40 rounded-xl border bg-slate-50 p-4 text-sm leading-7 text-slate-800">
          {value.trim() ? <MessagePreview value={value} /> : <p className="text-slate-400">ยังไม่มีข้อความ</p>}
        </div>
      ) : (
        <textarea
          ref={area}
          required={required}
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={className}
          disabled={disabled}
        />
      )}
      <p className="text-[11px] text-slate-500">
        รูปและวิดีโอจะอยู่คนละบรรทัด — อีเมลส่วนใหญ่เล่นวิดีโอในกล่องจดหมายไม่ได้ ผู้รับจะเห็นภาพปกที่กดไปดูได้
      </p>
    </div>
  );
}

function MessagePreview({ value }: { value: string }) {
  const lines = value.split('\n');
  return (
    <div className="grid gap-2">
      {lines.map((raw, index) => {
        const line = raw.trim();
        const key = `${index}-${line.slice(0, 20)}`;
        if (!line) return <div key={key} className="h-2" />;
        if (IMAGE_URL.test(line))
          // biome-ignore lint/performance/noImgElement: preview of an uploaded picture
          return <img key={key} src={line} alt="" className="max-h-80 w-full rounded-lg object-contain" />;
        const youtube = line.match(YOUTUBE);
        if (youtube || VIDEO_URL.test(line))
          return (
            <a
              key={key}
              href={line}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-lg border bg-black"
            >
              {youtube ? (
                // biome-ignore lint/performance/noImgElement: YouTube thumbnail preview
                <img
                  src={`https://img.youtube.com/vi/${youtube[1]}/hqdefault.jpg`}
                  alt=""
                  className="w-full opacity-90"
                />
              ) : null}
              <span className="block bg-emerald-800 px-3 py-2 text-center text-xs font-bold text-white">
                ▶ ดูวิดีโอ
              </span>
            </a>
          );
        return (
          <p key={key} className="whitespace-pre-wrap break-words">
            {raw}
          </p>
        );
      })}
    </div>
  );
}
