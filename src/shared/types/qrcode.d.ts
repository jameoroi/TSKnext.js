/**
 * `qrcode` ships no type declarations, so importing it produced an implicit
 * `any` for the whole module — which is why the one call site had to annotate
 * `const mod: any` and lost every check on the options it passes.
 *
 * Only the surface this project uses is declared. Widen it when something else
 * is needed, rather than reaching for `any` again at the call site.
 */
declare module 'qrcode' {
  export interface QRCodeToDataURLOptions {
    /** Quiet-zone width, in modules. */
    margin?: number;
    /** Output width in pixels; height follows, the code being square. */
    width?: number;
    /** How much of the code can be obscured and still scan. */
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    /** Image MIME type; PNG unless told otherwise. */
    type?: 'image/png' | 'image/jpeg' | 'image/webp';
    color?: { dark?: string; light?: string };
  }

  export function toDataURL(text: string, options?: QRCodeToDataURLOptions): Promise<string>;
  export function toString(text: string, options?: QRCodeToDataURLOptions & { type?: 'svg' | 'utf8' | 'terminal' }): Promise<string>;

  const QRCode: { toDataURL: typeof toDataURL; toString: typeof toString };
  export default QRCode;
}
