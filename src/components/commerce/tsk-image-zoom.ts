import { css } from '@lit/reactive-element';
import { nothing } from 'lit';
import { LitElement } from 'lit-element';
import { html } from 'lit-html';

type Mode = 'pane' | 'inline';

/**
 * <tsk-image-zoom> — Amazon-style hover zoom for the product photo.
 *
 * The slotted image (a next/image in light DOM, so SSR and LCP are untouched)
 * is the preview. On a hover-capable fine pointer:
 * - pane mode (wide screens with room to the right): a lens follows the cursor
 *   over the photo and a separate pane beside it shows the magnified area;
 * - inline mode (no room for the pane): the photo zooms inside its own frame
 *   around the cursor, so narrower layouts still get a zoom.
 * Geometry is taken from the slotted <img>, so the frame padding around the
 * photo is accounted for in both modes.
 *
 * Defined only in the browser (dynamically imported by ProductGallery):
 * Workers SSR has no HTMLElement, and the server just emits the tag and slot.
 */
export class TskImageZoom extends LitElement {
  static properties = {
    zoomSrc: { type: String, attribute: 'zoom-src' },
    zoom: { type: Number },
    mode: { state: true },
    loaded: { state: true },
  };

  declare zoomSrc: string;
  declare zoom: number;
  declare mode: Mode | null;
  declare loaded: boolean;

  constructor() {
    super();
    this.zoomSrc = '';
    this.zoom = 2.5;
    this.mode = null;
    this.loaded = false;
  }

  static styles = css`
    :host {
      position: relative;
      display: block;
      width: 100%;
      height: 100%;
    }
    .clip {
      position: absolute;
      inset: 0;
      overflow: hidden;
      border-radius: inherit;
      pointer-events: none;
    }
    .inline {
      position: absolute;
      inset: 0;
      background: #fff;
      opacity: 0;
      transition: opacity 0.18s ease-out;
    }
    .inline img {
      position: absolute;
      max-width: none;
      object-fit: contain;
      will-change: transform, transform-origin;
    }
    .lens {
      position: absolute;
      pointer-events: none;
      border: 1px solid rgb(15 23 42 / 0.35);
      background-color: rgb(255 255 255 / 0.3);
      background-image: radial-gradient(rgb(15 23 42 / 0.28) 1px, transparent 1px);
      background-size: 3px 3px;
      opacity: 0;
      transition: opacity 0.15s ease-out;
    }
    .pane {
      position: absolute;
      top: 0;
      left: calc(100% + var(--tsk-zoom-gap, 1.5rem));
      z-index: 40;
      overflow: hidden;
      pointer-events: none;
      border: 1px solid rgb(226 232 240);
      border-radius: 1rem;
      background: #fff;
      box-shadow: 0 24px 48px -16px rgb(15 23 42 / 0.3);
      opacity: 0;
      transition: opacity 0.18s ease-out;
    }
    .pane img {
      position: absolute;
      top: 0;
      left: 0;
      box-sizing: border-box;
      max-width: none;
      object-fit: contain;
      will-change: transform;
    }
    .ready {
      opacity: 1;
    }
  `;

  #frame = 0;
  #canHover = globalThis.matchMedia?.('(hover: hover) and (pointer: fine)');
  #wide = globalThis.matchMedia?.('(min-width: 1024px)');

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('pointerenter', this.#enter);
    this.addEventListener('pointermove', this.#move);
    this.addEventListener('pointerleave', this.#leave);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('pointerenter', this.#enter);
    this.removeEventListener('pointermove', this.#move);
    this.removeEventListener('pointerleave', this.#leave);
    cancelAnimationFrame(this.#frame);
  }

  #gap() {
    const probe = Number.parseFloat(getComputedStyle(this).getPropertyValue('--tsk-zoom-gap'));
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return Number.isFinite(probe) ? probe * rem : 1.5 * rem;
  }

  #enter = (event: PointerEvent) => {
    if (!this.zoomSrc || event.pointerType !== 'mouse' || !this.#canHover?.matches) return;
    const room = window.innerWidth - this.getBoundingClientRect().right - this.#gap() - 16;
    this.mode = this.#wide?.matches && room >= 320 ? 'pane' : 'inline';
    this.updateComplete.then(() => this.#move(event));
  };

  #leave = () => {
    this.mode = null;
    this.loaded = false;
  };

  #move = (event: PointerEvent) => {
    if (!this.mode) return;
    const { clientX, clientY } = event;
    cancelAnimationFrame(this.#frame);
    this.#frame = requestAnimationFrame(() => this.#place(clientX, clientY));
  };

  /** The photo's box inside the host (the slotted image sits inside frame padding). */
  #photo() {
    const host = this.getBoundingClientRect();
    const img = this.querySelector('img')?.getBoundingClientRect();
    if (!img?.width) return { host, left: 0, top: 0, width: host.width, height: host.height };
    return {
      host,
      left: img.left - host.left,
      top: img.top - host.top,
      width: img.width,
      height: img.height,
    };
  }

  #place(clientX: number, clientY: number) {
    const zoom = Math.max(1.5, this.zoom || 2.5);
    const photo = this.#photo();
    const root = this.renderRoot;

    if (this.mode === 'inline') {
      const img = root.querySelector<HTMLImageElement>('.inline img');
      if (!img) return;
      img.style.cssText = `left:${photo.left}px;top:${photo.top}px;width:${photo.width}px;height:${photo.height}px`;
      const x = Math.min(Math.max((clientX - photo.host.left - photo.left) / photo.width, 0), 1) * 100;
      const y = Math.min(Math.max((clientY - photo.host.top - photo.top) / photo.height, 0), 1) * 100;
      img.style.transformOrigin = `${x}% ${y}%`;
      img.style.transform = `scale(${zoom})`;
      return;
    }

    const lens = root.querySelector<HTMLElement>('.lens');
    const pane = root.querySelector<HTMLElement>('.pane');
    const img = root.querySelector<HTMLImageElement>('.pane img');
    if (!lens || !pane || !img) return;

    const paneLeft = photo.host.right + this.#gap();
    const paneWidth = Math.max(0, Math.min(photo.host.width, window.innerWidth - paneLeft - 16));
    const paneHeight = photo.host.height;
    pane.style.width = `${paneWidth}px`;
    pane.style.height = `${paneHeight}px`;

    // The lens covers the part of the photo the pane shows, clamped to the photo.
    const lensWidth = Math.min(paneWidth / zoom, photo.width);
    const lensHeight = Math.min(paneHeight / zoom, photo.height);
    const x = Math.min(
      Math.max(clientX - photo.host.left - lensWidth / 2, photo.left),
      photo.left + photo.width - lensWidth,
    );
    const y = Math.min(
      Math.max(clientY - photo.host.top - lensHeight / 2, photo.top),
      photo.top + photo.height - lensHeight,
    );
    lens.style.cssText = `left:${x}px;top:${y}px;width:${lensWidth}px;height:${lensHeight}px`;

    img.style.width = `${photo.width * zoom}px`;
    img.style.height = `${photo.height * zoom}px`;
    img.style.transform = `translate(${-(x - photo.left) * zoom}px, ${-(y - photo.top) * zoom}px)`;
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('zoomSrc')) this.loaded = false;
  }

  #onLoad = () => {
    this.loaded = true;
  };

  render() {
    const ready = this.loaded ? 'ready' : '';
    if (this.mode === 'inline') {
      return html`<slot></slot>
        <div class="clip" aria-hidden="true">
          <div class="inline ${ready}" part="inline">
            <img src=${this.zoomSrc} alt="" decoding="async" @load=${this.#onLoad} />
          </div>
        </div>`;
    }
    if (this.mode === 'pane') {
      return html`<slot></slot>
        <div class="lens ${ready}" part="lens" aria-hidden="true"></div>
        <div class="pane ${ready}" part="pane" aria-hidden="true">
          <img src=${this.zoomSrc} alt="" decoding="async" @load=${this.#onLoad} />
        </div>`;
    }
    return html`<slot></slot>${nothing}`;
  }
}

if (!customElements.get('tsk-image-zoom')) customElements.define('tsk-image-zoom', TskImageZoom);

declare global {
  interface HTMLElementTagNameMap {
    'tsk-image-zoom': TskImageZoom;
  }
}
