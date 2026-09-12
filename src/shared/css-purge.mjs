/**
 * Drops rules from the inherited stylesheet chain that can never match anything
 * the Nuxt app renders.
 *
 * The chain in nuxt.config.ts was lifted whole from the static site this project
 * replaced. The shop is served from `app/` now and the pages under `site/` are
 * only kept as legacy assets, so a large part of those sheets styles markup no
 * shopper can reach — measured at 288 KB of 449 KB whose classes appear only in
 * `site/*.html`. See docs/PERFORMANCE-AUDIT-2026-08.md §2.1.
 *
 * Deleting whole files is not an option: only 17% of declarations are shadowed
 * outright and no file is more than 53% dead, so every one of them still styles
 * something. The cut has to be per rule.
 *
 * ## What makes a selector safe to drop
 *
 * A compound selector matches only if every class in it is present. So a
 * selector is dead when ANY class it requires never appears anywhere in the
 * app's source. That is a much stronger signal than "this class is unused",
 * and it is the only one used here.
 *
 * Three things are deliberately never touched, because getting them wrong is
 * invisible until a page is looked at:
 *
 *  - `:not()`, `:is()`, `:where()` and `:has()` invert or loosen the test —
 *    `.a:not(.b)` matches *because* `.b` is absent — so classes inside them
 *    are ignored when deciding.
 *  - At-rules that define things by name (`@keyframes`, `@font-face`,
 *    `@property`) are kept whole; an animation is referenced by a string that
 *    no selector analysis can see.
 *  - Any rule that declares a custom property, or whose selector reaches
 *    `:root`/`html`/`body`, is kept regardless. Those are the design tokens the
 *    rest of the cascade is built on.
 *
 * The token universe is deliberately over-inclusive: every identifier-shaped
 * string in every `.vue`/`.ts` file, not just the ones in `class` attributes.
 * A class assembled at runtime out of a template literal still has its literal
 * parts in the source, and anything spelled anywhere at all is treated as live.
 */

/** Identifier-shaped runs, which is how class names appear in source. */
const TOKEN = /[A-Za-z_][\w-]*/g;

/** Selectors whose rules are never dropped, whatever classes they mention. */
const STRUCTURAL = /(^|[\s,>+~])(:root|html|body|\*)(\b|[.:[#])|^(:root|html|body|\*)$/;

/** Functional pseudo-classes whose contents must not count as "required". */
const LOOSENING = /:(?:not|is|where|has|matches|any)\([^()]*(?:\([^()]*\)[^()]*)*\)/g;

/**
 * Every identifier that appears anywhere in the given sources.
 *
 * Over-inclusive on purpose. A false "live" costs a few bytes; a false "dead"
 * costs a broken page.
 */
export function tokenUniverse(sources) {
  const universe = new Set();
  for (const text of sources) for (const match of String(text).matchAll(TOKEN)) universe.add(match[0]);
  return universe;
}

/** The classes a selector *requires*, ignoring any inside loosening functions. */
export function requiredClasses(selector) {
  const bare = String(selector).replace(LOOSENING, ' ');
  return [...bare.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((match) => match[1]);
}

/** True when this selector could still match something the app renders. */
export function selectorIsLive(selector, universe) {
  const text = String(selector).trim();
  if (!text) return false;
  if (STRUCTURAL.test(text)) return true;
  const required = requiredClasses(text);
  // No class at all: an element, attribute or pseudo selector. Keep it — those
  // reach markup this analysis cannot enumerate.
  if (!required.length) return true;
  return required.every((name) => universe.has(name));
}

/**
 * Splits a selector list on commas that are not inside brackets or parentheses,
 * so `:is(a, b)` and `[x=","]` stay in one piece.
 */
function splitSelectorList(head) {
  const parts = [];
  let depth = 0;
  let quote = '';
  let current = '';
  for (const char of head) {
    if (quote) { current += char; if (char === quote) quote = ''; continue; }
    if (char === '"' || char === "'") { quote = char; current += char; continue; }
    if (char === '(' || char === '[') depth++;
    if (char === ')' || char === ']') depth--;
    if (char === ',' && depth === 0) { parts.push(current); current = ''; continue; }
    current += char;
  }
  parts.push(current);
  return parts;
}

/**
 * Rewrites one stylesheet, keeping only what can still apply.
 *
 * Returns `{ css, kept, dropped }` in bytes, so a caller can report the saving
 * without parsing the result again.
 */
/**
 * Removes comments before parsing, keeping `/*!` banners.
 *
 * Without this a comment's own text runs into the selector that follows it —
 * `…retained in source, hidden in the active UI *\/ .r72-theme-toggle{` parses
 * as one enormous selector, and the rule it swallowed disappears. The first
 * draft of this module did exactly that and silently dropped the quick-view
 * modal's styling.
 */
function stripComments(css) {
  return String(css)
    .replace(/\/\*(?!!)[\s\S]*?\*\//g, '')
    // `@import url("other.css?v=NN");` opens two of these sheets. It is a
    // statement, not a block, so a brace-counting parser reads it as the start
    // of the next selector and swallows the rule that follows. The build strips
    // these too (stripLegacyCssImports in nuxt.config.ts), because the query
    // string makes Vite emit a runtime request that 500s — so removing them
    // here matches what actually ships.
    .replace(/@import\s+[^;]+;/gi, '');
}

/** Shared by the purge and by the cascade analysis, so both see one input. */
export function normaliseCss(css) {
  return stripComments(css);
}

export function purgeCss(source, universe) {
  const css = stripComments(source);
  let out = '';
  let dropped = 0;
  let index = 0;
  let head = '';
  // Depth of at-rules whose bodies must be copied verbatim.
  let verbatim = 0;

  while (index < css.length) {
    const char = css[index];

    if (char === '{') {
      const selector = head.trim();
      head = '';
      // Find the matching close brace.
      let depth = 1;
      let end = index + 1;
      while (end < css.length && depth > 0) {
        if (css[end] === '{') depth++;
        else if (css[end] === '}') depth--;
        end++;
      }
      const body = css.slice(index + 1, end - 1);

      if (selector.startsWith('@')) {
        // `@keyframes`, `@font-face` and `@property` name things that selectors
        // never mention; copy them untouched. Conditional groups (`@media`,
        // `@supports`, `@layer`) hold ordinary rules, so recurse into them.
        if (/^@(?:keyframes|-\w+-keyframes|font-face|property|counter-style|font-feature-values)\b/i.test(selector)) {
          out += `${selector}{${body}}`;
        } else {
          const inner = purgeCss(body, universe);
          dropped += inner.dropped;
          // A conditional group left with nothing inside is itself dead weight.
          if (inner.css.trim()) out += `${selector}{${inner.css}}`;
          else dropped += selector.length + 2;
        }
        index = end;
        continue;
      }

      // A rule that defines design tokens stays whatever its selector says.
      const definesTokens = /(^|[;{\s])--[\w-]+\s*:/.test(body);
      const live = splitSelectorList(selector).filter((part) => definesTokens || selectorIsLive(part, universe));
      if (live.length) out += `${live.join(',')}{${body}}`;
      else dropped += selector.length + body.length + 2;

      index = end;
      continue;
    }

    if (char === '}') { head = ''; index++; continue; }
    head += char;
    index++;
  }

  return { css: out, kept: out.length, dropped };
}

/**
 * The declaration that wins for every (media, selector, property) in a chain.
 *
 * This is the contract a purge must not change: if two chains agree here for
 * every selector that can still match, they paint the same pixels. Used by the
 * regression test rather than at build time.
 */
export function cascadeWinners(sheets) {
  const winners = new Map();
  for (const { name, css } of sheets) collect(normaliseCss(css), '', name);
  return winners;

  function collect(css, media, sheet) {
    let index = 0;
    let head = '';
    while (index < css.length) {
      const char = css[index];
      if (char === '{') {
        const selector = head.trim();
        head = '';
        let depth = 1;
        let end = index + 1;
        while (end < css.length && depth > 0) {
          if (css[end] === '{') depth++;
          else if (css[end] === '}') depth--;
          end++;
        }
        const body = css.slice(index + 1, end - 1);
        if (selector.startsWith('@')) {
          if (/^@(?:media|supports|layer|container)\b/i.test(selector)) collect(body, `${media}&&${selector.replace(/\s+/g, ' ')}`, sheet);
          else winners.set(`${media}|${selector.replace(/\s+/g, ' ')}|@`, { sheet, value: body.replace(/\s+/g, ' ').trim() });
        } else {
          for (const part of splitSelectorList(selector)) {
            const key = part.replace(/\s+/g, ' ').trim();
            if (!key) continue;
            for (const raw of body.split(';')) {
              const declaration = raw.trim();
              if (!declaration || declaration.includes('{')) continue;
              const colon = declaration.indexOf(':');
              if (colon < 1) continue;
              const property = declaration.slice(0, colon).trim().toLowerCase();
              if (!/^[-a-z]/.test(property)) continue;
              const important = /!important/i.test(declaration);
              const slot = `${media}|${key}|${property}`;
              const previous = winners.get(slot);
              // Later wins, unless an earlier one was !important and this is not.
              if (previous && previous.important && !important) continue;
              winners.set(slot, { sheet, value: declaration.slice(colon + 1).trim(), important });
            }
          }
        }
        index = end;
        continue;
      }
      if (char === '}') { head = ''; index++; continue; }
      head += char;
      index++;
    }
  }
}
