#!/usr/bin/env node

import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "../backend/node_modules/@prisma/client/index.js";

const require = createRequire(import.meta.url);
const { normalizeProcessNaming } = require("../backend/scripts/lib/processNamingRules.js");
const prisma = new PrismaClient();

const ORG_ID = Number(process.env.ORG_ID || 2);
const CUSTOMER_NAME = String(process.env.CUSTOMER_NAME || "TSBR").trim() || "TSBR";
const TIME_REF_QUANTITY = 1000;
const PT_UPLIFT_RATE = 1.3;
const MIN_PROCESS_SECONDS = 30;

const round4 = (value) => Math.round(Number(value || 0) * 10000) / 10000;
const clampProcessSeconds = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.max(MIN_PROCESS_SECONDS, Math.round(parsed * 10000) / 10000);
};
const toSeedSeconds = (value) =>
  clampProcessSeconds(Math.ceil((Number(value) || 0) * PT_UPLIFT_RATE)) ?? MIN_PROCESS_SECONDS;

const masterProcess = (code, nameEn, nameKo, nameVi) =>
  normalizeProcessNaming({
    code,
    name: nameEn,
    nameEn,
    nameKo,
    nameVi,
  });

const row = (
  code,
  totalSeconds,
  {
    quantity = 1,
    sectionVi = "",
    sectionKo = "",
    detailVi = "",
    detailKo = "",
  } = {}
) => ({
  code,
  totalSeconds,
  quantity,
  sectionVi,
  sectionKo,
  detailVi,
  detailKo,
});

const MASTER_PROCESSES = [
  masterProcess(
    "PKT_FLAP_TURN_CHEST",
    "Turn chest pocket flap",
    "가슴 포켓 덮개 뒤집어 박기",
    "May lon nap tui nguc"
  ),
  masterProcess(
    "PKT_FLAP_TOPSTITCH_1N",
    "Single-needle topstitch chest pocket flap",
    "가슴 포켓 덮개 1줄 상침",
    "Mi 1 ly nap tui nguc"
  ),
  masterProcess(
    "PKT_OPENING_FOLD",
    "Fold pocket opening",
    "포켓 입구 접기",
    "Gap mieng tui"
  ),
  masterProcess(
    "FRONT_PLACKET_TURN_REINFORCE_TOPSTITCH",
    "Turn front placket and reinforce topstitch",
    "앞단작 뒤집어 박기 + 보강 상침",
    "May lon nep than truoc + mi tang cuong"
  ),
  masterProcess(
    "FRONT_PLACKET_TOPSTITCH",
    "Topstitch front placket",
    "앞단작 상침",
    "Tran nep than truoc"
  ),
  masterProcess(
    "BODY_HEM",
    "Hem body",
    "몸판 밑단 봉제",
    "May gau than"
  ),
  masterProcess(
    "PKT_ATTACH_FRONT",
    "Attach pocket to front body",
    "앞판 포켓 부착",
    "Dan tui vao than truoc"
  ),
  masterProcess(
    "FRONT_COLLAR_FACING_FOLD_5MM",
    "Fold front collar facing 5 mm",
    "앞목 페이싱 5mm 접기",
    "Gap dap co truoc 5 ly"
  ),
  masterProcess(
    "PKT_FLAP_BASTE_CHEST",
    "Baste chest pocket flap",
    "가슴 포켓 덮개 가봉",
    "Ghim nap tui nguc"
  ),
  masterProcess(
    "SIZE_LABEL_ATTACH",
    "Attach size label",
    "사이즈 라벨 부착",
    "May mac size"
  ),
  masterProcess(
    "BACK_COLLAR_FACING_TURN",
    "Turn back collar facing",
    "뒤목 페이싱 뒤집어 박기",
    "May lon dap co sau"
  ),
  masterProcess(
    "SHOULDER_JOIN",
    "Join shoulder seam",
    "어깨 연결",
    "Chap vai than truoc + than sau"
  ),
  masterProcess(
    "SHOULDER_OVERLOCK_5T",
    "5-thread overlock shoulder seam",
    "어깨 5실 오버록",
    "Vat so 5 chi vai"
  ),
  masterProcess(
    "NECKLINE_TOPSTITCH_BACK",
    "Single-needle neckline topstitch and back neck topstitch",
    "목둘레 1줄 상침 + 뒤목 상침",
    "Mi 1 ly vong co + tran co sau"
  ),
  masterProcess(
    "SLEEVE_ATTACH_OVERLOCK_5T",
    "5-thread overlock sleeve attachment",
    "소매 달기 5실 오버록",
    "Vat so 5 chi tra tay"
  ),
  masterProcess(
    "SLIT_OVERLOCK_3T",
    "3-thread overlock slit",
    "트임 3실 오버록",
    "Vat so 3 chi xe"
  ),
  masterProcess(
    "PKT_FLAP_OVERLOCK_3T",
    "3-thread overlock pocket flap",
    "포켓 덮개 3실 오버록",
    "Vat so 3 chi nap tui"
  ),
  masterProcess(
    "SIDE_SEAM_OVERLOCK_5T_WITH_LABEL",
    "5-thread overlock side seam with label",
    "옆선 + 라벨 5실 오버록",
    "Vat so 5 chi suon + mac"
  ),
  masterProcess(
    "SLIT_BARTACK_TOPSTITCH",
    "Bartack and topstitch slit",
    "트임 바텍 + 상침",
    "Chan xe + dieu xe"
  ),
  masterProcess(
    "SLEEVE_HEM",
    "Hem sleeve",
    "소매 밑단 봉제",
    "May gau tay"
  ),
  masterProcess("BARTACK", "Bartack", "바텍", "Bo"),
  masterProcess("BUTTON_ATTACH", "Attach button", "단추 달기", "Dong cuc"),
  masterProcess(
    "WELT_OVERLOCK_3T",
    "3-thread overlock welt",
    "웰트 3실 오버록",
    "Vat so 3 chi coi"
  ),
  masterProcess(
    "WELT_RELEASE",
    "Release welt pocket",
    "웰트 벌리기",
    "Tha coi"
  ),
  masterProcess(
    "WELT_BAG_TURN_TOPSTITCH_BARTACK",
    "Bartack welt, topstitch, turn pocket bag and topstitch",
    "웰트 바텍 + 상침 + 주머니 뒤집기 + 상침",
    "Chan coi + mi coi + may lon tui + dieu tui"
  ),
  masterProcess(
    "SLANT_POCKET_TURN_TOPSTITCH",
    "Turn slant pocket and topstitch",
    "사선 포켓 뒤집어 박기 + 상침",
    "May lon tui xeo + dieu"
  ),
  masterProcess(
    "POCKET_BAG_ATTACH_FRONT",
    "Attach front pocket bag",
    "앞판 포켓감 부착",
    "May dap vao lot tui than truoc"
  ),
  masterProcess(
    "POCKET_FACING_TURN_TOPSTITCH_FRONT",
    "Turn pocket facing and topstitch front",
    "앞판 포켓 페이싱 뒤집어 박기 + 상침",
    "May lon dap tui + mi than truoc"
  ),
  masterProcess(
    "FRONT_POCKET_OPENING_TOPSTITCH",
    "Topstitch front pocket opening",
    "앞판 포켓 입구 상침",
    "Dieu mieng tui than truoc"
  ),
  masterProcess(
    "FRONT_POCKET_END_BARTACK",
    "Bartack both ends of front pocket",
    "앞판 포켓 양끝 바텍",
    "Chan 2 dau tui than truoc"
  ),
  masterProcess("LABEL_BASTE", "Baste label", "라벨 가봉", "Ghim mac"),
  masterProcess(
    "FRONT_POCKET_FACING_OVERLOCK_3T",
    "3-thread overlock front pocket facing",
    "앞판 포켓 페이싱 3실 오버록",
    "Vat so 3 chi dap tui than truoc"
  ),
  masterProcess(
    "SIDE_ZIPPER_POCKET_BAG_EDGE_OVERLOCK_3T",
    "3-thread overlock side zipper pocket bag edge",
    "옆지퍼 포켓감 가장자리 3실 오버록",
    "Vat so 3 chi canh tui lot khoa suon"
  ),
  masterProcess(
    "SIDE_ZIPPER_DROP_EDGE_OVERLOCK_3T",
    "3-thread overlock side zipper edge",
    "옆지퍼 부속 가장자리 3실 오버록",
    "Vat so 3 chi mep khoa suon"
  ),
  masterProcess(
    "FLY_EDGE_OVERLOCK_3T",
    "3-thread overlock fly edge",
    "앞여밈 가장자리 3실 오버록",
    "Vat so 3 chi mep moi"
  ),
  masterProcess(
    "FRONT_FLY_EXTENSION_OVERLOCK_3T",
    "3-thread overlock front fly extension",
    "앞여밈 연장부 3실 오버록",
    "Vat so 3 chi moi thua truoc"
  ),
  masterProcess(
    "FLY_FACING_OVERLOCK_3T",
    "3-thread overlock fly facing",
    "앞여밈 페이싱 3실 오버록",
    "Vat so 3 chi dap moi"
  ),
  masterProcess(
    "SIDE_POCKET_BAG_LINING_TURN",
    "Turn side pocket bag lining",
    "옆 포켓 안감 뒤집기",
    "Quay lon lot dau tui suon"
  ),
  masterProcess(
    "SIDE_ZIPPER_STOP_BARTACK",
    "Bartack side zipper stops",
    "옆지퍼 고정점 바텍",
    "Chan 2 chot khoa suon"
  ),
  masterProcess(
    "SIDE_ZIPPER_ATTACH",
    "Attach side zipper",
    "옆지퍼 달기",
    "Tra khoa suon"
  ),
  masterProcess(
    "SIDE_ZIPPER_LINING_TURN",
    "Turn side zipper lining",
    "옆지퍼 안감 뒤집어 박기",
    "May lon lot khoa suon"
  ),
  masterProcess(
    "FLY_FACING_TURN_TOPSTITCH",
    "Turn fly facing and topstitch",
    "앞여밈 페이싱 뒤집어 박기 + 상침",
    "May lon dap moi + mi"
  ),
  masterProcess(
    "ZIPPER_GUARD_TURN",
    "Turn zipper guard",
    "지퍼 가드 뒤집어 박기",
    "May lon do khoa"
  ),
  masterProcess(
    "FLY_BARTACK_TURN",
    "Bartack and turn fly",
    "앞여밈 바텍 + 뒤집기",
    "Chan moi + quay moi"
  ),
  masterProcess(
    "FLY_ZIPPER_ATTACH_FACING_TOPSTITCH",
    "Attach zipper and fly facing, then topstitch",
    "지퍼 + 지퍼 페이싱 달기 + 상침",
    "Tra khoa + dap khoa + mi"
  ),
  masterProcess(
    "SIDE_SEAM_FRONT_OVERLOCK_5T",
    "5-thread overlock front side seam",
    "앞판 옆선 5실 오버록",
    "Vat so 5 chi suon than truoc"
  ),
  masterProcess(
    "SIDE_SEAM_BACK_OVERLOCK_5T",
    "5-thread overlock back side seam",
    "뒤판 옆선 5실 오버록",
    "Vat so 5 chi suon than sau"
  ),
  masterProcess(
    "FRONT_FLY_OVERLOCK_5T",
    "5-thread overlock front fly",
    "앞여밈 5실 오버록",
    "Vat so 5 chi moi than truoc"
  ),
  masterProcess(
    "CROTCH_INSEAM_OVERLOCK_5T",
    "5-thread overlock crotch and inseam",
    "샅 + 인심 5실 오버록",
    "Vat so 5 chi dang + dung"
  ),
  masterProcess(
    "WAISTBAND_BIND_DRAWSTRING_JOIN",
    "Bind waistband and join drawstring",
    "허리밴드 바인딩 + 끈 연결",
    "Vien cap + noi day vien"
  ),
  masterProcess(
    "WAISTBAND_CENTER_JOIN",
    "Join waistband center seam",
    "허리밴드 중심 연결",
    "Chap song cap"
  ),
  masterProcess(
    "MAIN_LABEL_ATTACH",
    "Attach main label",
    "메인 라벨 부착",
    "May mac chinh"
  ),
  masterProcess(
    "BUTTONHOLE",
    "Make buttonhole",
    "단춧구멍 만들기",
    "Thua khuy"
  ),
  masterProcess(
    "ELASTIC_KANSAI_STITCH",
    "Kansai stitch elastic",
    "고무줄 간사이 봉제",
    "Chay Kansai chun"
  ),
  masterProcess(
    "ELASTIC_BARTACK",
    "Bartack elastic",
    "고무줄 바텍",
    "Chan chun"
  ),
  masterProcess(
    "DRAWSTRING_BIND",
    "Bind drawstring",
    "끈 바인딩",
    "Vien day"
  ),
  masterProcess(
    "DRAWSTRING_END_BARTACK",
    "Bartack both drawstring ends",
    "끈 양끝 바텍",
    "Chan 2 dau day"
  ),
  masterProcess(
    "WAISTBAND_ATTACH",
    "Attach waistband",
    "허리밴드 달기",
    "Tra cap"
  ),
  masterProcess(
    "WAISTBAND_TOPSTITCH_FINISH",
    "Topstitch finished waistband",
    "허리밴드 완성 상침",
    "Mi thanh pham cap"
  ),
  masterProcess(
    "PANTS_HEM",
    "Hem pants",
    "바지 밑단 봉제",
    "May gau quan"
  ),
  masterProcess(
    "PEN_LOOP_CUT_BARTACK",
    "Cut pen loop and bartack",
    "펜 고리 재단 + 바텍",
    "Cat day but + chan"
  ),
  masterProcess(
    "PLACKET_EDGE_FOLD",
    "Fold placket edge",
    "단작 가장자리 접기",
    "Gap mep nep"
  ),
  masterProcess(
    "PLACKET_BUTTON_TAPE_SEW",
    "Sew placket button tape",
    "단작 단추 테이프 봉제",
    "May day cuc nep"
  ),
  masterProcess(
    "FRONT_PLACKET_FACING_ATTACH_MARK",
    "Attach front placket facing and mark",
    "앞단작 페이싱 부착 + 표시",
    "May dap vao tru than truoc + lay dau"
  ),
  masterProcess(
    "FRONT_PLACKET_OPEN_TOPSTITCH",
    "Open placket and topstitch",
    "단작 열기 + 상침",
    "Mo tru + mi tru"
  ),
  masterProcess(
    "BACK_DART",
    "Sew back darts",
    "뒤판 다트 봉제",
    "Chiet ly than sau"
  ),
  masterProcess(
    "BACK_YOKE_JOIN",
    "Join back yoke",
    "뒤 요크 연결",
    "Chap cau vai than sau"
  ),
  masterProcess(
    "BACK_YOKE_TOPSTITCH_1N",
    "Single-needle topstitch back yoke",
    "뒤 요크 1줄 상침",
    "Mi 1 ly cau vai than sau"
  ),
  masterProcess(
    "COLLAR_TURN_TOPSTITCH_1N",
    "Turn collar and single-needle topstitch",
    "칼라 뒤집어 박기 + 1줄 상침",
    "May lon co + mi 1 ly"
  ),
  masterProcess(
    "PLACKET_BARTACK_SHOULDER_TURN",
    "Bartack placket and turn shoulder seam",
    "단작 바텍 + 어깨 뒤집어 박기",
    "Chan tru + may lon vai"
  ),
  masterProcess(
    "WELT_BARTACK_TOPSTITCH",
    "Bartack welt and topstitch",
    "웰트 바텍 + 상침",
    "Chan coi + mi coi"
  ),
  masterProcess(
    "FRONT_NECK_FACING_TURN_TOPSTITCH",
    "Turn front neck facing and topstitch",
    "앞목 페이싱 뒤집어 박기 + 상침",
    "May lon dap co than truoc + mi dap"
  ),
  masterProcess(
    "SHOULDER_TAPE_SEW_3CM",
    "Sew 3 cm shoulder tape",
    "어깨 테이프 3cm 봉제",
    "May nep vai 3 cm"
  ),
  masterProcess(
    "FRONT_NECK_FACING_ATTACH",
    "Attach front neck facing",
    "앞목 페이싱 부착",
    "Tra dap co vao than truoc"
  ),
  masterProcess(
    "FRONT_NECKLINE_TOPSTITCH_1N_2N",
    "Single-needle and double-needle topstitch front neckline",
    "앞목 1줄 + 2줄 상침",
    "Mi 1 ly + 2 ly vong co than truoc"
  ),
  masterProcess(
    "POCKET_EDGESTITCH_AROUND",
    "Edge stitch around pocket",
    "포켓 둘레 상침",
    "Tran vong quanh tui"
  ),
  masterProcess(
    "BACK_YOKE_CONTRAST_TURN",
    "Turn back yoke contrast",
    "뒤 요크 배색 뒤집어 박기",
    "May lon phoi cau vai than sau"
  ),
  masterProcess(
    "BACK_YOKE_CONTRAST_TOPSTITCH_1N_2N",
    "Single-needle and double-needle topstitch back yoke contrast",
    "뒤 요크 배색 1줄 + 2줄 상침",
    "Mi 1 ly + 2 ly phoi cau vai"
  ),
  masterProcess(
    "BACK_NECKLINE_TURN_TOPSTITCH",
    "Turn back neckline and topstitch",
    "뒤목 뒤집어 박기 + 상침",
    "May lon vong co than sau + mi"
  ),
  masterProcess(
    "SHOULDER_TURN_BARTACK",
    "Turn shoulder seam and bartack",
    "어깨 뒤집어 박기 + 바텍",
    "May lon vai + chan vai"
  ),
  masterProcess(
    "FRONT_NECK_FACING_OVERLOCK_3T",
    "3-thread overlock front neck facing",
    "앞목 페이싱 3실 오버록",
    "Vat so 3 chi dap co than truoc"
  ),
  masterProcess(
    "FRONT_POCKET_OVERLOCK_5T",
    "5-thread overlock front pocket",
    "앞판 포켓 5실 오버록",
    "Vat so 5 chi tui than truoc"
  ),
  ];

const STYLES = [
  {
    styleId: "BL20",
    styleCode: "BL20",
    name: "BL20",
    expectedTotalSeconds: 1956,
    rows: [
      row("PKT_FLAP_TURN_CHEST", 80, { sectionVi: "Than truoc", sectionKo: "앞판" }),
      row("PKT_FLAP_TOPSTITCH_1N", 40, { sectionVi: "Than truoc", sectionKo: "앞판" }),
      row("PKT_OPENING_FOLD", 80, {
        quantity: 3,
        sectionVi: "Than truoc",
        sectionKo: "앞판",
      }),
      row("FRONT_PLACKET_TURN_REINFORCE_TOPSTITCH", 150, {
        sectionVi: "Than truoc",
        sectionKo: "앞판",
      }),
      row("FRONT_PLACKET_TOPSTITCH", 130, {
        quantity: 2,
        sectionVi: "Than truoc",
        sectionKo: "앞판",
      }),
      row("BODY_HEM", 150, { quantity: 2, sectionVi: "Than ao", sectionKo: "몸판" }),
      row("PKT_ATTACH_FRONT", 268, {
        quantity: 3,
        sectionVi: "Than truoc",
        sectionKo: "앞판",
      }),
      row("FRONT_COLLAR_FACING_FOLD_5MM", 70, {
        quantity: 2,
        sectionVi: "Than truoc",
        sectionKo: "앞판",
      }),
      row("PKT_FLAP_BASTE_CHEST", 40, { sectionVi: "Than truoc", sectionKo: "앞판" }),
      row("SIZE_LABEL_ATTACH", 50, { sectionVi: "Than sau", sectionKo: "뒤판" }),
      row("BACK_COLLAR_FACING_TURN", 80, { sectionVi: "Than sau", sectionKo: "뒤판" }),
      row("SHOULDER_JOIN", 100, { sectionVi: "Than sau", sectionKo: "뒤판" }),
      row("SHOULDER_OVERLOCK_5T", 40, {
        quantity: 2,
        sectionVi: "Than sau",
        sectionKo: "뒤판",
      }),
      row("NECKLINE_TOPSTITCH_BACK", 130, { sectionVi: "Than sau", sectionKo: "뒤판" }),
      row("SLEEVE_ATTACH_OVERLOCK_5T", 110, {
        quantity: 2,
        sectionVi: "Than sau",
        sectionKo: "뒤판",
      }),
      row("SLIT_OVERLOCK_3T", 40, {
        quantity: 4,
        sectionVi: "Than sau",
        sectionKo: "뒤판",
      }),
      row("PKT_FLAP_OVERLOCK_3T", 30, { sectionVi: "Than sau", sectionKo: "뒤판" }),
      row("SIDE_SEAM_OVERLOCK_5T_WITH_LABEL", 113, {
        quantity: 2,
        sectionVi: "Than sau",
        sectionKo: "뒤판",
      }),
      row("SLIT_BARTACK_TOPSTITCH", 60, {
        quantity: 2,
        sectionVi: "Than sau",
        sectionKo: "뒤판",
      }),
      row("SLEEVE_HEM", 105, { sectionVi: "Than sau", sectionKo: "뒤판" }),
      row("BARTACK", 90, {
        quantity: 6,
        sectionVi: "Than sau",
        sectionKo: "뒤판",
        detailVi: "Bo thanh pham",
        detailKo: "완성 바텍",
      }),
      row("BUTTON_ATTACH", 0, {
        quantity: 6,
        sectionVi: "Than sau",
        sectionKo: "뒤판",
      }),
    ],
  },
  {
    styleId: "AM01160",
    styleCode: "AM01160",
    name: "AM01160",
    expectedTotalSeconds: 4301,
    rows: [
      row("WELT_OVERLOCK_3T", 30, { quantity: 2, sectionVi: "Than sau", sectionKo: "뒤판" }),
      row("WELT_RELEASE", 280, { quantity: 2, sectionVi: "Than sau", sectionKo: "뒤판" }),
      row("WELT_BAG_TURN_TOPSTITCH_BARTACK", 580, {
        quantity: 2,
        sectionVi: "Than sau",
        sectionKo: "뒤판",
      }),
      row("SLANT_POCKET_TURN_TOPSTITCH", 275, {
        quantity: 2,
        sectionVi: "Than truoc",
        sectionKo: "앞판",
      }),
      row("POCKET_BAG_ATTACH_FRONT", 50, {
        quantity: 2,
        sectionVi: "Than truoc",
        sectionKo: "앞판",
      }),
      row("POCKET_FACING_TURN_TOPSTITCH_FRONT", 70, {
        quantity: 2,
        sectionVi: "Than truoc",
        sectionKo: "앞판",
      }),
      row("FRONT_POCKET_OPENING_TOPSTITCH", 55, {
        quantity: 2,
        sectionVi: "Than truoc",
        sectionKo: "앞판",
      }),
      row("FRONT_POCKET_END_BARTACK", 60, {
        quantity: 4,
        sectionVi: "Than truoc",
        sectionKo: "앞판",
      }),
      row("LABEL_BASTE", 35, { sectionVi: "Than truoc", sectionKo: "앞판" }),
      row("FRONT_POCKET_FACING_OVERLOCK_3T", 40, {
        quantity: 2,
        sectionVi: "Vat so 3 chi",
        sectionKo: "3실 오버록",
      }),
      row("SIDE_ZIPPER_POCKET_BAG_EDGE_OVERLOCK_3T", 40, {
        quantity: 2,
        sectionVi: "Vat so 3 chi",
        sectionKo: "3실 오버록",
      }),
      row("SIDE_ZIPPER_DROP_EDGE_OVERLOCK_3T", 40, {
        quantity: 2,
        sectionVi: "Vat so 3 chi",
        sectionKo: "3실 오버록",
      }),
      row("FLY_EDGE_OVERLOCK_3T", 35, {
        sectionVi: "Vat so 3 chi",
        sectionKo: "3실 오버록",
      }),
      row("FRONT_FLY_EXTENSION_OVERLOCK_3T", 40, {
        sectionVi: "Vat so 3 chi",
        sectionKo: "3실 오버록",
      }),
      row("FLY_FACING_OVERLOCK_3T", 20, {
        sectionVi: "Vat so 3 chi",
        sectionKo: "3실 오버록",
      }),
      row("SIDE_POCKET_BAG_LINING_TURN", 162, {
        sectionVi: "Tra khoa suon",
        sectionKo: "옆지퍼",
      }),
      row("SIDE_ZIPPER_STOP_BARTACK", 40, {
        sectionVi: "Tra khoa suon",
        sectionKo: "옆지퍼",
      }),
      row("SIDE_ZIPPER_ATTACH", 140, {
        sectionVi: "Tra khoa suon",
        sectionKo: "옆지퍼",
      }),
      row("SIDE_ZIPPER_LINING_TURN", 140, {
        sectionVi: "Tra khoa suon",
        sectionKo: "옆지퍼",
      }),
      row("FLY_FACING_TURN_TOPSTITCH", 40, {
        sectionVi: "Tra khoa moi",
        sectionKo: "앞지퍼",
      }),
      row("ZIPPER_GUARD_TURN", 60, {
        sectionVi: "Tra khoa moi",
        sectionKo: "앞지퍼",
      }),
      row("FLY_BARTACK_TURN", 70, {
        sectionVi: "Tra khoa moi",
        sectionKo: "앞지퍼",
      }),
      row("FLY_ZIPPER_ATTACH_FACING_TOPSTITCH", 180, {
        sectionVi: "Tra khoa moi",
        sectionKo: "앞지퍼",
      }),
      row("SIDE_SEAM_FRONT_OVERLOCK_5T", 140, {
        sectionVi: "Vat so 5 chi",
        sectionKo: "5실 오버록",
      }),
      row("SIDE_SEAM_BACK_OVERLOCK_5T", 120, {
        sectionVi: "Vat so 5 chi",
        sectionKo: "5실 오버록",
      }),
      row("FRONT_FLY_OVERLOCK_5T", 40, {
        sectionVi: "Vat so 5 chi",
        sectionKo: "5실 오버록",
      }),
      row("CROTCH_INSEAM_OVERLOCK_5T", 200, {
        sectionVi: "Vat so 5 chi",
        sectionKo: "5실 오버록",
      }),
      row("WAISTBAND_BIND_DRAWSTRING_JOIN", 100, { sectionVi: "Cap", sectionKo: "허리밴드" }),
      row("WAISTBAND_CENTER_JOIN", 30, { sectionVi: "Cap", sectionKo: "허리밴드" }),
      row("MAIN_LABEL_ATTACH", 50, { sectionVi: "Cap", sectionKo: "허리밴드" }),
      row("BUTTONHOLE", 40, { sectionVi: "Cap", sectionKo: "허리밴드" }),
      row("ELASTIC_KANSAI_STITCH", 170, { sectionVi: "Cap", sectionKo: "허리밴드" }),
      row("ELASTIC_BARTACK", 30, { sectionVi: "Cap", sectionKo: "허리밴드" }),
      row("DRAWSTRING_BIND", 130, { sectionVi: "Cap", sectionKo: "허리밴드" }),
      row("DRAWSTRING_END_BARTACK", 95, { sectionVi: "Cap", sectionKo: "허리밴드" }),
      row("WAISTBAND_ATTACH", 150, {
        sectionVi: "Hoan thien quan",
        sectionKo: "바지 마감",
      }),
      row("WAISTBAND_TOPSTITCH_FINISH", 187, {
        sectionVi: "Hoan thien quan",
        sectionKo: "바지 마감",
      }),
      row("PANTS_HEM", 197, {
        quantity: 2,
        sectionVi: "Hoan thien quan",
        sectionKo: "바지 마감",
      }),
      row("BARTACK", 140, {
        quantity: 11,
        sectionVi: "Hoan thien quan",
        sectionKo: "바지 마감",
        detailVi: "Bo thanh pham quan",
        detailKo: "바지 완성 바텍",
      }),
    ],
  },
  {
    styleId: "AM01622",
    styleCode: "AM01622",
    name: "AM01622",
    expectedTotalSeconds: 1863,
    rows: [
      row("PKT_OPENING_FOLD", 70, {
        quantity: 3,
        sectionVi: "Than truoc",
        sectionKo: "앞판",
      }),
      row("PEN_LOOP_CUT_BARTACK", 57, {
        sectionVi: "Than truoc",
        sectionKo: "앞판",
      }),
      row("PKT_ATTACH_FRONT", 260, {
        quantity: 3,
        sectionVi: "Than truoc",
        sectionKo: "앞판",
      }),
      row("PLACKET_EDGE_FOLD", 60, {
        quantity: 2,
        sectionVi: "Than truoc",
        sectionKo: "앞판",
      }),
      row("PLACKET_BUTTON_TAPE_SEW", 120, {
        quantity: 2,
        sectionVi: "Than truoc",
        sectionKo: "앞판",
      }),
      row("FRONT_PLACKET_FACING_ATTACH_MARK", 170, {
        quantity: 2,
        sectionVi: "Than truoc",
        sectionKo: "앞판",
      }),
      row("FRONT_PLACKET_OPEN_TOPSTITCH", 154, {
        sectionVi: "Than truoc",
        sectionKo: "앞판",
      }),
      row("SIZE_LABEL_ATTACH", 46, {
        sectionVi: "Than sau",
        sectionKo: "뒤판",
      }),
      row("BACK_DART", 56, {
        quantity: 2,
        sectionVi: "Than sau",
        sectionKo: "뒤판",
      }),
      row("BACK_YOKE_JOIN", 50, {
        sectionVi: "Than sau",
        sectionKo: "뒤판",
      }),
      row("BACK_YOKE_TOPSTITCH_1N", 50, {
        sectionVi: "Than sau",
        sectionKo: "뒤판",
      }),
      row("COLLAR_TURN_TOPSTITCH_1N", 115, {
        sectionVi: "Than sau",
        sectionKo: "뒤판",
      }),
      row("PLACKET_BARTACK_SHOULDER_TURN", 125, {
        quantity: 2,
        sectionVi: "Than sau",
        sectionKo: "뒤판",
      }),
      row("SLIT_OVERLOCK_3T", 40, {
        quantity: 4,
        sectionVi: "Vat so 3 chi",
        sectionKo: "3실 오버록",
      }),
      row("SLEEVE_ATTACH_OVERLOCK_5T", 100, {
        quantity: 2,
        sectionVi: "Vat so 5 chi",
        sectionKo: "5실 오버록",
      }),
      row("SIDE_SEAM_OVERLOCK_5T_WITH_LABEL", 110, {
        quantity: 2,
        sectionVi: "Vat so 5 chi",
        sectionKo: "5실 오버록",
      }),
      row("SLIT_BARTACK_TOPSTITCH", 80, {
        quantity: 2,
        sectionVi: "Hoan thien ao",
        sectionKo: "상의 마감",
      }),
      row("BODY_HEM", 100, {
        sectionVi: "Hoan thien ao",
        sectionKo: "상의 마감",
      }),
      row("SLEEVE_HEM", 100, {
        sectionVi: "Hoan thien ao",
        sectionKo: "상의 마감",
      }),
    ],
  },
  {
    styleId: "AM02053",
    styleCode: "AM02053",
    name: "AM02053",
    expectedTotalSeconds: 2247,
    rows: [
      row("WELT_RELEASE", 90, {
        sectionVi: "Than truoc",
        sectionKo: "앞판",
        detailVi: "Tui nguc",
        detailKo: "가슴 포켓",
      }),
      row("WELT_RELEASE", 190, {
        quantity: 2,
        sectionVi: "Than truoc",
        sectionKo: "앞판",
        detailVi: "Tui duoi",
        detailKo: "아래 포켓",
      }),
      row("DRAWSTRING_END_BARTACK", 65, {
        sectionVi: "Than truoc",
        sectionKo: "앞판",
        detailVi: "Day",
        detailKo: "끈",
      }),
      row("WELT_BARTACK_TOPSTITCH", 85, {
        sectionVi: "Than truoc",
        sectionKo: "앞판",
        detailVi: "Tui nguc",
        detailKo: "가슴 포켓",
      }),
      row("WELT_BARTACK_TOPSTITCH", 150, {
        quantity: 2,
        sectionVi: "Than truoc",
        sectionKo: "앞판",
        detailVi: "Tui duoi",
        detailKo: "아래 포켓",
      }),
      row("FRONT_NECK_FACING_TURN_TOPSTITCH", 120, {
        sectionVi: "Than truoc",
        sectionKo: "앞판",
      }),
      row("SHOULDER_TAPE_SEW_3CM", 80, {
        quantity: 2,
        sectionVi: "Than truoc",
        sectionKo: "앞판",
      }),
      row("FRONT_NECK_FACING_ATTACH", 90, {
        sectionVi: "Than truoc",
        sectionKo: "앞판",
      }),
      row("FRONT_NECKLINE_TOPSTITCH_1N_2N", 90, {
        sectionVi: "Than truoc",
        sectionKo: "앞판",
      }),
      row("POCKET_EDGESTITCH_AROUND", 100, {
        sectionVi: "Than truoc",
        sectionKo: "앞판",
      }),
      row("SIZE_LABEL_ATTACH", 35, {
        sectionVi: "Than sau",
        sectionKo: "뒤판",
      }),
      row("BACK_DART", 50, {
        sectionVi: "Than sau",
        sectionKo: "뒤판",
      }),
      row("BACK_YOKE_CONTRAST_TURN", 57, {
        sectionVi: "Than sau",
        sectionKo: "뒤판",
      }),
      row("BACK_YOKE_CONTRAST_TOPSTITCH_1N_2N", 80, {
        sectionVi: "Than sau",
        sectionKo: "뒤판",
      }),
      row("BACK_NECKLINE_TURN_TOPSTITCH", 110, {
        sectionVi: "Than sau",
        sectionKo: "뒤판",
      }),
      row("SHOULDER_TURN_BARTACK", 80, {
        quantity: 2,
        sectionVi: "Than sau",
        sectionKo: "뒤판",
      }),
      row("FRONT_NECK_FACING_OVERLOCK_3T", 30, {
        sectionVi: "Vat so 3 chi",
        sectionKo: "3실 오버록",
      }),
      row("SLIT_OVERLOCK_3T", 50, {
        quantity: 4,
        sectionVi: "Vat so 3 chi",
        sectionKo: "3실 오버록",
      }),
      row("FRONT_POCKET_OVERLOCK_5T", 90, {
        quantity: 3,
        sectionVi: "Vat so 5 chi",
        sectionKo: "5실 오버록",
      }),
      row("SLEEVE_ATTACH_OVERLOCK_5T", 90, {
        quantity: 2,
        sectionVi: "Vat so 5 chi",
        sectionKo: "5실 오버록",
      }),
      row("SIDE_SEAM_OVERLOCK_5T_WITH_LABEL", 115, {
        quantity: 2,
        sectionVi: "Vat so 5 chi",
        sectionKo: "5실 오버록",
      }),
      row("SLIT_BARTACK_TOPSTITCH", 70, {
        quantity: 2,
        sectionVi: "Hoan thien ao",
        sectionKo: "상의 마감",
      }),
      row("BODY_HEM", 115, {
        quantity: 2,
        sectionVi: "Hoan thien ao",
        sectionKo: "상의 마감",
      }),
      row("SLEEVE_HEM", 120, {
        quantity: 2,
        sectionVi: "Hoan thien ao",
        sectionKo: "상의 마감",
      }),
      row("BARTACK", 95, {
        quantity: 8,
        sectionVi: "Hoan thien ao",
        sectionKo: "상의 마감",
        detailVi: "Bo ao",
        detailKo: "상의 바텍",
      }),
    ],
  },
];

const buildStyleRowMap = (rows) => {
  const aggregated = new Map();

  rows.forEach((item) => {
    const current = aggregated.get(item.code) || {
      code: item.code,
      totalSeconds: 0,
      quantity: 0,
      sectionsVi: new Set(),
      sectionsKo: new Set(),
      detailsVi: new Set(),
      detailsKo: new Set(),
    };
    current.totalSeconds += Number(item.totalSeconds) || 0;
    current.quantity += Number(item.quantity) || 0;
    if (item.sectionVi) current.sectionsVi.add(item.sectionVi);
    if (item.sectionKo) current.sectionsKo.add(item.sectionKo);
    if (item.detailVi) current.detailsVi.add(item.detailVi);
    if (item.detailKo) current.detailsKo.add(item.detailKo);
    aggregated.set(item.code, current);
  });

  return Array.from(aggregated.values()).map((item) => {
    const quantity = Math.max(1, Math.round(item.quantity || 1));
    const totalSeconds = round4(item.totalSeconds);
    const detailsKo = Array.from(item.detailsKo).join(", ");
    const detailsVi = Array.from(item.detailsVi).join(", ");
    const sectionsKo = Array.from(item.sectionsKo).join(", ");
    const sectionsVi = Array.from(item.sectionsVi).join(", ");
    const detailLine = [detailsKo, detailsVi].filter(Boolean).join(" / ");
    const sectionLine = [sectionsKo, sectionsVi].filter(Boolean).join(" / ");

    return {
      ...item,
      totalSeconds,
      quantity,
      perOccurrenceSeconds: round4(totalSeconds / quantity),
      seededPtSeconds: toSeedSeconds(totalSeconds / quantity),
      description: [detailLine, sectionLine].filter(Boolean).join(" | "),
    };
  });
};

const buildStyleProcessPayload = ({
  styleId,
  processIdByCode,
  row,
  master,
  sortOrder,
}) => {
  if (!master) {
    throw new Error(`Unknown master process code: ${row.code}`);
  }

  return {
    id: processIdByCode.get(master.code) ?? null,
    code: master.code,
    name: `${master.nameKo} / ${master.nameVi}`,
    description: row.description || null,
    quantity: row.quantity,
    pt: row.calibratedPtSeconds ?? row.seededPtSeconds,
    stValues: [
      {
        quantity: TIME_REF_QUANTITY,
        seconds: row.calibratedPtSeconds ?? row.seededPtSeconds,
        setBy: "SEED",
        setAt: null,
        updatedAt: null,
      },
    ],
    timeRefQuantity: TIME_REF_QUANTITY,
    ct: null,
    stManual: false,
    atParams: null,
    instanceId: `${master.code}-${styleId}-${sortOrder + 1}`,
  };
};

const summarizeTotalSeconds = (processes) =>
  processes.reduce(
    (sum, process) => sum + (Number(process.quantity) || 0) * (Number(process.pt) || 0),
    0
  );

const buildStyleDrafts = () =>
  STYLES.map((style) => {
    const aggregatedRows = buildStyleRowMap(style.rows);
    const totalSeconds = round4(
      aggregatedRows.reduce((sum, item) => sum + item.totalSeconds, 0)
    );
    return {
      ...style,
      aggregatedRows,
      totalSeconds,
    };
  });

const validateSeedDefinition = (styleDrafts) => {
  const masterCodes = new Set(MASTER_PROCESSES.map((item) => item.code));

  styleDrafts.forEach((style) => {
    style.aggregatedRows.forEach((item) => {
      if (!masterCodes.has(item.code)) {
        throw new Error(
          `Style ${style.styleId} references unknown master process ${item.code}`
        );
      }
    });

    if (round4(style.totalSeconds) !== round4(style.expectedTotalSeconds)) {
      throw new Error(
        `Style ${style.styleId} total mismatch: expected ${style.expectedTotalSeconds}, got ${style.totalSeconds}`
      );
    }
  });
};

const run = async () => {
  const styleDrafts = buildStyleDrafts();
  validateSeedDefinition(styleDrafts);

  await prisma.$transaction(
    async (tx) => {
      await tx.style.deleteMany({
        where: { orgId: ORG_ID },
      });

      await tx.attrProcess.deleteMany({
        where: { orgId: ORG_ID },
      });

      await tx.attrProcess.createMany({
        data: MASTER_PROCESSES.map((item) => ({
          orgId: ORG_ID,
          code: item.code,
          name: item.name,
          nameKo: item.nameKo,
          nameEn: item.nameEn,
          nameVi: item.nameVi,
        })),
      });

      const createdProcesses = await tx.attrProcess.findMany({
        where: { orgId: ORG_ID },
        orderBy: { id: "asc" },
        select: { id: true, code: true },
      });
      const processIdByCode = new Map(
        createdProcesses.map((item) => [item.code, item.id])
      );
      const masterByCode = new Map(MASTER_PROCESSES.map((item) => [item.code, item]));

      for (const style of styleDrafts) {
        const processes = style.aggregatedRows.map((item, index) =>
          buildStyleProcessPayload({
            styleId: style.styleId,
            processIdByCode,
            row: item,
            master: masterByCode.get(item.code),
            sortOrder: index,
          })
        );

        const createdStyle = await tx.style.create({
          data: {
            orgId: ORG_ID,
            styleId: style.styleId,
            styleCode: style.styleCode,
            name: style.name,
            customer: CUSTOMER_NAME,
            registrationDate: new Date().toISOString().slice(0, 10),
            collection: "VN_MASTER",
            season: "ALL",
            imageUrls: [],
            processes,
            bom: [],
            bomNotes: "Unified common process master seed",
          },
        });

        for (let index = 0; index < processes.length; index += 1) {
          const process = processes[index];
          const createdStyleProcess = await tx.styleProcess.create({
            data: {
              orgId: ORG_ID,
              styleUid: createdStyle.uid,
              processCode: process.code,
              processName: process.name,
              processDescription: process.description,
              processQuantity: process.quantity,
              sortOrder: index,
              ptSeconds: process.pt,
              atParams: null,
            },
          });

          await tx.styleProcessStandard.create({
            data: {
              orgId: ORG_ID,
              styleProcessId: createdStyleProcess.id,
              quantity: TIME_REF_QUANTITY,
              stSeconds: process.pt,
              setBy: "SEED",
            },
          });
        }
      }
    },
    {
      maxWait: 10000,
      timeout: 60000,
    }
  );

  const realignOutput = execFileSync(
    process.execPath,
    [path.join(process.cwd(), "backend", "scripts", "reset-to-baseline.js"), "time-model"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ORG_ID: String(ORG_ID),
      },
      encoding: "utf8",
    }
  );
  const timeModelRealign = JSON.parse(realignOutput.trim());

  const [styles, processCount] = await Promise.all([
    prisma.style.findMany({
      where: {
        orgId: ORG_ID,
        styleId: { in: STYLES.map((style) => style.styleId) },
      },
      orderBy: { styleId: "asc" },
      select: {
        styleId: true,
        styleCode: true,
        name: true,
        processes: true,
      },
    }),
    prisma.attrProcess.count({
      where: { orgId: ORG_ID },
    }),
  ]);

  const summary = styles.map((style) => ({
    styleId: style.styleId,
    styleCode: style.styleCode,
    name: style.name,
    processCount: Array.isArray(style.processes) ? style.processes.length : 0,
    totalPt1000: summarizeTotalSeconds(
      Array.isArray(style.processes) ? style.processes : []
    ),
  }));

  console.log(
    JSON.stringify(
      {
        replacedProcessMasterCount: processCount,
        timeModelRealign: timeModelRealign.summary,
        styles: summary,
      },
      null,
      2
    )
  );
};

run()
  .catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
