export const DEFAULT_WAREHOUSE = Object.freeze({
  id: 'main',
  code: 'MAIN',
  name: 'คลังหลัก',
  priority: 1,
  active: true,
  is_default: true
});

const text = (value, max = 160) => String(value ?? '').trim().slice(0, max);
const nonNegative = value => Math.max(0, Math.floor(Number(value) || 0));

const SOURCE_VARIANT_CATALOG = Object.freeze(
{"757471":[{"id":"src-1631806","label":"UMK435T U2TT ใบยาว","sku":"335314277993","price":9638,"oldPrice":9638},{"id":"src-1631812","label":"UMK435T UMTT ใบกลม","sku":"335314277995","price":9638,"oldPrice":9638}],"757513":[{"id":"src-1631992","label":"ปั๊มลม BG3000-2/100","sku":"292260920322","price":10400,"oldPrice":10400},{"id":"src-1631998","label":"ปั๊มลม + อุปกรณ์","sku":"292260920324","price":10999,"oldPrice":10999}],"757516":[{"id":"src-1632004","label":"30225 แกน 16นิ้ว โปร","sku":"302407034791","price":57,"oldPrice":57},{"id":"src-1632010","label":"30204 แกน 22นิ้ว","sku":"302407034787","price":38,"oldPrice":38},{"id":"src-1632016","label":"30224 แกน 22นิ้ว โปร","sku":"302407034789","price":53,"oldPrice":53}],"757519":[{"id":"src-2144313","label":"15106 (9/64)","sku":"267405484012","price":25,"oldPrice":25},{"id":"src-2144316","label":"15113 (1/4)","sku":"267405484026","price":45,"oldPrice":45},{"id":"src-2144319","label":"15107 (5/32)","sku":"267405484014","price":25,"oldPrice":25},{"id":"src-2144322","label":"15109 (3/16)","sku":"267405484018","price":30,"oldPrice":30},{"id":"src-2144325","label":"15115 (9/32)","sku":"267405484030","price":55,"oldPrice":55},{"id":"src-2144328","label":"15102 (5/64)","sku":"267405484004","price":19,"oldPrice":19},{"id":"src-2144331","label":"15111 (7/32)","sku":"267405484022","price":39,"oldPrice":39},{"id":"src-2144334","label":"15116 (19/64)","sku":"267405484032","price":59,"oldPrice":59},{"id":"src-2144337","label":"15103 (3/32)","sku":"267405484006","price":19,"oldPrice":19},{"id":"src-2144340","label":"15110 (13/64)","sku":"267405484020","price":35,"oldPrice":35},{"id":"src-2144343","label":"15112 (15/64)","sku":"267405484024","price":42,"oldPrice":42},{"id":"src-2144346","label":"15105 (1/8)","sku":"267405484010","price":25,"oldPrice":25},{"id":"src-2144349","label":"15108 (11/64)","sku":"267405484016","price":27,"oldPrice":27},{"id":"src-2144352","label":"15114 (17/64)","sku":"267405484028","price":50,"oldPrice":50},{"id":"src-2144355","label":"15104 (7/64)","sku":"267405484008","price":19,"oldPrice":19},{"id":"src-2144358","label":"15101 (1/16)","sku":"267405484002","price":19,"oldPrice":19}],"757522":[{"id":"src-2144361","label":"30333 / 2.5 นิ้ว","sku":"307264320817","price":39,"oldPrice":39},{"id":"src-2144364","label":"30334 / 3 นิ้ว","sku":"307264320819","price":45,"oldPrice":45},{"id":"src-2144367","label":"30330 / 1 นิ้ว","sku":"307264320811","price":20,"oldPrice":20},{"id":"src-2144370","label":"30332 / 2 นิ้ว","sku":"307264320815","price":35,"oldPrice":35},{"id":"src-2144373","label":"30331 / 1.5 นิ้ว","sku":"307264320813","price":29,"oldPrice":29}],"757525":[{"id":"src-2144376","label":"51135 / 10 นิ้ว","sku":"315313818630","price":147,"oldPrice":147},{"id":"src-2144379","label":"51136 / 12 นิ้ว","sku":"315313818632","price":181,"oldPrice":181},{"id":"src-2144382","label":"51133 / 6 นิ้ว","sku":"315313818626","price":89,"oldPrice":89},{"id":"src-2144385","label":"51134 / 8 นิ้ว","sku":"315313818628","price":117,"oldPrice":117}],"757528":[{"id":"src-2144388","label":"30311 / 2.5 นิ้ว","sku":"385309854727","price":70,"oldPrice":70},{"id":"src-2144391","label":"30312 / 3 นิ้ว","sku":"385309854729","price":90,"oldPrice":90},{"id":"src-2144394","label":"30308 / 1นิ้ว","sku":"385309854721","price":29,"oldPrice":29},{"id":"src-2144397","label":"30310 / 2 นิ้ว","sku":"385309854725","price":50,"oldPrice":50},{"id":"src-2144400","label":"30313/ 4 นิ้ว","sku":"385309854731","price":112,"oldPrice":112},{"id":"src-2144403","label":"30309 / 1.5 นิ้ว","sku":"385309854723","price":45,"oldPrice":45}]}
);

function sourceVariantsForProduct(product) {
  const sourceId = text(product?.source_id || product?.marketplace_source_id, 80);
  const rows = SOURCE_VARIANT_CATALOG[sourceId];
  if (!Array.isArray(rows) || rows.length < 2) return null;
  return rows.map((row, index) => ({
    ...row,
    options: { 'ตัวเลือก': row.label },
    stock: product?.stock ?? 0,
    state: product?.state || 'active',
    is_default: index === 0
  }));
}

export function normalizeLevel(raw = {}, fallbackOnHand = 0, fallbackReserved = 0) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const onHandValue = source.on_hand !== undefined ? source.on_hand : fallbackOnHand;
  const unlimited = onHandValue === null || onHandValue === '';
  return {
    on_hand: unlimited ? null : nonNegative(onHandValue),
    reserved: unlimited ? 0 : Math.min(nonNegative(source.reserved ?? fallbackReserved), nonNegative(onHandValue)),
    reorder_point: nonNegative(source.reorder_point ?? source.low_stock_threshold ?? 5)
  };
}

export function normalizeProductInventory(product, { clone = true } = {}) {
  if (!product) return null;
  const p = clone ? structuredClone(product) : product;
  const existingVariants = Array.isArray(p.variants) && p.variants.length ? p.variants.slice(0, 200) : [];
  const hasExplicitVariants = existingVariants.some(variant =>
    String(variant?.id || '') !== 'default' ||
    Object.keys(variant?.options || {}).length > 0 ||
    String(variant?.label || '') !== 'แบบมาตรฐาน'
  );
  const sourceVariants = hasExplicitVariants
    ? existingVariants
    : (sourceVariantsForProduct(p) || (existingVariants.length ? existingVariants : [{
        id: 'default',
        label: 'แบบมาตรฐาน',
        is_default: true,
        sku: p.sku || '',
        barcode: p.barcode || '',
        price: p.price,
        oldPrice: p.oldPrice,
        cost_price: p.cost_price,
        state: p.state,
        inventory: p.inventory && typeof p.inventory === 'object'
          ? p.inventory
          : { [DEFAULT_WAREHOUSE.id]: { on_hand: p.stock, reserved: p.reserved, reorder_point: p.low_stock_threshold } }
      }]));

  const seen = new Set();
  p.variants = sourceVariants.map((raw, index) => {
    const fallbackId = index === 0 ? 'default' : `variant-${index + 1}`;
    let id = text(raw?.id, 80) || fallbackId;
    while (seen.has(id)) id = `${fallbackId}-${seen.size + 1}`;
    seen.add(id);
    const inventorySource = raw?.inventory && typeof raw.inventory === 'object' ? raw.inventory : {};
    const inventory = {};
    for (const [warehouseId, level] of Object.entries(inventorySource)) {
      const wid = text(warehouseId, 80);
      if (wid) inventory[wid] = normalizeLevel(level);
    }
    if (!Object.keys(inventory).length) {
      const fallbackStock = sourceVariants.length === 1 ? (raw?.stock ?? p.stock) : (raw?.stock ?? 0);
      const fallbackReserved = sourceVariants.length === 1 ? (raw?.reserved ?? p.reserved) : (raw?.reserved ?? 0);
      inventory[DEFAULT_WAREHOUSE.id] = normalizeLevel({}, fallbackStock, fallbackReserved);
    }
    const options = {};
    if (raw?.options && typeof raw.options === 'object') {
      for (const [key, value] of Object.entries(raw.options).slice(0, 12)) {
        const optionName = text(key, 60), optionValue = text(value, 120);
        if (optionName && optionValue) options[optionName] = optionValue;
      }
    }
    return {
      id,
      label: text(raw?.label, 180) || Object.values(options).join(' / ') || (index === 0 ? 'แบบมาตรฐาน' : `ตัวเลือก ${index + 1}`),
      options,
      sku: text(raw?.sku ?? (index === 0 ? p.sku : ''), 120),
      barcode: text(raw?.barcode ?? (index === 0 ? p.barcode : ''), 120),
      price: Math.max(0, Number(raw?.price ?? p.price) || 0),
      oldPrice: raw?.oldPrice === null || raw?.oldPrice === '' ? null : Math.max(0, Number(raw?.oldPrice ?? p.oldPrice) || 0) || null,
      cost_price: Math.max(0, Number(raw?.cost_price ?? p.cost_price) || 0),
      state: ['active', 'hidden', 'discontinued'].includes(raw?.state) ? raw.state : (p.state || 'active'),
      is_default: raw?.is_default === true || index === 0,
      marketplace: raw?.marketplace && typeof raw.marketplace === 'object' ? { ...raw.marketplace } : {},
      inventory
    };
  });
  let foundDefault = false;
  p.variants.forEach(variant => {
    variant.is_default = !foundDefault && variant.is_default;
    if (variant.is_default) foundDefault = true;
  });
  if (!foundDefault && p.variants[0]) p.variants[0].is_default = true;
  p.inventory_version = 1;
  return syncProductAggregates(p);
}

export function variantOnHand(variant) {
  const levels = Object.values(variant?.inventory || {});
  if (levels.some(level => level?.on_hand === null)) return Number.POSITIVE_INFINITY;
  return levels.reduce((sum, level) => sum + nonNegative(level?.on_hand), 0);
}

export function variantReserved(variant) {
  return Object.values(variant?.inventory || {}).reduce((sum, level) => sum + nonNegative(level?.reserved), 0);
}

export function variantAvailable(variant) {
  const onHand = variantOnHand(variant);
  return Number.isFinite(onHand) ? Math.max(0, onHand - variantReserved(variant)) : Number.POSITIVE_INFINITY;
}

export function findProductVariant(product, variantId = '', sku = '', barcode = '') {
  const p = product?.inventory_version === 1 && Array.isArray(product?.variants)
    ? product
    : normalizeProductInventory(product);
  const variants = p?.variants || [];
  const idNeedle = text(variantId, 80);
  const skuNeedle = text(sku, 120).toLowerCase();
  const barcodeNeedle = text(barcode, 120).toLowerCase();
  // A supplied selector is authoritative. Falling back to the default variant when a
  // cart contains an obsolete id/SKU can reserve, deduct or restore the wrong stock.
  if (idNeedle) return variants.find(v => v.id === idNeedle) || null;
  if (skuNeedle) return variants.find(v => v.sku.toLowerCase() === skuNeedle) || null;
  if (barcodeNeedle) return variants.find(v => v.barcode.toLowerCase() === barcodeNeedle) || null;
  return variants.find(v => v.is_default) || variants[0] || null;
}

export function inventoryVariantRemovalBlockers(currentProduct, nextProduct) {
  const current = normalizeProductInventory(currentProduct);
  const nextIds = new Set((nextProduct?.variants || []).map(variant => text(variant?.id, 80)).filter(Boolean));
  return (current?.variants || []).filter(variant => !nextIds.has(variant.id)).flatMap(variant => {
    const onHand = variantOnHand(variant);
    const reserved = variantReserved(variant);
    if (!(onHand > 0 || reserved > 0)) return [];
    return [{
      variant_id: variant.id,
      sku: variant.sku || '',
      reason: 'inventory_not_empty',
      on_hand: Number.isFinite(onHand) ? onHand : null,
      reserved
    }];
  });
}

export function syncProductAggregates(product) {
  const p = product;
  const variants = Array.isArray(p?.variants) ? p.variants : [];
  const totalOnHand = variants.reduce((sum, variant) => {
    const value = variantOnHand(variant);
    return !Number.isFinite(sum) || !Number.isFinite(value) ? Number.POSITIVE_INFINITY : sum + value;
  }, 0);
  p.stock = Number.isFinite(totalOnHand) ? totalOnHand : null;
  p.reserved = variants.reduce((sum, variant) => sum + variantReserved(variant), 0);
  const defaultVariant = variants.find(v => v.is_default) || variants[0];
  if (defaultVariant) {
    p.sku = defaultVariant.sku || p.sku || '';
    p.barcode = defaultVariant.barcode || p.barcode || '';
    p.price = Number(defaultVariant.price ?? p.price) || 0;
    p.oldPrice = defaultVariant.oldPrice ?? p.oldPrice ?? null;
    p.cost_price = Number(defaultVariant.cost_price ?? p.cost_price) || 0;
  }
  return p;
}

export function publicVariant(variant) {
  const available = variantAvailable(variant);
  return {
    id: variant.id,
    label: variant.label,
    options: variant.options || {},
    sku: variant.sku || '',
    barcode: variant.barcode || '',
    price: Number(variant.price || 0),
    oldPrice: variant.oldPrice ?? null,
    state: variant.state || 'active',
    is_default: variant.is_default === true,
    stock: Number.isFinite(available) ? Math.max(0, Math.floor(available)) : null,
    unlimited: !Number.isFinite(available)
  };
}
