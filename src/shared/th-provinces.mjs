/**
 * The 77 provinces of Thailand.
 *
 * The checkout asked for a province in a plain text box, so an order could be
 * addressed to "rwwwwww" and the server would take it: its only rule is that
 * the field is not empty. A courier cannot deliver to a province that does not
 * exist, and nothing downstream — shipping zones, reports, the packing slip —
 * can group an order whose province is a typo of a real one.
 *
 * `latin` is here so the box can be searched either way: somebody typing on an
 * English keyboard finds "chonburi" without switching layouts, which on a phone
 * is two taps and a guess.
 *
 * Ordered as Thai addresses are read: กรุงเทพมหานคร first, then the rest
 * alphabetically in Thai.
 */

/** @type {{ name: string, latin: string }[]} */
export const TH_PROVINCES = [
  { name: 'กรุงเทพมหานคร', latin: 'Bangkok' },
  { name: 'กระบี่', latin: 'Krabi' },
  { name: 'กาญจนบุรี', latin: 'Kanchanaburi' },
  { name: 'กาฬสินธุ์', latin: 'Kalasin' },
  { name: 'กำแพงเพชร', latin: 'Kamphaeng Phet' },
  { name: 'ขอนแก่น', latin: 'Khon Kaen' },
  { name: 'จันทบุรี', latin: 'Chanthaburi' },
  { name: 'ฉะเชิงเทรา', latin: 'Chachoengsao' },
  { name: 'ชลบุรี', latin: 'Chon Buri' },
  { name: 'ชัยนาท', latin: 'Chai Nat' },
  { name: 'ชัยภูมิ', latin: 'Chaiyaphum' },
  { name: 'ชุมพร', latin: 'Chumphon' },
  { name: 'เชียงราย', latin: 'Chiang Rai' },
  { name: 'เชียงใหม่', latin: 'Chiang Mai' },
  { name: 'ตรัง', latin: 'Trang' },
  { name: 'ตราด', latin: 'Trat' },
  { name: 'ตาก', latin: 'Tak' },
  { name: 'นครนายก', latin: 'Nakhon Nayok' },
  { name: 'นครปฐม', latin: 'Nakhon Pathom' },
  { name: 'นครพนม', latin: 'Nakhon Phanom' },
  { name: 'นครราชสีมา', latin: 'Nakhon Ratchasima' },
  { name: 'นครศรีธรรมราช', latin: 'Nakhon Si Thammarat' },
  { name: 'นครสวรรค์', latin: 'Nakhon Sawan' },
  { name: 'นนทบุรี', latin: 'Nonthaburi' },
  { name: 'นราธิวาส', latin: 'Narathiwat' },
  { name: 'น่าน', latin: 'Nan' },
  { name: 'บึงกาฬ', latin: 'Bueng Kan' },
  { name: 'บุรีรัมย์', latin: 'Buri Ram' },
  { name: 'ปทุมธานี', latin: 'Pathum Thani' },
  { name: 'ประจวบคีรีขันธ์', latin: 'Prachuap Khiri Khan' },
  { name: 'ปราจีนบุรี', latin: 'Prachin Buri' },
  { name: 'ปัตตานี', latin: 'Pattani' },
  { name: 'พระนครศรีอยุธยา', latin: 'Phra Nakhon Si Ayutthaya' },
  { name: 'พะเยา', latin: 'Phayao' },
  { name: 'พังงา', latin: 'Phang Nga' },
  { name: 'พัทลุง', latin: 'Phatthalung' },
  { name: 'พิจิตร', latin: 'Phichit' },
  { name: 'พิษณุโลก', latin: 'Phitsanulok' },
  { name: 'เพชรบุรี', latin: 'Phetchaburi' },
  { name: 'เพชรบูรณ์', latin: 'Phetchabun' },
  { name: 'แพร่', latin: 'Phrae' },
  { name: 'ภูเก็ต', latin: 'Phuket' },
  { name: 'มหาสารคาม', latin: 'Maha Sarakham' },
  { name: 'มุกดาหาร', latin: 'Mukdahan' },
  { name: 'แม่ฮ่องสอน', latin: 'Mae Hong Son' },
  { name: 'ยโสธร', latin: 'Yasothon' },
  { name: 'ยะลา', latin: 'Yala' },
  { name: 'ร้อยเอ็ด', latin: 'Roi Et' },
  { name: 'ระนอง', latin: 'Ranong' },
  { name: 'ระยอง', latin: 'Rayong' },
  { name: 'ราชบุรี', latin: 'Ratchaburi' },
  { name: 'ลพบุรี', latin: 'Lop Buri' },
  { name: 'ลำปาง', latin: 'Lampang' },
  { name: 'ลำพูน', latin: 'Lamphun' },
  { name: 'เลย', latin: 'Loei' },
  { name: 'ศรีสะเกษ', latin: 'Si Sa Ket' },
  { name: 'สกลนคร', latin: 'Sakon Nakhon' },
  { name: 'สงขลา', latin: 'Songkhla' },
  { name: 'สตูล', latin: 'Satun' },
  { name: 'สมุทรปราการ', latin: 'Samut Prakan' },
  { name: 'สมุทรสงคราม', latin: 'Samut Songkhram' },
  { name: 'สมุทรสาคร', latin: 'Samut Sakhon' },
  { name: 'สระแก้ว', latin: 'Sa Kaeo' },
  { name: 'สระบุรี', latin: 'Saraburi' },
  { name: 'สิงห์บุรี', latin: 'Sing Buri' },
  { name: 'สุโขทัย', latin: 'Sukhothai' },
  { name: 'สุพรรณบุรี', latin: 'Suphan Buri' },
  { name: 'สุราษฎร์ธานี', latin: 'Surat Thani' },
  { name: 'สุรินทร์', latin: 'Surin' },
  { name: 'หนองคาย', latin: 'Nong Khai' },
  { name: 'หนองบัวลำภู', latin: 'Nong Bua Lam Phu' },
  { name: 'อ่างทอง', latin: 'Ang Thong' },
  { name: 'อำนาจเจริญ', latin: 'Amnat Charoen' },
  { name: 'อุดรธานี', latin: 'Udon Thani' },
  { name: 'อุตรดิตถ์', latin: 'Uttaradit' },
  { name: 'อุทัยธานี', latin: 'Uthai Thani' },
  { name: 'อุบลราชธานี', latin: 'Ubon Ratchathani' },
];

/**
 * Match what somebody typed to a real province, or nothing.
 *
 * Deliberately forgiving about the things a person varies and a computer does
 * not: spaces, case, and the "จังหวัด" or "จ." somebody may put in front of it.
 * Not forgiving about spelling — a near miss is returned as no match, so the
 * form can say so rather than posting an address nobody can deliver to.
 */
export function normaliseProvince(value) {
  const token = String(value ?? '').trim().replace(/^(?:จังหวัด|จ\.)\s*/, '').replace(/\s+/g, ' ').toLowerCase();
  if (!token) return '';
  const flat = token.replace(/\s+/g, '');
  const hit = TH_PROVINCES.find((province) => province.name.toLowerCase() === token
    || province.latin.toLowerCase() === token
    || province.latin.toLowerCase().replace(/\s+/g, '') === flat);
  return hit ? hit.name : '';
}

/** Everything matching what has been typed so far, in list order. */
export function searchProvinces(query) {
  const token = String(query ?? '').trim().replace(/^(?:จังหวัด|จ\.)\s*/, '').toLowerCase();
  if (!token) return TH_PROVINCES;
  const flat = token.replace(/\s+/g, '');
  return TH_PROVINCES.filter((province) => province.name.toLowerCase().includes(token)
    || province.latin.toLowerCase().includes(token)
    || province.latin.toLowerCase().replace(/\s+/g, '').includes(flat));
}
