'use strict';

const KO_PLACEHOLDERS = {
  target: '((주대상 누락))',
  action: '((작업 누락))',
};

const EN_PLACEHOLDERS = {
  target: '((Primary target missing))',
  action: '((Action missing))',
};

const VI_PLACEHOLDERS = {
  target: '((Thieu doi tuong chinh))',
  action: '((Thieu thao tac))',
};

const PROCESS_NAMING_BY_CODE = {
  BACK_COLLAR_FACING_TURN: {
    en: 'Back collar facing - Turn',
    ko: '뒤목 페이싱 - 뒤집어 박기',
    vi: 'Dap co sau - may lon',
  },
  BACK_DART: {
    en: 'Back dart - Sew',
    ko: '뒤판 다트 - 봉제',
    vi: 'Ly than sau - chiet ly',
  },
  BACK_NECKLINE_TURN_TOPSTITCH: {
    en: 'Back neckline - Turn + Topstitch',
    ko: '뒤목 - 뒤집어 박기 + 상침',
    vi: 'Vong co sau - may lon + mi',
  },
  BACK_YOKE_CONTRAST_TOPSTITCH_1N_2N: {
    en: 'Back yoke contrast - Topstitch (1N+2N)',
    ko: '뒤 요크 배색 - 상침 (1줄+2줄)',
    vi: 'Phoi cau vai sau - mi (1 ly+2 ly)',
  },
  BACK_YOKE_CONTRAST_TURN: {
    en: 'Back yoke contrast - Turn',
    ko: '뒤 요크 배색 - 뒤집어 박기',
    vi: 'Phoi cau vai sau - may lon',
  },
  BACK_YOKE_JOIN: {
    en: 'Back yoke - Join',
    ko: '뒤 요크 - 연결',
    vi: 'Cau vai sau - chap',
  },
  BACK_YOKE_TOPSTITCH_1N: {
    en: 'Back yoke - Topstitch (1N)',
    ko: '뒤 요크 - 상침 (1줄)',
    vi: 'Cau vai sau - mi (1 ly)',
  },
  BARTACK: {
    en: '((Primary target missing)) - Bartack',
    ko: '((주대상 누락)) - 바텍',
    vi: '((Thieu doi tuong chinh)) - chan',
  },
  BODY_HEM: {
    en: 'Body hem - Sew',
    ko: '몸판 밑단 - 봉제',
    vi: 'Gau than - may',
  },
  BUTTON_ATTACH: {
    en: 'Button - Attach',
    ko: '단추 - 달기',
    vi: 'Cuc - dong',
  },
  BUTTONHOLE: {
    en: 'Buttonhole - Make',
    ko: '단춧구멍 - 만들기',
    vi: 'Khuy - thua',
  },
  COLLAR_TURN_TOPSTITCH_1N: {
    en: 'Collar - Turn + Topstitch (1N)',
    ko: '칼라 - 뒤집어 박기 + 상침 (1줄)',
    vi: 'Co - may lon + mi (1 ly)',
  },
  CROTCH_INSEAM_OVERLOCK_5T: {
    en: 'Crotch / Inseam - Overlock (5T)',
    ko: '샅 / 인심 - 오버록 (5실)',
    vi: 'Dang / dung - vat so (5 chi)',
  },
  DRAWSTRING_BIND: {
    en: 'Drawstring - Bind',
    ko: '끈 - 바인딩',
    vi: 'Day - vien',
  },
  DRAWSTRING_END_BARTACK: {
    en: 'Drawstring ends - Bartack',
    ko: '끈 양끝 - 바텍',
    vi: '2 dau day - chan',
  },
  ELASTIC_BARTACK: {
    en: 'Elastic - Bartack',
    ko: '고무줄 - 바텍',
    vi: 'Chun - chan',
  },
  ELASTIC_KANSAI_STITCH: {
    en: 'Elastic - Kansai stitch',
    ko: '고무줄 - 간사이 봉제',
    vi: 'Chun - chay Kansai',
  },
  FLY_BARTACK_TURN: {
    en: 'Fly - Bartack + Turn',
    ko: '앞여밈 - 바텍 + 뒤집어 박기',
    vi: 'Moi - chan + may lon',
  },
  FLY_EDGE_OVERLOCK_3T: {
    en: 'Fly edge - Overlock (3T)',
    ko: '앞여밈 가장자리 - 오버록 (3실)',
    vi: 'Mep moi - vat so (3 chi)',
  },
  FLY_FACING_OVERLOCK_3T: {
    en: 'Fly facing - Overlock (3T)',
    ko: '앞여밈 페이싱 - 오버록 (3실)',
    vi: 'Dap moi - vat so (3 chi)',
  },
  FLY_FACING_TURN_TOPSTITCH: {
    en: 'Fly facing - Turn + Topstitch',
    ko: '앞여밈 페이싱 - 뒤집어 박기 + 상침',
    vi: 'Dap moi - may lon + mi',
  },
  FLY_ZIPPER_ATTACH_FACING_TOPSTITCH: {
    en: 'Zipper / Fly facing - Attach + Topstitch',
    ko: '지퍼 / 앞여밈 페이싱 - 부착 + 상침',
    vi: 'Khoa / dap moi - tra + mi',
  },
  FRONT_COLLAR_FACING_FOLD_5MM: {
    en: 'Front collar facing - Fold (5mm)',
    ko: '앞목 페이싱 - 접기 (5mm)',
    vi: 'Dap co truoc - gap (5 ly)',
  },
  FRONT_FLY_EXTENSION_OVERLOCK_3T: {
    en: 'Front fly extension - Overlock (3T)',
    ko: '앞여밈 연장부 - 오버록 (3실)',
    vi: 'Moi thua truoc - vat so (3 chi)',
  },
  FRONT_FLY_OVERLOCK_5T: {
    en: 'Front fly - Overlock (5T)',
    ko: '앞여밈 - 오버록 (5실)',
    vi: 'Moi than truoc - vat so (5 chi)',
  },
  FRONT_NECK_FACING_ATTACH: {
    en: 'Front neck facing - Attach',
    ko: '앞목 페이싱 - 부착',
    vi: 'Dap co truoc - tra',
  },
  FRONT_NECK_FACING_OVERLOCK_3T: {
    en: 'Front neck facing - Overlock (3T)',
    ko: '앞목 페이싱 - 오버록 (3실)',
    vi: 'Dap co truoc - vat so (3 chi)',
  },
  FRONT_NECK_FACING_TURN_TOPSTITCH: {
    en: 'Front neck facing - Turn + Topstitch',
    ko: '앞목 페이싱 - 뒤집어 박기 + 상침',
    vi: 'Dap co truoc - may lon + mi',
  },
  FRONT_NECKLINE_TOPSTITCH_1N_2N: {
    en: 'Front neckline - Topstitch (1N+2N)',
    ko: '앞목 - 상침 (1줄+2줄)',
    vi: 'Vong co truoc - mi (1 ly+2 ly)',
  },
  FRONT_PLACKET_FACING_ATTACH_MARK: {
    en: 'Front placket facing - Attach + Mark',
    ko: '앞단작 페이싱 - 부착 + 표시',
    vi: 'Dap nep truoc - may + lay dau',
  },
  FRONT_PLACKET_OPEN_TOPSTITCH: {
    en: 'Front placket - Open + Topstitch',
    ko: '앞단작 - 열기 + 상침',
    vi: 'Nep truoc - mo + mi',
  },
  FRONT_PLACKET_TOPSTITCH: {
    en: 'Front placket - Topstitch',
    ko: '앞단작 - 상침',
    vi: 'Nep truoc - mi',
  },
  FRONT_PLACKET_TURN_REINFORCE_TOPSTITCH: {
    en: 'Front placket - Turn + Reinforce topstitch',
    ko: '앞단작 - 뒤집어 박기 + 보강 상침',
    vi: 'Nep truoc - may lon + mi tang cuong',
  },
  FRONT_POCKET_END_BARTACK: {
    en: 'Front pocket - Bartack (both ends)',
    ko: '앞판 포켓 - 바텍 (양끝)',
    vi: 'Tui than truoc - chan (2 dau)',
  },
  FRONT_POCKET_FACING_OVERLOCK_3T: {
    en: 'Front pocket facing - Overlock (3T)',
    ko: '앞판 포켓 페이싱 - 오버록 (3실)',
    vi: 'Dap tui than truoc - vat so (3 chi)',
  },
  FRONT_POCKET_OPENING_TOPSTITCH: {
    en: 'Front pocket opening - Topstitch',
    ko: '앞판 포켓 입구 - 상침',
    vi: 'Mieng tui than truoc - mi',
  },
  FRONT_POCKET_OVERLOCK_5T: {
    en: 'Front pocket - Overlock (5T)',
    ko: '앞판 포켓 - 오버록 (5실)',
    vi: 'Tui than truoc - vat so (5 chi)',
  },
  LABEL_BASTE: {
    en: 'Label - Baste',
    ko: '라벨 - 가봉',
    vi: 'Mac - ghim',
  },
  MAIN_LABEL_ATTACH: {
    en: 'Main label - Attach',
    ko: '메인 라벨 - 부착',
    vi: 'Mac chinh - may',
  },
  NECKLINE_TOPSTITCH_BACK: {
    en: 'Neckline / Back neck - Topstitch (1N)',
    ko: '목둘레 / 뒤목 - 상침 (1줄)',
    vi: 'Vong co / co sau - mi (1 ly)',
  },
  PANTS_HEM: {
    en: 'Pants hem - Sew',
    ko: '바지 밑단 - 봉제',
    vi: 'Gau quan - may',
  },
  PEN_LOOP_CUT_BARTACK: {
    en: 'Pen loop - Cut + Bartack',
    ko: '펜 고리 - 재단 + 바텍',
    vi: 'Day but - cat + chan',
  },
  PKT_ATTACH_FRONT: {
    en: 'Front pocket - Attach',
    ko: '앞판 포켓 - 부착',
    vi: 'Tui than truoc - dan',
  },
  PKT_FLAP_BASTE_CHEST: {
    en: 'Chest pocket flap - Baste',
    ko: '가슴 포켓 덮개 - 가봉',
    vi: 'Nap tui nguc - ghim',
  },
  PKT_FLAP_OVERLOCK_3T: {
    en: 'Pocket flap - Overlock (3T)',
    ko: '포켓 덮개 - 오버록 (3실)',
    vi: 'Nap tui - vat so (3 chi)',
  },
  PKT_FLAP_TOPSTITCH_1N: {
    en: 'Chest pocket flap - Topstitch (1N)',
    ko: '가슴 포켓 덮개 - 상침 (1줄)',
    vi: 'Nap tui nguc - mi (1 ly)',
  },
  PKT_FLAP_TURN_CHEST: {
    en: 'Chest pocket flap - Turn',
    ko: '가슴 포켓 덮개 - 뒤집어 박기',
    vi: 'Nap tui nguc - may lon',
  },
  PKT_OPENING_FOLD: {
    en: 'Pocket opening - Fold',
    ko: '포켓 입구 - 접기',
    vi: 'Mieng tui - gap',
  },
  PLACKET_BARTACK_SHOULDER_TURN: {
    en: 'Placket / Shoulder seam - Bartack + Turn',
    ko: '단작 / 어깨선 - 바텍 + 뒤집어 박기',
    vi: 'Nep / duong vai - chan + may lon',
  },
  PLACKET_BUTTON_TAPE_SEW: {
    en: 'Placket button tape - Sew',
    ko: '단작 단추 테이프 - 봉제',
    vi: 'Day cuc nep - may',
  },
  PLACKET_EDGE_FOLD: {
    en: 'Placket edge - Fold',
    ko: '단작 가장자리 - 접기',
    vi: 'Mep nep - gap',
  },
  POCKET_BAG_ATTACH_FRONT: {
    en: 'Front pocket bag - Attach',
    ko: '앞판 포켓감 - 부착',
    vi: 'Lot tui than truoc - may',
  },
  POCKET_EDGESTITCH_AROUND: {
    en: 'Pocket edge - Edgestitch around',
    ko: '포켓 둘레 - 상침',
    vi: 'Mep tui - mi vong quanh',
  },
  POCKET_FACING_TURN_TOPSTITCH_FRONT: {
    en: 'Front pocket facing - Turn + Topstitch',
    ko: '앞판 포켓 페이싱 - 뒤집어 박기 + 상침',
    vi: 'Dap tui than truoc - may lon + mi',
  },
  SHOULDER_JOIN: {
    en: 'Shoulder seam - Join',
    ko: '어깨선 - 연결',
    vi: 'Vai - chap',
  },
  SHOULDER_OVERLOCK_5T: {
    en: 'Shoulder seam - Overlock (5T)',
    ko: '어깨선 - 오버록 (5실)',
    vi: 'Vai - vat so (5 chi)',
  },
  SHOULDER_TAPE_SEW_3CM: {
    en: 'Shoulder tape - Sew (3cm)',
    ko: '어깨 테이프 - 봉제 (3cm)',
    vi: 'Nep vai - may (3 cm)',
  },
  SHOULDER_TURN_BARTACK: {
    en: 'Shoulder seam - Turn + Bartack',
    ko: '어깨선 - 뒤집어 박기 + 바텍',
    vi: 'Vai - may lon + chan',
  },
  SIDE_POCKET_BAG_LINING_TURN: {
    en: 'Side pocket bag lining - Turn',
    ko: '옆 포켓 안감 - 뒤집어 박기',
    vi: 'Lot tui suon - may lon',
  },
  SIDE_SEAM_BACK_OVERLOCK_5T: {
    en: 'Back side seam - Overlock (5T)',
    ko: '뒤판 옆선 - 오버록 (5실)',
    vi: 'Suon than sau - vat so (5 chi)',
  },
  SIDE_SEAM_FRONT_OVERLOCK_5T: {
    en: 'Front side seam - Overlock (5T)',
    ko: '앞판 옆선 - 오버록 (5실)',
    vi: 'Suon than truoc - vat so (5 chi)',
  },
  SIDE_SEAM_OVERLOCK_5T_WITH_LABEL: {
    en: 'Side seam / Label - Overlock (5T)',
    ko: '옆선 / 라벨 - 오버록 (5실)',
    vi: 'Suon / mac - vat so (5 chi)',
  },
  SIDE_ZIPPER_ATTACH: {
    en: 'Side zipper - Attach',
    ko: '옆지퍼 - 달기',
    vi: 'Khoa suon - tra',
  },
  SIDE_ZIPPER_DROP_EDGE_OVERLOCK_3T: {
    en: 'Side zipper edge - Overlock (3T)',
    ko: '옆지퍼 부속 가장자리 - 오버록 (3실)',
    vi: 'Mep khoa suon - vat so (3 chi)',
  },
  SIDE_ZIPPER_LINING_TURN: {
    en: 'Side zipper lining - Turn',
    ko: '옆지퍼 안감 - 뒤집어 박기',
    vi: 'Lot khoa suon - may lon',
  },
  SIDE_ZIPPER_POCKET_BAG_EDGE_OVERLOCK_3T: {
    en: 'Side zipper pocket bag edge - Overlock (3T)',
    ko: '옆지퍼 포켓감 가장자리 - 오버록 (3실)',
    vi: 'Canh tui lot khoa suon - vat so (3 chi)',
  },
  SIDE_ZIPPER_STOP_BARTACK: {
    en: 'Side zipper stops - Bartack',
    ko: '옆지퍼 고정점 - 바텍',
    vi: 'Chot khoa suon - chan',
  },
  SIZE_LABEL_ATTACH: {
    en: 'Size label - Attach',
    ko: '사이즈 라벨 - 부착',
    vi: 'Mac size - may',
  },
  SLANT_POCKET_TURN_TOPSTITCH: {
    en: 'Slant pocket - Turn + Topstitch',
    ko: '사선 포켓 - 뒤집어 박기 + 상침',
    vi: 'Tui xeo - may lon + mi',
  },
  SLEEVE_ATTACH_OVERLOCK_5T: {
    en: 'Sleeve attachment - Overlock (5T)',
    ko: '소매 달기 - 오버록 (5실)',
    vi: 'Tra tay - vat so (5 chi)',
  },
  SLEEVE_HEM: {
    en: 'Sleeve hem - Sew',
    ko: '소매 밑단 - 봉제',
    vi: 'Gau tay - may',
  },
  SLIT_BARTACK_TOPSTITCH: {
    en: 'Slit - Bartack + Topstitch',
    ko: '트임 - 바텍 + 상침',
    vi: 'Xe - chan + mi',
  },
  SLIT_OVERLOCK_3T: {
    en: 'Slit - Overlock (3T)',
    ko: '트임 - 오버록 (3실)',
    vi: 'Xe - vat so (3 chi)',
  },
  WAISTBAND_ATTACH: {
    en: 'Waistband - Attach',
    ko: '허리밴드 - 달기',
    vi: 'Cap - tra',
  },
  WAISTBAND_BIND_DRAWSTRING_JOIN: {
    en: 'Waistband / Drawstring - Bind + Join',
    ko: '허리밴드 / 끈 - 바인딩 + 연결',
    vi: 'Cap / day - vien + noi',
  },
  WAISTBAND_CENTER_JOIN: {
    en: 'Waistband center seam - Join',
    ko: '허리밴드 중심선 - 연결',
    vi: 'Song cap - chap',
  },
  WAISTBAND_TOPSTITCH_FINISH: {
    en: 'Waistband - Topstitch (finish)',
    ko: '허리밴드 - 상침 (완성)',
    vi: 'Cap - mi (hoan thien)',
  },
  WELT_BAG_TURN_TOPSTITCH_BARTACK: {
    en: 'Welt / Pocket bag - Bartack + Topstitch + Turn + Topstitch',
    ko: '웰트 / 주머니 - 바텍 + 상침 + 뒤집어 박기 + 상침',
    vi: 'Coi / tui - chan + mi + may lon + mi',
  },
  WELT_BARTACK_TOPSTITCH: {
    en: 'Welt - Bartack + Topstitch',
    ko: '웰트 - 바텍 + 상침',
    vi: 'Coi - chan + mi',
  },
  WELT_OVERLOCK_3T: {
    en: 'Welt - Overlock (3T)',
    ko: '웰트 - 오버록 (3실)',
    vi: 'Coi - vat so (3 chi)',
  },
  WELT_RELEASE: {
    en: 'Welt pocket - Release',
    ko: '웰트 포켓 - 벌리기',
    vi: 'Tui coi - mo',
  },
  ZIPPER_GUARD_TURN: {
    en: 'Zipper guard - Turn',
    ko: '지퍼 가드 - 뒤집어 박기',
    vi: 'Do khoa - may lon',
  },
};

const toTrimmedText = (value) => String(value ?? '').trim();

const buildCombinedLocalizedProcessName = ({ nameKo, nameVi, nameEn, code }) => {
  const parts = [toTrimmedText(nameKo), toTrimmedText(nameVi)].filter(Boolean);
  if (parts.length > 0) return parts.join(' / ');
  return (
    toTrimmedText(nameEn) ||
    toTrimmedText(code) ||
    `${KO_PLACEHOLDERS.target} / ${VI_PLACEHOLDERS.target}`
  );
};

const normalizeProcessNaming = ({ code, name, nameEn, nameKo, nameVi }) => {
  const normalized = PROCESS_NAMING_BY_CODE[toTrimmedText(code).toUpperCase()] || null;
  const fallbackNameEn =
    toTrimmedText(nameEn) || toTrimmedText(name) || `${EN_PLACEHOLDERS.target} - ${EN_PLACEHOLDERS.action}`;
  const fallbackNameKo =
    toTrimmedText(nameKo) || `${KO_PLACEHOLDERS.target} - ${KO_PLACEHOLDERS.action}`;
  const fallbackNameVi =
    toTrimmedText(nameVi) || `${VI_PLACEHOLDERS.target} - ${VI_PLACEHOLDERS.action}`;
  const nextNameEn = normalized?.en || fallbackNameEn;
  const nextNameKo = normalized?.ko || fallbackNameKo;
  const nextNameVi = normalized?.vi || fallbackNameVi;
  return {
    code: toTrimmedText(code),
    name: nextNameEn,
    nameEn: nextNameEn,
    nameKo: nextNameKo,
    nameVi: nextNameVi,
  };
};

module.exports = {
  PROCESS_NAMING_BY_CODE,
  normalizeProcessNaming,
  buildCombinedLocalizedProcessName,
  KO_PLACEHOLDERS,
  EN_PLACEHOLDERS,
  VI_PLACEHOLDERS,
};
