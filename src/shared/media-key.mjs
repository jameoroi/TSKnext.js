/**
 * What may be turned into a request against the shop's media bucket.
 *
 * `server/routes/img/[...key].ts` takes a path from a stranger and reads the
 * object it names, so this is the whole of the boundary between "a picture the
 * shop stored" and "any object in the bucket, or out of it". It lives here
 * rather than in the route so it can be tested on its own — a guard that is
 * only exercised by the thing it guards is a guard nobody has read the failure
 * cases of.
 *
 * Deliberately an allowlist. Refusing what does not look like a key written by
 * `api/lib/media.js` is a smaller and more durable claim than trying to name
 * every way a path can be made to climb: `media.js` builds keys out of
 * lowercase segments, digits, dots and dashes, and anything else was not
 * stored by this shop.
 *
 * Normalising is not an option here, only refusing. A path that has to be
 * repaired before it is safe is a path whose repaired form somebody has to be
 * sure about, and every S3 traversal bug of the last decade lives in that
 * gap — the decoding done once, twice, or in a different order from the
 * storage that ultimately reads it.
 */

/** Length is capped because a key that long was not written by media.js either. */
const SHAPE = /^[a-zA-Z0-9][a-zA-Z0-9._\-/]{0,299}$/;

export function isMediaKey(value) {
  const key = String(value == null ? '' : value);
  if (!SHAPE.test(key)) return false;
  // `..` climbs, `//` is an empty segment some stores collapse and others do
  // not, and a trailing separator names a prefix rather than an object.
  if (key.includes('..')) return false;
  if (key.includes('//')) return false;
  if (key.endsWith('/')) return false;
  // A percent sign means somebody is encoding something. Whatever it decodes
  // to, it is not a key this shop wrote, and deciding what it becomes is the
  // job this function exists to avoid.
  if (key.includes('%')) return false;
  return true;
}
