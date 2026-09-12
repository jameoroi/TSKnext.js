/**
 * The categories to show when the catalogue has not named its own.
 *
 * A shop that has never opened the category screen in the admin still has to
 * offer a way into the products, and an empty menu is a dead end — so these ten
 * stand in until real ones exist. They were written into `app/pages/index.vue`
 * and used only there, which is how the header's new category menu shipped
 * empty on a catalogue that renders ten of them on the page below it.
 *
 * Shared, so there is one answer to "what are the categories" no matter which
 * component is asking.
 */
export type FallbackCategory = { key: string; name: string; icon: string; en: string };

export const FALLBACK_CATEGORIES: FallbackCategory[] = [
  { key: 'trimmer', name: 'เครื่องตัดหญ้า', icon: 'trimmer', en: 'TRIMMER' },
  { key: 'tools', name: 'เครื่องมือช่าง', icon: 'wrench', en: 'TOOLS' },
  { key: 'power', name: 'เครื่องมือไฟฟ้า', icon: 'drill', en: 'POWER' },
  { key: 'cordless', name: 'เครื่องมือแบตเตอรี่', icon: 'cordless', en: 'CORDLESS' },
  { key: 'pump', name: 'เครื่องปั๊มน้ำ', icon: 'pump', en: 'PUMP' },
  { key: 'agri', name: 'อุปกรณ์การเกษตร', icon: 'sprayer', en: 'AGRI' },
  { key: 'garden', name: 'เครื่องยนต์ / ปั๊มน้ำ', icon: 'plant', en: 'GARDEN' },
  { key: 'borewell', name: 'ปั๊มบาดาล', icon: 'bars', en: 'BOREWELL' },
  { key: 'pipe', name: 'งานระบบประปา', icon: 'pipe', en: 'PIPE' },
  { key: 'other', name: 'อะไหล่ / Accessories', icon: 'boxes', en: 'OTHER' },
];

/**
 * The subcategories behind each category, and the search each one runs.
 *
 * This lived inside LegacyHeader.vue, so the header menu could offer
 * "ปั๊มหอยโข่ง" and the catalogue page beside it — showing the same ten
 * categories from the same endpoint — could not, because the list it needed was
 * private to another component. Two menus of the same thing that disagree about
 * what is in it read as two different shops.
 *
 * They are searches rather than category ids because the catalogue has one
 * level of categories and these are the shapes shoppers ask for inside them.
 */
export const CATEGORY_SUBCATEGORIES: Record<string, Array<{ label: string; query: string }>> = {
  tools: [
    { label: 'ประแจและบล็อก', query: 'ประแจ' },
    { label: 'ไขควงและดอกไขควง', query: 'ไขควง' },
    { label: 'คีมและอุปกรณ์จับยึด', query: 'คีม' },
    { label: 'เครื่องมือวัด', query: 'เครื่องมือวัด' },
  ],
  pump: [
    { label: 'ปั๊มน้ำอัตโนมัติ', query: 'ปั๊มน้ำอัตโนมัติ' },
    { label: 'ปั๊มหอยโข่ง', query: 'ปั๊มหอยโข่ง' },
    { label: 'ปั๊มแช่และปั๊มดูดโคลน', query: 'ปั๊มแช่' },
  ],
  borewell: [
    { label: 'ปั๊มบาดาล 2 นิ้ว', query: 'ปั๊มบาดาล 2 นิ้ว' },
    { label: 'ปั๊มบาดาล 3 นิ้ว', query: 'ปั๊มบาดาล 3 นิ้ว' },
    { label: 'ตู้คอนโทรลปั๊ม', query: 'ตู้คอนโทรล ปั๊มบาดาล' },
  ],
  power: [
    { label: 'สว่านและสว่านกระแทก', query: 'สว่าน' },
    { label: 'เครื่องเจียร', query: 'เครื่องเจียร' },
    { label: 'เลื่อยไฟฟ้า', query: 'เลื่อยไฟฟ้า' },
    { label: 'เครื่องขัดและเครื่องตัด', query: 'เครื่องขัด เครื่องตัด' },
  ],
  cordless: [
    { label: 'ชุดเครื่องมือไร้สาย', query: 'เครื่องมือไร้สาย' },
    { label: 'สว่านไร้สาย', query: 'สว่านไร้สาย' },
    { label: 'แบตเตอรี่และแท่นชาร์จ', query: 'แบตเตอรี่ แท่นชาร์จ' },
  ],
  garden: [
    { label: 'เครื่องตัดหญ้า', query: 'เครื่องตัดหญ้า' },
    { label: 'เครื่องเป่าลม', query: 'เครื่องเป่าลม' },
    { label: 'เลื่อยโซ่', query: 'เลื่อยโซ่' },
  ],
  trimmer: [
    { label: 'เครื่องตัดหญ้าสะพายบ่า', query: 'เครื่องตัดหญ้าสะพาย' },
    { label: 'เครื่องตัดหญ้าแบตเตอรี่', query: 'เครื่องตัดหญ้าแบตเตอรี่' },
  ],
  agri: [
    { label: 'เครื่องพ่นยา', query: 'เครื่องพ่นยา' },
    { label: 'อุปกรณ์รดน้ำ', query: 'อุปกรณ์รดน้ำ' },
    { label: 'อุปกรณ์เกษตรทั่วไป', query: 'อุปกรณ์การเกษตร' },
  ],
};

export function subcategoriesForKey(key: string) {
  return CATEGORY_SUBCATEGORIES[key] || [];
}
