/**
 * Agent levels: what an agent has sold, and what that earns them.
 *
 * The shop had one commission rate per agent, typed in by hand at approval and
 * never touched again. That is a rate somebody has to remember to raise, so it
 * never gets raised, and an agent who sells steadily for a year earns exactly
 * what they earned on their first day.
 *
 * Five levels, and the rate follows the level. What moves an agent up is the
 * cumulative value of the orders they have brought in — not the commission
 * they have taken, and not the number of orders, because a shop selling
 * ten-thousand-baht pumps and a shop selling two-hundred-baht fittings would
 * need different numbers if it counted orders.
 *
 * The thresholds and the rates live in the data, not here: this file only holds
 * what a shop starts with before anybody has opened the screen, and the shape
 * both ends agree on. A super admin edits them.
 */

/**
 * The starting ladder.
 *
 * The shop asked for 0.5 / 1 / 1.5 / 2 / 2.5 percent, and for thresholds
 * "5000/10000/5000/100000/500000" — where the third is lower than the second,
 * which cannot be a ladder, so it is read as a slip and the shape is kept.
 *
 * The rates are used as given. The thresholds are spaced so each level takes
 * meaningfully longer than the last rather than stepping twice in one week: at
 * this shop's prices a single pump is 4,000–13,000 baht, so a 5,000 threshold
 * is one order and level 2 would arrive before an agent had done anything worth
 * rewarding. 10,000 is roughly two orders — quick enough to feel like progress
 * — then 50,000, 150,000 and 500,000, each about three times the last. Level 5
 * is a real milestone at around forty to a hundred orders.
 *
 * Every number here is editable in the console. These are a starting point, not
 * a policy: a shop that knows its own basket size should move them.
 */
export const DEFAULT_AGENT_LEVELS = [
  { level: 1, label: 'เริ่มต้น', min_sales: 0, commission_rate: 0.5 },
  { level: 2, label: 'เงิน', min_sales: 10000, commission_rate: 1 },
  { level: 3, label: 'ทอง', min_sales: 50000, commission_rate: 1.5 },
  { level: 4, label: 'แพลทินัม', min_sales: 150000, commission_rate: 2 },
  { level: 5, label: 'ไดมอนด์', min_sales: 500000, commission_rate: 2.5 },
];

/** A percentage that may be a half. Two decimals is as fine as money gets here. */
export function cleanRate(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(100, Math.round(number * 100) / 100));
}

/**
 * A stored ladder, made safe to use.
 *
 * Anything missing falls back to the default for that position rather than to
 * zero: a half-saved settings record must not silently put every agent on 0%.
 * Sorted and de-duplicated by level, and the thresholds are forced upward —
 * a ladder whose third rung is below its second is not a ladder, and the shop's
 * own first draft had exactly that, so it is corrected rather than rejected.
 */
export function normalizeAgentLevels(rows) {
  const source = Array.isArray(rows) && rows.length ? rows : DEFAULT_AGENT_LEVELS;
  const byLevel = new Map();
  for (const row of source) {
    const level = Math.round(Number(row?.level));
    if (!Number.isFinite(level) || level < 1 || level > 5) continue;
    const fallback = DEFAULT_AGENT_LEVELS[level - 1];
    byLevel.set(level, {
      level,
      label: String(row?.label ?? fallback.label).slice(0, 40) || fallback.label,
      min_sales: Math.max(0, Math.round(Number(row?.min_sales ?? fallback.min_sales)) || 0),
      commission_rate: cleanRate(row?.commission_rate, fallback.commission_rate),
    });
  }
  const out = [];
  for (let level = 1; level <= 5; level++)
    out.push(byLevel.get(level) || { ...DEFAULT_AGENT_LEVELS[level - 1] });
  out[0].min_sales = 0; // level one is where everybody starts, whatever was typed
  for (let i = 1; i < out.length; i++) {
    if (out[i].min_sales <= out[i - 1].min_sales) out[i].min_sales = out[i - 1].min_sales + 1;
  }
  return out;
}

/**
 * Where an agent stands, and how far to the next rung.
 *
 * `progress` is 0–1 through the *current* level rather than through the whole
 * ladder, because that is what a bar should fill: an agent at 490,000 of a
 * 500,000 target should see a nearly-full bar, not a bar that has barely moved
 * because level 5 is a long way from level 1.
 */
export function agentLevelStanding(lifetimeSales, levels = DEFAULT_AGENT_LEVELS) {
  const ladder = normalizeAgentLevels(levels);
  const sales = Math.max(0, Number(lifetimeSales) || 0);
  let current = ladder[0];
  for (const rung of ladder) if (sales >= rung.min_sales) current = rung;
  const next = ladder.find((rung) => rung.level === current.level + 1) || null;
  const floor = current.min_sales;
  const ceiling = next ? next.min_sales : floor;
  const span = ceiling - floor;
  return {
    level: current.level,
    label: current.label,
    commission_rate: current.commission_rate,
    lifetime_sales: sales,
    next_level: next ? next.level : null,
    next_label: next ? next.label : '',
    next_at: next ? next.min_sales : null,
    next_rate: next ? next.commission_rate : null,
    remaining: next ? Math.max(0, ceiling - sales) : 0,
    // A finished ladder reads as full, not as zero.
    progress: next && span > 0 ? Math.max(0, Math.min(1, (sales - floor) / span)) : 1,
    max_level: !next,
  };
}

/**
 * The rate an agent is actually paid.
 *
 * An override set by hand wins. That is not a loophole — it is how a shop
 * honours a deal it made with one agent before the ladder existed, and how it
 * pays somebody more than their level while they are being trained up. Only an
 * explicit number counts: an empty override falls through to the ladder rather
 * than being read as zero percent.
 */
export function effectiveCommissionRate(agent, levels = DEFAULT_AGENT_LEVELS) {
  const override = agent?.commission_rate_override;
  if (override !== undefined && override !== null && override !== '' && Number.isFinite(Number(override))) {
    return cleanRate(override);
  }
  return agentLevelStanding(agent?.lifetime_sales, levels).commission_rate;
}
