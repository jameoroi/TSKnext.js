import { css } from '@lit/reactive-element';
import { nothing } from 'lit';
import { LitElement } from 'lit-element';
import { html } from 'lit-html';

/**
 * <tsk-image-zoom> — Amazon-style hover zoom for the product page.
 *
 * The slotted image (a next/image in light DOM, so SSR and LCP are untouched)
 * is the preview. On a fine pointer, hovering shows a lens over it and a pane
 * to its right with the zoom-src image magnified under the lens. The slotted
 * image and the pane image both use object-fit: contain in boxes of the same
 * aspect ratio, so lens coordinates map to the pane by one scale factor.
 *
 * Defined only in the browser (dynamically imported by ProductGallery):
 * Workers SSR has no HTMLElement, and the server just emits the tag and slot.
 */
export class TskImageZoom extends LitElement {
  static properties = {
    zoomSrc: { type: String, attribute: 'zoom-src' },
    zoom: { type: Number },
    active: { state: true },
  };

  declare zoomSrc: string;
  declare zoom: number;
  declare active: boolean;

  constructor() {
    super();
    this.zoomSrc = '';
    this.zoom = 2.5;
    this.active = false;
  }

  static styles = css`
    :host {
      position: relative;
      display: block;
      width: 100%;
      height: 100%;
    }
    .lens {
      position: absolute;
      pointer-events: none;
      border: 1px solid rgb(15 23 42 / 0.35);
      background-color: rgb(255 255 255 / 0.25);
      background-image: radial-gradient(rgb(15 23 42 / 0.25) 1px, transparent 1px);
      background-size: 3px 3px;
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
      box-shadow: 0 20px 40px -12px rgb(15 23 42 / 0.25);
    }
    .pane img {
      position: absolute;
      top: 0;
      left: 0;
      max-width: none;
      object-fit: contain;
      will-change: transform;
    }
  `;

  #lens?: HTMLElement | null;
  #pane?: HTMLElement | null;
  #paneImg?: HTMLImageElement | null;
  #frame = 0;
  #canHover = globalThis.matchMedia?.('(hover: hover) and (pointer: fine) and (min-width: 1024px)');

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

  #enter = (event: PointerEvent) => {
    if (!this.zoomSrc || event.pointerType !== 'mouse' || !this.#canHover?.matches) return;
    this.active = true;
    this.updateComplete.then(() => this.#move(event));
  };

  #leave = () => {
    this.active = false;
  };

  #move = (event: PointerEvent) => {
    if (!this.active) return;
    const { clientX, clientY } = event;
    cancelAnimationFrame(this.#frame);
    this.#frame = requestAnimationFrame(() => this.#place(clientX, clientY));
  };

  #place(clientX: number, clientY: number) {
    this.#lens ??= this.renderRoot.querySelector('.lens');
    this.#pane ??= this.renderRoot.querySelector('.pane');
    this.#paneImg ??= this.renderRoot.querySelector('.pane img');
    const lens = this.#lens;
    const pane = this.#pane;
    const img = this.#paneImg;
    if (!lens || !pane || !img) return;

    const box = this.getBoundingClientRect();
    const zoom = Math.max(1.5, this.zoom || 2.5);
    // The pane matches the preview and never runs past the viewport edge.
    const paneLeft = pane.getBoundingClientRect().left;
    const paneWidth = Math.max(0, Math.min(box.width, window.innerWidth - paneLeft - 16));
    const paneHeight = box.height;
    const lensWidth = paneWidth / zoom;
    const lensHeight = paneHeight / zoom;
    const x = Math.min(Math.max(clientX - box.left - lensWidth / 2, 0), box.width - lensWidth);
    const y = Math.min(Math.max(clientY - box.top - lensHeight / 2, 0), box.height - lensHeight);

    lens.style.cssText = `left:${x}px;top:${y}px;width:${lensWidth}px;height:${lensHeight}px`;
    pane.style.width = `${paneWidth}px`;
    pane.style.height = `${paneHeight}px`;
    img.style.width = `${box.width * zoom}px`;
    img.style.height = `${box.height * zoom}px`;
    img.style.transform = `translate(${-x * zoom}px, ${-y * zoom}px)`;
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('active') && !this.active) {
      this.#lens = this.#pane = this.#paneImg = null;
    }
  }

  render() {
    return html`
      <slot></slot>
      ${
        this.active
          ? html`<div class="lens" part="lens"></div>
            <div class="pane" part="pane" aria-hidden="true"><img src=${this.zoomSrc} alt="" decoding="async" /></div>`
          : nothing
      }
    `;
  }
}

if (!customElements.get('tsk-image-zoom')) customElements.define('tsk-image-zoom', TskImageZoom);

declare global {
  interface HTMLElementTagNameMap {
    'tsk-image-zoom': TskImageZoom;
  }
}
