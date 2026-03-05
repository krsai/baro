#!/usr/bin/env node
'use strict';

/**
 * ???獒???縕?猿녿뎨?????袁⑹뵫?繹?????baseline v2.0
 *
 * ????????
 *   Style, WorkOrder, AssignmentPlan, AssignmentBoardState
 *   AttrProcess (P01~P10???⑥???怨뚮옖甕??
 *
 * ??? ????
 *   Organization, OrgRelationship, OrgMembership
 *   Employee, Factory, Line
 *
 * ?????????
 *   LineAssignment: ??ш끽維?????⑤챷??????繹먮끏??1(???????01~20), ??繹먮끏??2(???????01~20) ?????
 *   Line.managerEmployeeId: ??繹먮끏??1 ??line1-worker01, ??繹먮끏??2 ??line2-worker01
 *
 * ?濚밸Ŧ援욃ㅇ?????
 *   Style: 3??(???戮곗궀??????繹먮끏裕??筌?留????Β?궰??λ읂?/ ??????怨멸텭??????繞???釉먯뒮??/ ????곷츉?????ㅻ쿋筌???雅?
 *   WorkOrder: 2??(ORD-2025SS-001 5,000??/ ORD-2025FW-001 2,500??
 *   癲ル슢??猿눫?? ???袁⑹뵫?繹???????덈틖 ??筌믨퀣????れ삀?????⑥??????깆뱾 ??節뚮쳮雅?(??筌?鍮?癲ル슪?ｇ몭?? ??ш끽維??????彛??癲ル슢??씙??
 *
 *
 * ???????????늄??
 *   ??繹먮끏??1 (20癲?: line1-worker01~20@baro.local ????繹먮끏?? ???????1~20
 *   ??繹먮끏??2 (20癲?: line2-worker01~20@baro.local ????繹먮끏?? ???????1~20
 *   ??繹먮끏??? ??繹먮끏??1 ??line1-worker01, ??繹먮끏??2 ??line2-worker01
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const BASELINE_ASSIGNMENT_AGREEMENTS = {
  "cards": [
    {
      "cardId": "ORD-2025FW-001::S-2025FW-J003::LT-BLUE::M",
      "lineKey": "LINE_1",
      "ctAgreedSnapshot": {
        "lineId": "1",
        "agreedAt": "2026-03-05T10:19:30.037Z",
        "agreedBy": "라인1 작업자01",
        "quantity": 470,
        "schedule": {
          "endIndex": 29,
          "endDateKey": "2026-03-30",
          "startIndex": 23,
          "startDateKey": "2026-03-24",
          "endDayPercent": 79.86111111111111,
          "startDayPercent": 9.722222222222213,
          "startDayOffsetPercent": 90.27777777777779
        },
        "processes": [
          {
            "name": "원단 재단",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 700,
            "processKey": "P01-0-0",
            "agreedSeconds": 700,
            "proposedSeconds": 700,
            "requestedSeconds": 700,
            "agreedPerPieceSeconds": 700
          },
          {
            "name": "심지 부착",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 650,
            "processKey": "P02-1-1",
            "agreedSeconds": 650,
            "proposedSeconds": 650,
            "requestedSeconds": 650,
            "agreedPerPieceSeconds": 650
          },
          {
            "name": "앞판 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 650,
            "processKey": "P03-2-2",
            "agreedSeconds": 650,
            "proposedSeconds": 650,
            "requestedSeconds": 650,
            "agreedPerPieceSeconds": 650
          },
          {
            "name": "뒷판 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 600,
            "processKey": "P04-3-3",
            "agreedSeconds": 600,
            "proposedSeconds": 600,
            "requestedSeconds": 600,
            "agreedPerPieceSeconds": 600
          },
          {
            "name": "소매 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 600,
            "processKey": "P05-4-4",
            "agreedSeconds": 600,
            "proposedSeconds": 600,
            "requestedSeconds": 600,
            "agreedPerPieceSeconds": 600
          },
          {
            "name": "칼라 부착",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 600,
            "processKey": "P06-5-5",
            "agreedSeconds": 600,
            "proposedSeconds": 600,
            "requestedSeconds": 600,
            "agreedPerPieceSeconds": 600
          },
          {
            "name": "지퍼/단추 가공",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 600,
            "processKey": "P07-6-6",
            "agreedSeconds": 600,
            "proposedSeconds": 600,
            "requestedSeconds": 600,
            "agreedPerPieceSeconds": 600
          },
          {
            "name": "안감 부착",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 550,
            "processKey": "P08-7-7",
            "agreedSeconds": 550,
            "proposedSeconds": 550,
            "requestedSeconds": 550,
            "agreedPerPieceSeconds": 550
          },
          {
            "name": "다림질 및 형태 정리",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 550,
            "processKey": "P09-8-8",
            "agreedSeconds": 550,
            "proposedSeconds": 550,
            "requestedSeconds": 550,
            "agreedPerPieceSeconds": 550
          },
          {
            "name": "검사 및 포장",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 500,
            "processKey": "P10-9-9",
            "agreedSeconds": 500,
            "proposedSeconds": 500,
            "requestedSeconds": 500,
            "agreedPerPieceSeconds": 500
          }
        ],
        "sourceAssignmentId": "A-ORD-2025FW-001::S-2025FW-J003::LT-BLUE::M-1-23",
        "totalAgreedSeconds": 2820000,
        "totalStPerPieceSeconds": 6000,
        "totalAgreedPerPieceSeconds": 6000,
        "totalRequestedPerPieceSeconds": 6000
      }
    },
    {
      "cardId": "ORD-2025FW-001::S-2025FW-J003::LT-BLUE::W",
      "lineKey": "LINE_2",
      "ctAgreedSnapshot": {
        "lineId": "2",
        "agreedAt": "2026-03-05T10:21:13.029Z",
        "agreedBy": "라인2 작업자01",
        "quantity": 380,
        "schedule": {
          "endIndex": 29,
          "endDateKey": "2026-03-30",
          "startIndex": 24,
          "startDateKey": "2026-03-25",
          "endDayPercent": 20.83333333333334,
          "startDayPercent": 75,
          "startDayOffsetPercent": 25
        },
        "processes": [
          {
            "name": "원단 재단",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 700,
            "processKey": "P01-0-0",
            "agreedSeconds": 700,
            "proposedSeconds": 700,
            "requestedSeconds": 700,
            "agreedPerPieceSeconds": 700
          },
          {
            "name": "심지 부착",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 650,
            "processKey": "P02-1-1",
            "agreedSeconds": 650,
            "proposedSeconds": 650,
            "requestedSeconds": 650,
            "agreedPerPieceSeconds": 650
          },
          {
            "name": "앞판 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 650,
            "processKey": "P03-2-2",
            "agreedSeconds": 650,
            "proposedSeconds": 650,
            "requestedSeconds": 650,
            "agreedPerPieceSeconds": 650
          },
          {
            "name": "뒷판 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 600,
            "processKey": "P04-3-3",
            "agreedSeconds": 600,
            "proposedSeconds": 600,
            "requestedSeconds": 600,
            "agreedPerPieceSeconds": 600
          },
          {
            "name": "소매 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 600,
            "processKey": "P05-4-4",
            "agreedSeconds": 600,
            "proposedSeconds": 600,
            "requestedSeconds": 600,
            "agreedPerPieceSeconds": 600
          },
          {
            "name": "칼라 부착",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 600,
            "processKey": "P06-5-5",
            "agreedSeconds": 600,
            "proposedSeconds": 600,
            "requestedSeconds": 600,
            "agreedPerPieceSeconds": 600
          },
          {
            "name": "지퍼/단추 가공",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 600,
            "processKey": "P07-6-6",
            "agreedSeconds": 600,
            "proposedSeconds": 600,
            "requestedSeconds": 600,
            "agreedPerPieceSeconds": 600
          },
          {
            "name": "안감 부착",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 550,
            "processKey": "P08-7-7",
            "agreedSeconds": 550,
            "proposedSeconds": 550,
            "requestedSeconds": 550,
            "agreedPerPieceSeconds": 550
          },
          {
            "name": "다림질 및 형태 정리",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 550,
            "processKey": "P09-8-8",
            "agreedSeconds": 550,
            "proposedSeconds": 550,
            "requestedSeconds": 550,
            "agreedPerPieceSeconds": 550
          },
          {
            "name": "검사 및 포장",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 500,
            "processKey": "P10-9-9",
            "agreedSeconds": 500,
            "proposedSeconds": 500,
            "requestedSeconds": 500,
            "agreedPerPieceSeconds": 500
          }
        ],
        "sourceAssignmentId": "A-ORD-2025FW-001::S-2025FW-J003::LT-BLUE::W-2-24",
        "totalAgreedSeconds": 2280000,
        "totalStPerPieceSeconds": 6000,
        "totalAgreedPerPieceSeconds": 6000,
        "totalRequestedPerPieceSeconds": 6000
      }
    },
    {
      "cardId": "ORD-2025FW-001::S-2025FW-J003::MID-BLUE::M",
      "lineKey": "LINE_1",
      "ctAgreedSnapshot": {
        "lineId": "1",
        "agreedAt": "2026-03-03T08:45:24.033Z",
        "agreedBy": "OPERATOR",
        "quantity": 470,
        "schedule": {
          "endIndex": 10,
          "endDateKey": "2026-03-11",
          "startIndex": 4,
          "startDateKey": "2026-03-05",
          "endDayPercent": 86.11111111111111,
          "startDayPercent": 3.472222222222202,
          "startDayOffsetPercent": 96.5277777777778
        },
        "processes": [
          {
            "name": "원단 재단",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 700,
            "processKey": "P01-0-0",
            "agreedSeconds": 700,
            "proposedSeconds": 700,
            "requestedSeconds": 700,
            "agreedPerPieceSeconds": 700
          },
          {
            "name": "심지 부착",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 650,
            "processKey": "P02-1-1",
            "agreedSeconds": 650,
            "proposedSeconds": 650,
            "requestedSeconds": 650,
            "agreedPerPieceSeconds": 650
          },
          {
            "name": "앞판 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 650,
            "processKey": "P03-2-2",
            "agreedSeconds": 700,
            "proposedSeconds": 650,
            "requestedSeconds": 700,
            "agreedPerPieceSeconds": 700
          },
          {
            "name": "뒷판 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 600,
            "processKey": "P04-3-3",
            "agreedSeconds": 600,
            "proposedSeconds": 600,
            "requestedSeconds": 600,
            "agreedPerPieceSeconds": 600
          },
          {
            "name": "소매 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 600,
            "processKey": "P05-4-4",
            "agreedSeconds": 600,
            "proposedSeconds": 600,
            "requestedSeconds": 600,
            "agreedPerPieceSeconds": 600
          },
          {
            "name": "칼라 부착",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 600,
            "processKey": "P06-5-5",
            "agreedSeconds": 600,
            "proposedSeconds": 600,
            "requestedSeconds": 600,
            "agreedPerPieceSeconds": 600
          },
          {
            "name": "지퍼/단추 가공",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 600,
            "processKey": "P07-6-6",
            "agreedSeconds": 600,
            "proposedSeconds": 600,
            "requestedSeconds": 600,
            "agreedPerPieceSeconds": 600
          },
          {
            "name": "안감 부착",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 550,
            "processKey": "P08-7-7",
            "agreedSeconds": 550,
            "proposedSeconds": 550,
            "requestedSeconds": 550,
            "agreedPerPieceSeconds": 550
          },
          {
            "name": "다림질 및 형태 정리",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 550,
            "processKey": "P09-8-8",
            "agreedSeconds": 550,
            "proposedSeconds": 550,
            "requestedSeconds": 550,
            "agreedPerPieceSeconds": 550
          },
          {
            "name": "검사 및 포장",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 500,
            "processKey": "P10-9-9",
            "agreedSeconds": 500,
            "proposedSeconds": 500,
            "requestedSeconds": 500,
            "agreedPerPieceSeconds": 500
          }
        ],
        "sourceAssignmentId": "A-ORD-2025FW-001::S-2025FW-J003::MID-BLUE::M-1-5",
        "totalAgreedSeconds": 2843500,
        "totalStPerPieceSeconds": 6000,
        "totalAgreedPerPieceSeconds": 6050
      }
    },
    {
      "cardId": "ORD-2025FW-001::S-2025FW-J003::MID-BLUE::W",
      "lineKey": "LINE_2",
      "ctAgreedSnapshot": {
        "lineId": "2",
        "agreedAt": "2026-03-05T10:21:20.053Z",
        "agreedBy": "라인2 작업자01",
        "quantity": 380,
        "schedule": {
          "endIndex": 33,
          "endDateKey": "2026-04-03",
          "startIndex": 29,
          "startDateKey": "2026-03-30",
          "endDayPercent": 16.66666666666666,
          "startDayPercent": 79.16666666666666,
          "startDayOffsetPercent": 20.83333333333334
        },
        "processes": [
          {
            "name": "원단 재단",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 700,
            "processKey": "P01-0-0",
            "agreedSeconds": 700,
            "proposedSeconds": 700,
            "requestedSeconds": 700,
            "agreedPerPieceSeconds": 700
          },
          {
            "name": "심지 부착",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 650,
            "processKey": "P02-1-1",
            "agreedSeconds": 650,
            "proposedSeconds": 650,
            "requestedSeconds": 650,
            "agreedPerPieceSeconds": 650
          },
          {
            "name": "앞판 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 650,
            "processKey": "P03-2-2",
            "agreedSeconds": 650,
            "proposedSeconds": 650,
            "requestedSeconds": 650,
            "agreedPerPieceSeconds": 650
          },
          {
            "name": "뒷판 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 600,
            "processKey": "P04-3-3",
            "agreedSeconds": 600,
            "proposedSeconds": 600,
            "requestedSeconds": 600,
            "agreedPerPieceSeconds": 600
          },
          {
            "name": "소매 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 600,
            "processKey": "P05-4-4",
            "agreedSeconds": 600,
            "proposedSeconds": 600,
            "requestedSeconds": 600,
            "agreedPerPieceSeconds": 600
          },
          {
            "name": "칼라 부착",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 600,
            "processKey": "P06-5-5",
            "agreedSeconds": 600,
            "proposedSeconds": 600,
            "requestedSeconds": 600,
            "agreedPerPieceSeconds": 600
          },
          {
            "name": "지퍼/단추 가공",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 600,
            "processKey": "P07-6-6",
            "agreedSeconds": 600,
            "proposedSeconds": 600,
            "requestedSeconds": 600,
            "agreedPerPieceSeconds": 600
          },
          {
            "name": "안감 부착",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 550,
            "processKey": "P08-7-7",
            "agreedSeconds": 550,
            "proposedSeconds": 550,
            "requestedSeconds": 550,
            "agreedPerPieceSeconds": 550
          },
          {
            "name": "다림질 및 형태 정리",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 550,
            "processKey": "P09-8-8",
            "agreedSeconds": 550,
            "proposedSeconds": 550,
            "requestedSeconds": 550,
            "agreedPerPieceSeconds": 550
          },
          {
            "name": "검사 및 포장",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 500,
            "processKey": "P10-9-9",
            "agreedSeconds": 500,
            "proposedSeconds": 500,
            "requestedSeconds": 500,
            "agreedPerPieceSeconds": 500
          }
        ],
        "sourceAssignmentId": "A-ORD-2025FW-001::S-2025FW-J003::MID-BLUE::W-2-28",
        "totalAgreedSeconds": 2280000,
        "totalStPerPieceSeconds": 6000,
        "totalAgreedPerPieceSeconds": 6000,
        "totalRequestedPerPieceSeconds": 6000
      }
    },
    {
      "cardId": "ORD-2025FW-001::S-2025FW-J003::INDIGO::M",
      "lineKey": "LINE_1",
      "ctAgreedSnapshot": {
        "lineId": "1",
        "agreedAt": "2026-03-05T10:19:47.950Z",
        "agreedBy": "라인1 작업자01",
        "quantity": 440,
        "schedule": {
          "endIndex": 34,
          "endDateKey": "2026-04-04",
          "startIndex": 29,
          "startDateKey": "2026-03-30",
          "endDayPercent": 38.19444444444444,
          "startDayPercent": 20.13888888888889,
          "startDayOffsetPercent": 79.86111111111111
        },
        "processes": [
          {
            "name": "원단 재단",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 700,
            "processKey": "P01-0-0",
            "agreedSeconds": 700,
            "proposedSeconds": 700,
            "requestedSeconds": 700,
            "agreedPerPieceSeconds": 700
          },
          {
            "name": "심지 부착",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 650,
            "processKey": "P02-1-1",
            "agreedSeconds": 650,
            "proposedSeconds": 650,
            "requestedSeconds": 650,
            "agreedPerPieceSeconds": 650
          },
          {
            "name": "앞판 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 650,
            "processKey": "P03-2-2",
            "agreedSeconds": 650,
            "proposedSeconds": 650,
            "requestedSeconds": 650,
            "agreedPerPieceSeconds": 650
          },
          {
            "name": "뒷판 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 600,
            "processKey": "P04-3-3",
            "agreedSeconds": 600,
            "proposedSeconds": 600,
            "requestedSeconds": 600,
            "agreedPerPieceSeconds": 600
          },
          {
            "name": "소매 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 600,
            "processKey": "P05-4-4",
            "agreedSeconds": 600,
            "proposedSeconds": 600,
            "requestedSeconds": 600,
            "agreedPerPieceSeconds": 600
          },
          {
            "name": "칼라 부착",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 600,
            "processKey": "P06-5-5",
            "agreedSeconds": 600,
            "proposedSeconds": 600,
            "requestedSeconds": 600,
            "agreedPerPieceSeconds": 600
          },
          {
            "name": "지퍼/단추 가공",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 600,
            "processKey": "P07-6-6",
            "agreedSeconds": 600,
            "proposedSeconds": 600,
            "requestedSeconds": 600,
            "agreedPerPieceSeconds": 600
          },
          {
            "name": "안감 부착",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 550,
            "processKey": "P08-7-7",
            "agreedSeconds": 550,
            "proposedSeconds": 550,
            "requestedSeconds": 550,
            "agreedPerPieceSeconds": 550
          },
          {
            "name": "다림질 및 형태 정리",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 550,
            "processKey": "P09-8-8",
            "agreedSeconds": 550,
            "proposedSeconds": 550,
            "requestedSeconds": 550,
            "agreedPerPieceSeconds": 550
          },
          {
            "name": "검사 및 포장",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 500,
            "processKey": "P10-9-9",
            "agreedSeconds": 500,
            "proposedSeconds": 500,
            "requestedSeconds": 500,
            "agreedPerPieceSeconds": 500
          }
        ],
        "sourceAssignmentId": "A-ORD-2025FW-001::S-2025FW-J003::INDIGO::M-1-30",
        "totalAgreedSeconds": 2640000,
        "totalStPerPieceSeconds": 6000,
        "totalAgreedPerPieceSeconds": 6000,
        "totalRequestedPerPieceSeconds": 6000
      }
    },
    {
      "cardId": "ORD-2025FW-001::S-2025FW-J003::INDIGO::W",
      "lineKey": "LINE_2",
      "ctAgreedSnapshot": {
        "lineId": "2",
        "agreedAt": "2026-03-03T09:09:50.359Z",
        "agreedBy": "라인2 작업자01",
        "quantity": 360,
        "schedule": {
          "endIndex": 9,
          "endDateKey": "2026-03-10",
          "startIndex": 5,
          "startDateKey": "2026-03-06",
          "endDayPercent": 85.41666666666666,
          "startDayPercent": 89.58333333333334,
          "startDayOffsetPercent": 10.41666666666667
        },
        "processes": [
          {
            "name": "원단 재단",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 700,
            "processKey": "P01-0-0",
            "agreedSeconds": 700,
            "proposedSeconds": 700,
            "requestedSeconds": 700,
            "agreedPerPieceSeconds": 700
          },
          {
            "name": "심지 부착",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 650,
            "processKey": "P02-1-1",
            "agreedSeconds": 650,
            "proposedSeconds": 650,
            "requestedSeconds": 650,
            "agreedPerPieceSeconds": 650
          },
          {
            "name": "앞판 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 650,
            "processKey": "P03-2-2",
            "agreedSeconds": 650,
            "proposedSeconds": 650,
            "requestedSeconds": 650,
            "agreedPerPieceSeconds": 650
          },
          {
            "name": "뒷판 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 600,
            "processKey": "P04-3-3",
            "agreedSeconds": 600,
            "proposedSeconds": 600,
            "requestedSeconds": 600,
            "agreedPerPieceSeconds": 600
          },
          {
            "name": "소매 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 600,
            "processKey": "P05-4-4",
            "agreedSeconds": 600,
            "proposedSeconds": 600,
            "requestedSeconds": 600,
            "agreedPerPieceSeconds": 600
          },
          {
            "name": "칼라 부착",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 600,
            "processKey": "P06-5-5",
            "agreedSeconds": 600,
            "proposedSeconds": 600,
            "requestedSeconds": 600,
            "agreedPerPieceSeconds": 600
          },
          {
            "name": "지퍼/단추 가공",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 600,
            "processKey": "P07-6-6",
            "agreedSeconds": 600,
            "proposedSeconds": 600,
            "requestedSeconds": 600,
            "agreedPerPieceSeconds": 600
          },
          {
            "name": "안감 부착",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 550,
            "processKey": "P08-7-7",
            "agreedSeconds": 550,
            "proposedSeconds": 550,
            "requestedSeconds": 550,
            "agreedPerPieceSeconds": 550
          },
          {
            "name": "다림질 및 형태 정리",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 550,
            "processKey": "P09-8-8",
            "agreedSeconds": 550,
            "proposedSeconds": 550,
            "requestedSeconds": 550,
            "agreedPerPieceSeconds": 550
          },
          {
            "name": "검사 및 포장",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 500,
            "processKey": "P10-9-9",
            "agreedSeconds": 500,
            "proposedSeconds": 500,
            "requestedSeconds": 500,
            "agreedPerPieceSeconds": 500
          }
        ],
        "sourceAssignmentId": "A-ORD-2025FW-001::S-2025FW-J003::INDIGO::W-2-5",
        "totalAgreedSeconds": 2160000,
        "totalStPerPieceSeconds": 6000,
        "totalAgreedPerPieceSeconds": 6000,
        "totalRequestedPerPieceSeconds": 6000
      }
    },
    {
      "cardId": "ORD-2025SS-001::S-2025SS-T001::WHITE::M",
      "lineKey": "LINE_1",
      "ctAgreedSnapshot": {
        "lineId": "1",
        "agreedAt": "2026-03-05T10:19:06.461Z",
        "agreedBy": "라인1 작업자01",
        "quantity": 600,
        "schedule": {
          "endIndex": 15,
          "endDateKey": "2026-03-16",
          "startIndex": 10,
          "startDateKey": "2026-03-11",
          "endDayPercent": 50.69444444444444,
          "startDayPercent": 13.88888888888889,
          "startDayOffsetPercent": 86.11111111111111
        },
        "processes": [
          {
            "name": "원단 재단",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 500,
            "processKey": "P01-0-0",
            "agreedSeconds": 500,
            "proposedSeconds": 500,
            "requestedSeconds": 500,
            "agreedPerPieceSeconds": 500
          },
          {
            "name": "앞판 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 460,
            "processKey": "P02-1-1",
            "agreedSeconds": 460,
            "proposedSeconds": 460,
            "requestedSeconds": 460,
            "agreedPerPieceSeconds": 460
          },
          {
            "name": "뒷판 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 440,
            "processKey": "P03-2-2",
            "agreedSeconds": 440,
            "proposedSeconds": 440,
            "requestedSeconds": 440,
            "agreedPerPieceSeconds": 440
          },
          {
            "name": "소매 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 480,
            "processKey": "P04-3-3",
            "agreedSeconds": 480,
            "proposedSeconds": 480,
            "requestedSeconds": 480,
            "agreedPerPieceSeconds": 480
          },
          {
            "name": "넥밴드 부착",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 420,
            "processKey": "P05-4-4",
            "agreedSeconds": 420,
            "proposedSeconds": 420,
            "requestedSeconds": 420,
            "agreedPerPieceSeconds": 420
          },
          {
            "name": "옆솔기 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 400,
            "processKey": "P06-5-5",
            "agreedSeconds": 400,
            "proposedSeconds": 400,
            "requestedSeconds": 400,
            "agreedPerPieceSeconds": 400
          },
          {
            "name": "밑단 마감",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 400,
            "processKey": "P07-6-6",
            "agreedSeconds": 400,
            "proposedSeconds": 400,
            "requestedSeconds": 400,
            "agreedPerPieceSeconds": 400
          },
          {
            "name": "검사 및 포장",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 400,
            "processKey": "P08-7-7",
            "agreedSeconds": 400,
            "proposedSeconds": 400,
            "requestedSeconds": 400,
            "agreedPerPieceSeconds": 400
          }
        ],
        "sourceAssignmentId": "A-ORD-2025SS-001::S-2025SS-T001::WHITE::M-1-10",
        "totalAgreedSeconds": 2100000,
        "totalStPerPieceSeconds": 3500,
        "totalAgreedPerPieceSeconds": 3500,
        "totalRequestedPerPieceSeconds": 3500
      }
    },
    {
      "cardId": "ORD-2025SS-001::S-2025SS-T001::WHITE::W",
      "lineKey": "LINE_2",
      "ctAgreedSnapshot": {
        "lineId": "2",
        "agreedAt": "2026-03-03T09:09:42.630Z",
        "agreedBy": "라인2 작업자01",
        "quantity": 400,
        "schedule": {
          "endIndex": 5,
          "endDateKey": "2026-03-06",
          "startIndex": 2,
          "startDateKey": "2026-03-03",
          "endDayPercent": 10.41666666666667,
          "startDayPercent": 32.63888888888889,
          "startDayOffsetPercent": 67.36111111111111
        },
        "processes": [
          {
            "name": "원단 재단",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 500,
            "processKey": "P01-0-0",
            "agreedSeconds": 500,
            "proposedSeconds": 500,
            "requestedSeconds": 500,
            "agreedPerPieceSeconds": 500
          },
          {
            "name": "앞판 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 460,
            "processKey": "P02-1-1",
            "agreedSeconds": 460,
            "proposedSeconds": 460,
            "requestedSeconds": 460,
            "agreedPerPieceSeconds": 460
          },
          {
            "name": "뒷판 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 440,
            "processKey": "P03-2-2",
            "agreedSeconds": 440,
            "proposedSeconds": 440,
            "requestedSeconds": 440,
            "agreedPerPieceSeconds": 440
          },
          {
            "name": "소매 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 480,
            "processKey": "P04-3-3",
            "agreedSeconds": 480,
            "proposedSeconds": 480,
            "requestedSeconds": 480,
            "agreedPerPieceSeconds": 480
          },
          {
            "name": "넥밴드 부착",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 420,
            "processKey": "P05-4-4",
            "agreedSeconds": 420,
            "proposedSeconds": 420,
            "requestedSeconds": 420,
            "agreedPerPieceSeconds": 420
          },
          {
            "name": "옆솔기 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 400,
            "processKey": "P06-5-5",
            "agreedSeconds": 400,
            "proposedSeconds": 400,
            "requestedSeconds": 400,
            "agreedPerPieceSeconds": 400
          },
          {
            "name": "밑단 마감",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 400,
            "processKey": "P07-6-6",
            "agreedSeconds": 400,
            "proposedSeconds": 400,
            "requestedSeconds": 400,
            "agreedPerPieceSeconds": 400
          },
          {
            "name": "검사 및 포장",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 400,
            "processKey": "P08-7-7",
            "agreedSeconds": 400,
            "proposedSeconds": 400,
            "requestedSeconds": 400,
            "agreedPerPieceSeconds": 400
          }
        ],
        "sourceAssignmentId": "A-ORD-2025SS-001::S-2025SS-T001::WHITE::W-1-6",
        "totalAgreedSeconds": 1400000,
        "totalStPerPieceSeconds": 3500,
        "totalAgreedPerPieceSeconds": 3500,
        "totalRequestedPerPieceSeconds": 3500
      }
    },
    {
      "cardId": "ORD-2025SS-001::S-2025SS-T001::BLACK::M",
      "lineKey": "LINE_2",
      "ctAgreedSnapshot": {
        "lineId": "2",
        "agreedAt": "2026-03-05T10:20:50.253Z",
        "agreedBy": "라인2 작업자01",
        "quantity": 600,
        "schedule": {
          "endIndex": 16,
          "endDateKey": "2026-03-17",
          "startIndex": 12,
          "startDateKey": "2026-03-13",
          "endDayPercent": 93.05555555555556,
          "startDayPercent": 71.52777777777779,
          "startDayOffsetPercent": 28.47222222222222
        },
        "processes": [
          {
            "name": "원단 재단",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 500,
            "processKey": "P01-0-0",
            "agreedSeconds": 500,
            "proposedSeconds": 500,
            "requestedSeconds": 500,
            "agreedPerPieceSeconds": 500
          },
          {
            "name": "앞판 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 460,
            "processKey": "P02-1-1",
            "agreedSeconds": 460,
            "proposedSeconds": 460,
            "requestedSeconds": 460,
            "agreedPerPieceSeconds": 460
          },
          {
            "name": "뒷판 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 440,
            "processKey": "P03-2-2",
            "agreedSeconds": 440,
            "proposedSeconds": 440,
            "requestedSeconds": 440,
            "agreedPerPieceSeconds": 440
          },
          {
            "name": "소매 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 480,
            "processKey": "P04-3-3",
            "agreedSeconds": 480,
            "proposedSeconds": 480,
            "requestedSeconds": 480,
            "agreedPerPieceSeconds": 480
          },
          {
            "name": "넥밴드 부착",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 420,
            "processKey": "P05-4-4",
            "agreedSeconds": 420,
            "proposedSeconds": 420,
            "requestedSeconds": 420,
            "agreedPerPieceSeconds": 420
          },
          {
            "name": "옆솔기 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 400,
            "processKey": "P06-5-5",
            "agreedSeconds": 400,
            "proposedSeconds": 400,
            "requestedSeconds": 400,
            "agreedPerPieceSeconds": 400
          },
          {
            "name": "밑단 마감",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 400,
            "processKey": "P07-6-6",
            "agreedSeconds": 400,
            "proposedSeconds": 400,
            "requestedSeconds": 400,
            "agreedPerPieceSeconds": 400
          },
          {
            "name": "검사 및 포장",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 400,
            "processKey": "P08-7-7",
            "agreedSeconds": 400,
            "proposedSeconds": 400,
            "requestedSeconds": 400,
            "agreedPerPieceSeconds": 400
          }
        ],
        "sourceAssignmentId": "A-ORD-2025SS-001::S-2025SS-T001::BLACK::M-2-13",
        "totalAgreedSeconds": 2100000,
        "totalStPerPieceSeconds": 3500,
        "totalAgreedPerPieceSeconds": 3500,
        "totalRequestedPerPieceSeconds": 3500
      }
    },
    {
      "cardId": "ORD-2025SS-001::S-2025SS-T001::BLACK::W",
      "lineKey": "LINE_1",
      "ctAgreedSnapshot": {
        "lineId": "1",
        "agreedAt": "2026-03-05T10:19:14.557Z",
        "agreedBy": "라인1 작업자01",
        "quantity": 400,
        "schedule": {
          "endIndex": 17,
          "endDateKey": "2026-03-18",
          "startIndex": 15,
          "startDateKey": "2026-03-16",
          "endDayPercent": 93.75,
          "startDayPercent": 49.30555555555556,
          "startDayOffsetPercent": 50.69444444444444
        },
        "processes": [
          {
            "name": "원단 재단",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 500,
            "processKey": "P01-0-0",
            "agreedSeconds": 500,
            "proposedSeconds": 500,
            "requestedSeconds": 500,
            "agreedPerPieceSeconds": 500
          },
          {
            "name": "앞판 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 460,
            "processKey": "P02-1-1",
            "agreedSeconds": 460,
            "proposedSeconds": 460,
            "requestedSeconds": 460,
            "agreedPerPieceSeconds": 460
          },
          {
            "name": "뒷판 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 440,
            "processKey": "P03-2-2",
            "agreedSeconds": 480,
            "proposedSeconds": 480,
            "requestedSeconds": 480,
            "agreedPerPieceSeconds": 480
          },
          {
            "name": "소매 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 480,
            "processKey": "P04-3-3",
            "agreedSeconds": 480,
            "proposedSeconds": 480,
            "requestedSeconds": 480,
            "agreedPerPieceSeconds": 480
          },
          {
            "name": "넥밴드 부착",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 420,
            "processKey": "P05-4-4",
            "agreedSeconds": 420,
            "proposedSeconds": 420,
            "requestedSeconds": 420,
            "agreedPerPieceSeconds": 420
          },
          {
            "name": "옆솔기 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 400,
            "processKey": "P06-5-5",
            "agreedSeconds": 400,
            "proposedSeconds": 400,
            "requestedSeconds": 400,
            "agreedPerPieceSeconds": 400
          },
          {
            "name": "밑단 마감",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 400,
            "processKey": "P07-6-6",
            "agreedSeconds": 400,
            "proposedSeconds": 400,
            "requestedSeconds": 400,
            "agreedPerPieceSeconds": 400
          },
          {
            "name": "검사 및 포장",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 400,
            "processKey": "P08-7-7",
            "agreedSeconds": 400,
            "proposedSeconds": 400,
            "requestedSeconds": 400,
            "agreedPerPieceSeconds": 400
          }
        ],
        "sourceAssignmentId": "A-ORD-2025SS-001::S-2025SS-T001::BLACK::W-1-14",
        "totalAgreedSeconds": 1416000,
        "totalStPerPieceSeconds": 3500,
        "totalAgreedPerPieceSeconds": 3540,
        "totalRequestedPerPieceSeconds": 3540
      }
    },
    {
      "cardId": "ORD-2025SS-001::S-2025SS-T001::NAVY::M",
      "lineKey": "LINE_2",
      "ctAgreedSnapshot": {
        "lineId": "2",
        "agreedAt": "2026-03-05T10:20:58.051Z",
        "agreedBy": "라인2 작업자01",
        "quantity": 600,
        "schedule": {
          "endIndex": 20,
          "endDateKey": "2026-03-21",
          "startIndex": 16,
          "startDateKey": "2026-03-17",
          "endDayPercent": 57.63888888888889,
          "startDayPercent": 6.944444444444445,
          "startDayOffsetPercent": 93.05555555555556
        },
        "processes": [
          {
            "name": "원단 재단",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 500,
            "processKey": "P01-0-0",
            "agreedSeconds": 500,
            "proposedSeconds": 500,
            "requestedSeconds": 500,
            "agreedPerPieceSeconds": 500
          },
          {
            "name": "앞판 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 460,
            "processKey": "P02-1-1",
            "agreedSeconds": 460,
            "proposedSeconds": 460,
            "requestedSeconds": 460,
            "agreedPerPieceSeconds": 460
          },
          {
            "name": "뒷판 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 440,
            "processKey": "P03-2-2",
            "agreedSeconds": 440,
            "proposedSeconds": 440,
            "requestedSeconds": 440,
            "agreedPerPieceSeconds": 440
          },
          {
            "name": "소매 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 480,
            "processKey": "P04-3-3",
            "agreedSeconds": 480,
            "proposedSeconds": 480,
            "requestedSeconds": 480,
            "agreedPerPieceSeconds": 480
          },
          {
            "name": "넥밴드 부착",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 420,
            "processKey": "P05-4-4",
            "agreedSeconds": 420,
            "proposedSeconds": 420,
            "requestedSeconds": 420,
            "agreedPerPieceSeconds": 420
          },
          {
            "name": "옆솔기 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 400,
            "processKey": "P06-5-5",
            "agreedSeconds": 400,
            "proposedSeconds": 400,
            "requestedSeconds": 400,
            "agreedPerPieceSeconds": 400
          },
          {
            "name": "밑단 마감",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 400,
            "processKey": "P07-6-6",
            "agreedSeconds": 400,
            "proposedSeconds": 400,
            "requestedSeconds": 400,
            "agreedPerPieceSeconds": 400
          },
          {
            "name": "검사 및 포장",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 400,
            "processKey": "P08-7-7",
            "agreedSeconds": 400,
            "proposedSeconds": 400,
            "requestedSeconds": 400,
            "agreedPerPieceSeconds": 400
          }
        ],
        "sourceAssignmentId": "A-ORD-2025SS-001::S-2025SS-T001::NAVY::M-2-16",
        "totalAgreedSeconds": 2100000,
        "totalStPerPieceSeconds": 3500,
        "totalAgreedPerPieceSeconds": 3500,
        "totalRequestedPerPieceSeconds": 3500
      }
    },
    {
      "cardId": "ORD-2025SS-001::S-2025SS-T001::NAVY::W",
      "lineKey": "LINE_2",
      "ctAgreedSnapshot": {
        "lineId": "2",
        "agreedAt": "2026-03-03T09:09:57.142Z",
        "agreedBy": "라인2 작업자01",
        "quantity": 400,
        "schedule": {
          "endIndex": 12,
          "endDateKey": "2026-03-13",
          "startIndex": 9,
          "startDateKey": "2026-03-10",
          "endDayPercent": 28.47222222222222,
          "startDayPercent": 14.58333333333334,
          "startDayOffsetPercent": 85.41666666666666
        },
        "processes": [
          {
            "name": "원단 재단",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 500,
            "processKey": "P01-0-0",
            "agreedSeconds": 500,
            "proposedSeconds": 500,
            "requestedSeconds": 500,
            "agreedPerPieceSeconds": 500
          },
          {
            "name": "앞판 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 460,
            "processKey": "P02-1-1",
            "agreedSeconds": 460,
            "proposedSeconds": 460,
            "requestedSeconds": 460,
            "agreedPerPieceSeconds": 460
          },
          {
            "name": "뒷판 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 440,
            "processKey": "P03-2-2",
            "agreedSeconds": 440,
            "proposedSeconds": 440,
            "requestedSeconds": 440,
            "agreedPerPieceSeconds": 440
          },
          {
            "name": "소매 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 480,
            "processKey": "P04-3-3",
            "agreedSeconds": 480,
            "proposedSeconds": 480,
            "requestedSeconds": 480,
            "agreedPerPieceSeconds": 480
          },
          {
            "name": "넥밴드 부착",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 420,
            "processKey": "P05-4-4",
            "agreedSeconds": 420,
            "proposedSeconds": 420,
            "requestedSeconds": 420,
            "agreedPerPieceSeconds": 420
          },
          {
            "name": "옆솔기 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 400,
            "processKey": "P06-5-5",
            "agreedSeconds": 400,
            "proposedSeconds": 400,
            "requestedSeconds": 400,
            "agreedPerPieceSeconds": 400
          },
          {
            "name": "밑단 마감",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 400,
            "processKey": "P07-6-6",
            "agreedSeconds": 400,
            "proposedSeconds": 400,
            "requestedSeconds": 400,
            "agreedPerPieceSeconds": 400
          },
          {
            "name": "검사 및 포장",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 400,
            "processKey": "P08-7-7",
            "agreedSeconds": 400,
            "proposedSeconds": 400,
            "requestedSeconds": 400,
            "agreedPerPieceSeconds": 400
          }
        ],
        "sourceAssignmentId": "A-ORD-2025SS-001::S-2025SS-T001::NAVY::W-2-9",
        "totalAgreedSeconds": 1400000,
        "totalStPerPieceSeconds": 3500,
        "totalAgreedPerPieceSeconds": 3500,
        "totalRequestedPerPieceSeconds": 3500
      }
    },
    {
      "cardId": "ORD-2025SS-001::S-2025SS-P002::WHITE::M",
      "lineKey": "LINE_1",
      "ctAgreedSnapshot": {
        "lineId": "1",
        "agreedAt": "2026-03-05T10:19:21.862Z",
        "agreedBy": "라인1 작업자01",
        "quantity": 650,
        "schedule": {
          "endIndex": 23,
          "endDateKey": "2026-03-24",
          "startIndex": 17,
          "startDateKey": "2026-03-18",
          "endDayPercent": 90.27777777777779,
          "startDayPercent": 6.25,
          "startDayOffsetPercent": 93.75
        },
        "processes": [
          {
            "name": "원단 재단",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 550,
            "processKey": "P01-0-0",
            "agreedSeconds": 550,
            "proposedSeconds": 550,
            "requestedSeconds": 550,
            "agreedPerPieceSeconds": 550
          },
          {
            "name": "앞판 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 500,
            "processKey": "P02-1-1",
            "agreedSeconds": 500,
            "proposedSeconds": 500,
            "requestedSeconds": 500,
            "agreedPerPieceSeconds": 500
          },
          {
            "name": "뒷판 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 500,
            "processKey": "P03-2-2",
            "agreedSeconds": 500,
            "proposedSeconds": 500,
            "requestedSeconds": 500,
            "agreedPerPieceSeconds": 500
          },
          {
            "name": "소매 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 480,
            "processKey": "P04-3-3",
            "agreedSeconds": 480,
            "proposedSeconds": 480,
            "requestedSeconds": 480,
            "agreedPerPieceSeconds": 480
          },
          {
            "name": "카라 제작",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 500,
            "processKey": "P05-4-4",
            "agreedSeconds": 500,
            "proposedSeconds": 500,
            "requestedSeconds": 500,
            "agreedPerPieceSeconds": 500
          },
          {
            "name": "카라 부착",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 490,
            "processKey": "P06-5-5",
            "agreedSeconds": 490,
            "proposedSeconds": 490,
            "requestedSeconds": 490,
            "agreedPerPieceSeconds": 490
          },
          {
            "name": "단추 가공",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 480,
            "processKey": "P07-6-6",
            "agreedSeconds": 480,
            "proposedSeconds": 480,
            "requestedSeconds": 480,
            "agreedPerPieceSeconds": 480
          },
          {
            "name": "밑단 마감",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 450,
            "processKey": "P08-7-7",
            "agreedSeconds": 450,
            "proposedSeconds": 450,
            "requestedSeconds": 450,
            "agreedPerPieceSeconds": 450
          },
          {
            "name": "검사 및 포장",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 450,
            "processKey": "P09-8-8",
            "agreedSeconds": 450,
            "proposedSeconds": 450,
            "requestedSeconds": 450,
            "agreedPerPieceSeconds": 450
          }
        ],
        "sourceAssignmentId": "A-ORD-2025SS-001::S-2025SS-P002::WHITE::M-1-17",
        "totalAgreedSeconds": 2860000,
        "totalStPerPieceSeconds": 4400,
        "totalAgreedPerPieceSeconds": 4400,
        "totalRequestedPerPieceSeconds": 4400
      }
    },
    {
      "cardId": "ORD-2025SS-001::S-2025SS-P002::WHITE::W",
      "lineKey": "LINE_2",
      "ctAgreedSnapshot": {
        "lineId": "2",
        "agreedAt": "2026-03-05T10:21:05.725Z",
        "agreedBy": "라인2 작업자01",
        "quantity": 350,
        "schedule": {
          "endIndex": 24,
          "endDateKey": "2026-03-25",
          "startIndex": 20,
          "startDateKey": "2026-03-21",
          "endDayPercent": 25,
          "startDayPercent": 42.36111111111111,
          "startDayOffsetPercent": 57.63888888888889
        },
        "processes": [
          {
            "name": "원단 재단",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 550,
            "processKey": "P01-0-0",
            "agreedSeconds": 550,
            "proposedSeconds": 550,
            "requestedSeconds": 550,
            "agreedPerPieceSeconds": 550
          },
          {
            "name": "앞판 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 500,
            "processKey": "P02-1-1",
            "agreedSeconds": 500,
            "proposedSeconds": 500,
            "requestedSeconds": 500,
            "agreedPerPieceSeconds": 500
          },
          {
            "name": "뒷판 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 500,
            "processKey": "P03-2-2",
            "agreedSeconds": 500,
            "proposedSeconds": 500,
            "requestedSeconds": 500,
            "agreedPerPieceSeconds": 500
          },
          {
            "name": "소매 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 480,
            "processKey": "P04-3-3",
            "agreedSeconds": 480,
            "proposedSeconds": 480,
            "requestedSeconds": 480,
            "agreedPerPieceSeconds": 480
          },
          {
            "name": "카라 제작",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 500,
            "processKey": "P05-4-4",
            "agreedSeconds": 500,
            "proposedSeconds": 500,
            "requestedSeconds": 500,
            "agreedPerPieceSeconds": 500
          },
          {
            "name": "카라 부착",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 490,
            "processKey": "P06-5-5",
            "agreedSeconds": 490,
            "proposedSeconds": 490,
            "requestedSeconds": 490,
            "agreedPerPieceSeconds": 490
          },
          {
            "name": "단추 가공",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 480,
            "processKey": "P07-6-6",
            "agreedSeconds": 480,
            "proposedSeconds": 480,
            "requestedSeconds": 480,
            "agreedPerPieceSeconds": 480
          },
          {
            "name": "밑단 마감",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 450,
            "processKey": "P08-7-7",
            "agreedSeconds": 450,
            "proposedSeconds": 450,
            "requestedSeconds": 450,
            "agreedPerPieceSeconds": 450
          },
          {
            "name": "검사 및 포장",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 450,
            "processKey": "P09-8-8",
            "agreedSeconds": 450,
            "proposedSeconds": 450,
            "requestedSeconds": 450,
            "agreedPerPieceSeconds": 450
          }
        ],
        "sourceAssignmentId": "A-ORD-2025SS-001::S-2025SS-P002::WHITE::W-2-19",
        "totalAgreedSeconds": 1540000,
        "totalStPerPieceSeconds": 4400,
        "totalAgreedPerPieceSeconds": 4400,
        "totalRequestedPerPieceSeconds": 4400
      }
    },
    {
      "cardId": "ORD-2025SS-001::S-2025SS-P002::GRAY-MEL::M",
      "lineKey": "LINE_1",
      "ctAgreedSnapshot": {
        "lineId": "1",
        "agreedAt": "2026-03-03T08:38:50.377Z",
        "agreedBy": "라인1 작업자01",
        "quantity": 650,
        "schedule": {
          "endIndex": 4,
          "endDateKey": "2026-03-05",
          "startIndex": -1,
          "startDateKey": "2026-02-28",
          "endDayPercent": 96.52777777777779,
          "startDayPercent": 100,
          "startDayOffsetPercent": 0
        },
        "processes": [
          {
            "name": "원단 재단",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 550,
            "processKey": "P01-0-0",
            "agreedSeconds": 550,
            "proposedSeconds": 550,
            "requestedSeconds": 550,
            "agreedPerPieceSeconds": 550
          },
          {
            "name": "앞판 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 500,
            "processKey": "P02-1-1",
            "agreedSeconds": 500,
            "proposedSeconds": 500,
            "requestedSeconds": 500,
            "agreedPerPieceSeconds": 500
          },
          {
            "name": "뒷판 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 500,
            "processKey": "P03-2-2",
            "agreedSeconds": 500,
            "proposedSeconds": 500,
            "requestedSeconds": 500,
            "agreedPerPieceSeconds": 500
          },
          {
            "name": "소매 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 480,
            "processKey": "P04-3-3",
            "agreedSeconds": 480,
            "proposedSeconds": 480,
            "requestedSeconds": 480,
            "agreedPerPieceSeconds": 480
          },
          {
            "name": "카라 제작",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 500,
            "processKey": "P05-4-4",
            "agreedSeconds": 550,
            "proposedSeconds": 550,
            "requestedSeconds": 550,
            "agreedPerPieceSeconds": 550
          },
          {
            "name": "카라 부착",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 490,
            "processKey": "P06-5-5",
            "agreedSeconds": 490,
            "proposedSeconds": 490,
            "requestedSeconds": 490,
            "agreedPerPieceSeconds": 490
          },
          {
            "name": "단추 가공",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 480,
            "processKey": "P07-6-6",
            "agreedSeconds": 480,
            "proposedSeconds": 480,
            "requestedSeconds": 480,
            "agreedPerPieceSeconds": 480
          },
          {
            "name": "밑단 마감",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 450,
            "processKey": "P08-7-7",
            "agreedSeconds": 450,
            "proposedSeconds": 450,
            "requestedSeconds": 450,
            "agreedPerPieceSeconds": 450
          },
          {
            "name": "검사 및 포장",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 450,
            "processKey": "P09-8-8",
            "agreedSeconds": 450,
            "proposedSeconds": 450,
            "requestedSeconds": 450,
            "agreedPerPieceSeconds": 450
          }
        ],
        "sourceAssignmentId": "A-ORD-2025SS-001::S-2025SS-P002::GRAY-MEL::M-1-27",
        "totalAgreedSeconds": 2892500,
        "totalStPerPieceSeconds": 4400,
        "totalAgreedPerPieceSeconds": 4450,
        "totalRequestedPerPieceSeconds": 4450
      }
    },
    {
      "cardId": "ORD-2025SS-001::S-2025SS-P002::GRAY-MEL::W",
      "lineKey": "LINE_2",
      "ctAgreedSnapshot": {
        "lineId": "2",
        "agreedAt": "2026-03-03T09:08:40.248Z",
        "agreedBy": "라인2 작업자01",
        "quantity": 350,
        "schedule": {
          "endIndex": 2,
          "endDateKey": "2026-03-03",
          "startIndex": -1,
          "startDateKey": "2026-02-28",
          "endDayPercent": 67.36111111111111,
          "startDayPercent": 100,
          "startDayOffsetPercent": 0
        },
        "processes": [
          {
            "name": "원단 재단",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 550,
            "processKey": "P01-0-0",
            "agreedSeconds": 550,
            "proposedSeconds": 550,
            "requestedSeconds": 550,
            "agreedPerPieceSeconds": 550
          },
          {
            "name": "앞판 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 500,
            "processKey": "P02-1-1",
            "agreedSeconds": 500,
            "proposedSeconds": 500,
            "requestedSeconds": 500,
            "agreedPerPieceSeconds": 500
          },
          {
            "name": "뒷판 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 500,
            "processKey": "P03-2-2",
            "agreedSeconds": 500,
            "proposedSeconds": 500,
            "requestedSeconds": 500,
            "agreedPerPieceSeconds": 500
          },
          {
            "name": "소매 봉제",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 480,
            "processKey": "P04-3-3",
            "agreedSeconds": 480,
            "proposedSeconds": 480,
            "requestedSeconds": 480,
            "agreedPerPieceSeconds": 480
          },
          {
            "name": "카라 제작",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 500,
            "processKey": "P05-4-4",
            "agreedSeconds": 500,
            "proposedSeconds": 500,
            "requestedSeconds": 500,
            "agreedPerPieceSeconds": 500
          },
          {
            "name": "카라 부착",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 490,
            "processKey": "P06-5-5",
            "agreedSeconds": 490,
            "proposedSeconds": 490,
            "requestedSeconds": 490,
            "agreedPerPieceSeconds": 490
          },
          {
            "name": "단추 가공",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 480,
            "processKey": "P07-6-6",
            "agreedSeconds": 480,
            "proposedSeconds": 480,
            "requestedSeconds": 480,
            "agreedPerPieceSeconds": 480
          },
          {
            "name": "밑단 마감",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 450,
            "processKey": "P08-7-7",
            "agreedSeconds": 450,
            "proposedSeconds": 450,
            "requestedSeconds": 450,
            "agreedPerPieceSeconds": 450
          },
          {
            "name": "검사 및 포장",
            "basis": "ST",
            "quantity": 1,
            "stSeconds": 450,
            "processKey": "P09-8-8",
            "agreedSeconds": 450,
            "proposedSeconds": 450,
            "requestedSeconds": 450,
            "agreedPerPieceSeconds": 450
          }
        ],
        "sourceAssignmentId": "A-ORD-2025SS-001::S-2025SS-P002::GRAY-MEL::W-2-27",
        "totalAgreedSeconds": 1540000,
        "totalStPerPieceSeconds": 4400,
        "totalAgreedPerPieceSeconds": 4400,
        "totalRequestedPerPieceSeconds": 4400
      }
    }
  ],
  "assignments": [
    {
      "lineKey": "LINE_1",
      "id": "A-ORD-2025SS-001::S-2025SS-P002::GRAY-MEL::M-1-27",
      "basis": "ST",
      "color": "#DCE9FF",
      "label": "슬림핏 카라 폴로 셔츠",
      "cardId": "ORD-2025SS-001::S-2025SS-P002::GRAY-MEL::M",
      "ctNote": "제안 송부 2026-03-03T05:59:23.736Z",
      "gender": "M",
      "lineId": "1",
      "colorId": 293,
      "orderNo": "ORD-2025SS-001",
      "version": 6,
      "ctSentAt": null,
      "ctSource": "OPERATOR_PROPOSAL",
      "ctStatus": "AGREED",
      "customer": "테스트 발주자",
      "endIndex": 5,
      "imageUrl": "",
      "quantity": 650,
      "colorName": "그레이멜란지",
      "createdAt": "2026-03-02T08:57:54.358Z",
      "updatedAt": "2026-03-03T08:38:53.804Z",
      "ctAgreedAt": "2026-03-03T08:38:50.377Z",
      "ctAgreedBy": "라인1 작업자01",
      "ctOverride": false,
      "endDateKey": "2026-03-05",
      "previewUrl": "",
      "startIndex": 0,
      "completedAt": null,
      "isCompleted": false,
      "stripeColor": "#9FB9F2",
      "startDateKey": "2026-02-28",
      "thumbnailUrl": "",
      "totalSeconds": 2860000,
      "ctEscalatedAt": null,
      "endDayPercent": 96.52777777777779,
      "finalQuantity": null,
      "originOrderId": "ORD-2025SS-001::S-2025SS-P002::GRAY-MEL::M",
      "proposalBasis": "ST",
      "proposalSeconds": 2860000,
      "startDayPercent": 100,
      "versionUpdatedAt": "2026-03-05T10:17:14.922Z",
      "contractedSeconds": 2892500,
      "ctEscalationReason": null,
      "ctEscalationStatus": null,
      "startDayOffsetPercent": 0,
      "ctEscalationTargetRole": null
    },
    {
      "lineKey": "LINE_1",
      "id": "A-ORD-2025FW-001::S-2025FW-J003::MID-BLUE::M-1-5",
      "basis": "ST",
      "color": "#DCE9FF",
      "label": "오버핏 데님 재킷",
      "cardId": "ORD-2025FW-001::S-2025FW-J003::MID-BLUE::M",
      "ctNote": "요청 동의 2026-03-03T08:45:24.033Z",
      "gender": "M",
      "lineId": "1",
      "colorId": 295,
      "orderNo": "ORD-2025FW-001",
      "version": 7,
      "ctSentAt": null,
      "ctSource": "LINE_LEADER_PROPOSAL",
      "ctStatus": "AGREED",
      "customer": "테스트 발주자",
      "endIndex": 11,
      "imageUrl": "",
      "quantity": 470,
      "colorName": "미드블루",
      "createdAt": "2026-03-03T08:12:08.818Z",
      "updatedAt": "2026-03-03T08:45:27.187Z",
      "ctAgreedAt": "2026-03-03T08:45:24.033Z",
      "ctAgreedBy": "OPERATOR",
      "ctOverride": false,
      "endDateKey": "2026-03-11",
      "previewUrl": "",
      "startIndex": 5,
      "completedAt": null,
      "isCompleted": false,
      "stripeColor": "#9FB9F2",
      "startDateKey": "2026-03-05",
      "thumbnailUrl": "",
      "totalSeconds": 2820000,
      "ctEscalatedAt": null,
      "endDayPercent": 86.11111111111111,
      "finalQuantity": null,
      "originOrderId": "ORD-2025FW-001::S-2025FW-J003::MID-BLUE::M",
      "proposalBasis": "ST",
      "proposalSeconds": 2820000,
      "startDayPercent": 3.472222222222202,
      "versionUpdatedAt": "2026-03-05T10:17:14.922Z",
      "contractedSeconds": 2843500,
      "ctEscalationReason": null,
      "ctEscalationStatus": null,
      "startDayOffsetPercent": 96.5277777777778,
      "ctEscalationTargetRole": null
    },
    {
      "lineKey": "LINE_1",
      "id": "A-ORD-2025SS-001::S-2025SS-T001::WHITE::M-1-10",
      "basis": "ST",
      "color": "#DCE9FF",
      "label": "레귤러핏 라운드넥 티셔츠",
      "cardId": "ORD-2025SS-001::S-2025SS-T001::WHITE::M",
      "ctNote": "제안 송부 2026-03-05T10:17:23.573Z",
      "gender": "M",
      "lineId": "1",
      "colorId": 290,
      "orderNo": "ORD-2025SS-001",
      "version": 3,
      "ctSentAt": null,
      "ctSource": "OPERATOR_PROPOSAL",
      "ctStatus": "AGREED",
      "customer": "테스트 발주자",
      "endIndex": 15,
      "imageUrl": "",
      "quantity": 600,
      "colorName": "화이트",
      "createdAt": "2026-03-05T10:17:16.832Z",
      "updatedAt": "2026-03-05T10:17:26.707Z",
      "ctAgreedAt": "2026-03-05T10:19:06.461Z",
      "ctAgreedBy": "라인1 작업자01",
      "ctOverride": false,
      "endDateKey": "2026-03-16",
      "previewUrl": "",
      "startIndex": 10,
      "completedAt": null,
      "isCompleted": false,
      "stripeColor": "#9FB9F2",
      "startDateKey": "2026-03-11",
      "thumbnailUrl": "",
      "totalSeconds": 2100000,
      "ctEscalatedAt": null,
      "endDayPercent": 50.69444444444444,
      "finalQuantity": null,
      "originOrderId": "ORD-2025SS-001::S-2025SS-T001::WHITE::M",
      "proposalBasis": "ST",
      "proposalSeconds": 2100000,
      "startDayPercent": 13.88888888888889,
      "versionUpdatedAt": "2026-03-05T10:19:08.813Z",
      "contractedSeconds": 2100000,
      "ctEscalationReason": null,
      "ctEscalationStatus": null,
      "startDayOffsetPercent": 86.11111111111111,
      "ctEscalationTargetRole": null
    },
    {
      "lineKey": "LINE_1",
      "id": "A-ORD-2025SS-001::S-2025SS-T001::BLACK::W-1-14",
      "basis": "ST",
      "color": "#DCE9FF",
      "label": "레귤러핏 라운드넥 티셔츠",
      "cardId": "ORD-2025SS-001::S-2025SS-T001::BLACK::W",
      "ctNote": "제안 송부 2026-03-05T10:17:39.981Z",
      "gender": "W",
      "lineId": "1",
      "colorId": 291,
      "orderNo": "ORD-2025SS-001",
      "version": 4,
      "ctSentAt": null,
      "ctSource": "OPERATOR_PROPOSAL",
      "ctStatus": "AGREED",
      "customer": "테스트 발주자",
      "endIndex": 17,
      "imageUrl": "",
      "quantity": 400,
      "colorName": "블랙",
      "createdAt": "2026-03-05T10:17:16.832Z",
      "updatedAt": "2026-03-05T10:17:43.156Z",
      "ctAgreedAt": "2026-03-05T10:19:14.557Z",
      "ctAgreedBy": "라인1 작업자01",
      "ctOverride": false,
      "endDateKey": "2026-03-18",
      "previewUrl": "",
      "startIndex": 15,
      "completedAt": null,
      "isCompleted": false,
      "stripeColor": "#9FB9F2",
      "startDateKey": "2026-03-16",
      "thumbnailUrl": "",
      "totalSeconds": 1400000,
      "ctEscalatedAt": null,
      "endDayPercent": 93.75,
      "finalQuantity": null,
      "originOrderId": "ORD-2025SS-001::S-2025SS-T001::BLACK::W",
      "proposalBasis": "ST",
      "proposalSeconds": 1416000,
      "startDayPercent": 49.30555555555556,
      "versionUpdatedAt": "2026-03-05T10:19:16.916Z",
      "contractedSeconds": 1416000,
      "ctEscalationReason": null,
      "ctEscalationStatus": null,
      "startDayOffsetPercent": 50.69444444444444,
      "ctEscalationTargetRole": null
    },
    {
      "lineKey": "LINE_1",
      "id": "A-ORD-2025SS-001::S-2025SS-P002::WHITE::M-1-17",
      "basis": "ST",
      "color": "#DCE9FF",
      "label": "슬림핏 카라 폴로 셔츠",
      "cardId": "ORD-2025SS-001::S-2025SS-P002::WHITE::M",
      "ctNote": "제안 송부 2026-03-05T10:17:57.742Z",
      "gender": "M",
      "lineId": "1",
      "colorId": 290,
      "orderNo": "ORD-2025SS-001",
      "version": 4,
      "ctSentAt": null,
      "ctSource": "OPERATOR_PROPOSAL",
      "ctStatus": "AGREED",
      "customer": "테스트 발주자",
      "endIndex": 23,
      "imageUrl": "",
      "quantity": 650,
      "colorName": "화이트",
      "createdAt": "2026-03-05T10:17:16.832Z",
      "updatedAt": "2026-03-05T10:18:00.819Z",
      "ctAgreedAt": "2026-03-05T10:19:21.862Z",
      "ctAgreedBy": "라인1 작업자01",
      "ctOverride": false,
      "endDateKey": "2026-03-24",
      "previewUrl": "",
      "startIndex": 17,
      "completedAt": null,
      "isCompleted": false,
      "stripeColor": "#9FB9F2",
      "startDateKey": "2026-03-18",
      "thumbnailUrl": "",
      "totalSeconds": 2860000,
      "ctEscalatedAt": null,
      "endDayPercent": 90.27777777777779,
      "finalQuantity": null,
      "originOrderId": "ORD-2025SS-001::S-2025SS-P002::WHITE::M",
      "proposalBasis": "ST",
      "proposalSeconds": 2860000,
      "startDayPercent": 6.25,
      "versionUpdatedAt": "2026-03-05T10:19:24.210Z",
      "contractedSeconds": 2860000,
      "ctEscalationReason": null,
      "ctEscalationStatus": null,
      "startDayOffsetPercent": 93.75,
      "ctEscalationTargetRole": null
    },
    {
      "lineKey": "LINE_1",
      "id": "A-ORD-2025FW-001::S-2025FW-J003::LT-BLUE::M-1-23",
      "basis": "ST",
      "color": "#DCE9FF",
      "label": "오버핏 데님 재킷",
      "cardId": "ORD-2025FW-001::S-2025FW-J003::LT-BLUE::M",
      "ctNote": "제안 송부 2026-03-05T10:18:14.165Z",
      "gender": "M",
      "lineId": "1",
      "colorId": 294,
      "orderNo": "ORD-2025FW-001",
      "version": 4,
      "ctSentAt": null,
      "ctSource": "OPERATOR_PROPOSAL",
      "ctStatus": "AGREED",
      "customer": "테스트 발주자",
      "endIndex": 29,
      "imageUrl": "",
      "quantity": 470,
      "colorName": "라이트블루",
      "createdAt": "2026-03-05T10:17:16.832Z",
      "updatedAt": "2026-03-05T10:18:17.175Z",
      "ctAgreedAt": "2026-03-05T10:19:30.037Z",
      "ctAgreedBy": "라인1 작업자01",
      "ctOverride": false,
      "endDateKey": "2026-03-30",
      "previewUrl": "",
      "startIndex": 23,
      "completedAt": null,
      "isCompleted": false,
      "stripeColor": "#9FB9F2",
      "startDateKey": "2026-03-24",
      "thumbnailUrl": "",
      "totalSeconds": 2820000,
      "ctEscalatedAt": null,
      "endDayPercent": 79.86111111111111,
      "finalQuantity": null,
      "originOrderId": "ORD-2025FW-001::S-2025FW-J003::LT-BLUE::M",
      "proposalBasis": "ST",
      "proposalSeconds": 2820000,
      "startDayPercent": 9.722222222222213,
      "versionUpdatedAt": "2026-03-05T10:19:32.558Z",
      "contractedSeconds": 2820000,
      "ctEscalationReason": null,
      "ctEscalationStatus": null,
      "startDayOffsetPercent": 90.27777777777779,
      "ctEscalationTargetRole": null
    },
    {
      "lineKey": "LINE_1",
      "id": "A-ORD-2025FW-001::S-2025FW-J003::INDIGO::M-1-30",
      "basis": "ST",
      "color": "#DCE9FF",
      "label": "오버핏 데님 재킷",
      "cardId": "ORD-2025FW-001::S-2025FW-J003::INDIGO::M",
      "ctNote": "제안 송부 2026-03-05T10:18:34.813Z",
      "gender": "M",
      "lineId": "1",
      "colorId": 296,
      "orderNo": "ORD-2025FW-001",
      "version": 4,
      "ctSentAt": null,
      "ctSource": "OPERATOR_PROPOSAL",
      "ctStatus": "AGREED",
      "customer": "테스트 발주자",
      "endIndex": 34,
      "imageUrl": "",
      "quantity": 440,
      "colorName": "인디고",
      "createdAt": "2026-03-05T10:17:16.832Z",
      "updatedAt": "2026-03-05T10:18:37.790Z",
      "ctAgreedAt": "2026-03-05T10:19:47.950Z",
      "ctAgreedBy": "라인1 작업자01",
      "ctOverride": false,
      "endDateKey": "2026-04-04",
      "previewUrl": "",
      "startIndex": 29,
      "completedAt": null,
      "isCompleted": false,
      "stripeColor": "#9FB9F2",
      "startDateKey": "2026-03-30",
      "thumbnailUrl": "",
      "totalSeconds": 2640000,
      "ctEscalatedAt": null,
      "endDayPercent": 38.19444444444444,
      "finalQuantity": null,
      "originOrderId": "ORD-2025FW-001::S-2025FW-J003::INDIGO::M",
      "proposalBasis": "ST",
      "proposalSeconds": 2640000,
      "startDayPercent": 20.13888888888889,
      "versionUpdatedAt": "2026-03-05T10:19:50.574Z",
      "contractedSeconds": 2640000,
      "ctEscalationReason": null,
      "ctEscalationStatus": null,
      "startDayOffsetPercent": 79.86111111111111,
      "ctEscalationTargetRole": null
    },
    {
      "lineKey": "LINE_2",
      "id": "A-ORD-2025SS-001::S-2025SS-P002::GRAY-MEL::W-2-27",
      "basis": "ST",
      "color": "#DCE9FF",
      "label": "슬림핏 카라 폴로 셔츠",
      "cardId": "ORD-2025SS-001::S-2025SS-P002::GRAY-MEL::W",
      "ctNote": "제안 송부 2026-03-03T06:00:38.303Z",
      "gender": "W",
      "lineId": "2",
      "colorId": 293,
      "orderNo": "ORD-2025SS-001",
      "version": 11,
      "ctSentAt": null,
      "ctSource": "OPERATOR_PROPOSAL",
      "ctStatus": "AGREED",
      "customer": "테스트 발주자",
      "endIndex": 3,
      "imageUrl": "",
      "quantity": 350,
      "colorName": "그레이멜란지",
      "createdAt": "2026-03-02T08:34:30.994Z",
      "updatedAt": "2026-03-03T09:08:43.485Z",
      "ctAgreedAt": "2026-03-03T09:08:40.248Z",
      "ctAgreedBy": "라인2 작업자01",
      "ctOverride": false,
      "endDateKey": "2026-03-03",
      "previewUrl": "",
      "startIndex": 0,
      "completedAt": null,
      "isCompleted": false,
      "stripeColor": "#9FB9F2",
      "startDateKey": "2026-02-28",
      "thumbnailUrl": "",
      "totalSeconds": 1540000,
      "ctEscalatedAt": null,
      "endDayPercent": 67.36111111111111,
      "finalQuantity": null,
      "originOrderId": "ORD-2025SS-001::S-2025SS-P002::GRAY-MEL::W",
      "proposalBasis": "ST",
      "proposalSeconds": 1540000,
      "startDayPercent": 100,
      "versionUpdatedAt": "2026-03-05T10:17:14.922Z",
      "contractedSeconds": 1540000,
      "ctEscalationReason": null,
      "ctEscalationStatus": null,
      "startDayOffsetPercent": 0,
      "ctEscalationTargetRole": null
    },
    {
      "lineKey": "LINE_2",
      "id": "A-ORD-2025SS-001::S-2025SS-T001::WHITE::W-1-6",
      "basis": "ST",
      "color": "#DCE9FF",
      "label": "레귤러핏 라운드넥 티셔츠",
      "cardId": "ORD-2025SS-001::S-2025SS-T001::WHITE::W",
      "ctNote": "제안 송부 2026-03-03T08:11:44.675Z",
      "gender": "W",
      "lineId": "2",
      "colorId": 290,
      "orderNo": "ORD-2025SS-001",
      "version": 8,
      "ctSentAt": null,
      "ctSource": "OPERATOR_PROPOSAL",
      "ctStatus": "AGREED",
      "customer": "테스트 발주자",
      "endIndex": 6,
      "imageUrl": "",
      "quantity": 400,
      "colorName": "화이트",
      "createdAt": "2026-03-02T08:57:54.358Z",
      "updatedAt": "2026-03-03T09:09:46.007Z",
      "ctAgreedAt": "2026-03-03T09:09:42.630Z",
      "ctAgreedBy": "라인2 작업자01",
      "ctOverride": false,
      "endDateKey": "2026-03-06",
      "previewUrl": "",
      "startIndex": 3,
      "completedAt": null,
      "isCompleted": false,
      "stripeColor": "#9FB9F2",
      "startDateKey": "2026-03-03",
      "thumbnailUrl": "",
      "totalSeconds": 1400000,
      "ctEscalatedAt": null,
      "endDayPercent": 10.41666666666667,
      "finalQuantity": null,
      "originOrderId": "ORD-2025SS-001::S-2025SS-T001::WHITE::W",
      "proposalBasis": "ST",
      "proposalSeconds": 1400000,
      "startDayPercent": 32.63888888888889,
      "versionUpdatedAt": "2026-03-05T10:17:14.922Z",
      "contractedSeconds": 1400000,
      "ctEscalationReason": null,
      "ctEscalationStatus": null,
      "startDayOffsetPercent": 67.36111111111111,
      "ctEscalationTargetRole": null
    },
    {
      "lineKey": "LINE_2",
      "id": "A-ORD-2025FW-001::S-2025FW-J003::INDIGO::W-2-5",
      "basis": "ST",
      "color": "#DCE9FF",
      "label": "오버핏 데님 재킷",
      "cardId": "ORD-2025FW-001::S-2025FW-J003::INDIGO::W",
      "ctNote": "제안 송부 2026-03-03T08:31:04.962Z",
      "gender": "W",
      "lineId": "2",
      "colorId": 296,
      "orderNo": "ORD-2025FW-001",
      "version": 5,
      "ctSentAt": null,
      "ctSource": "OPERATOR_PROPOSAL",
      "ctStatus": "AGREED",
      "customer": "테스트 발주자",
      "endIndex": 10,
      "imageUrl": "",
      "quantity": 360,
      "colorName": "인디고",
      "createdAt": "2026-03-03T08:30:59.132Z",
      "updatedAt": "2026-03-03T09:09:53.496Z",
      "ctAgreedAt": "2026-03-03T09:09:50.359Z",
      "ctAgreedBy": "라인2 작업자01",
      "ctOverride": false,
      "endDateKey": "2026-03-10",
      "previewUrl": "",
      "startIndex": 6,
      "completedAt": null,
      "isCompleted": false,
      "stripeColor": "#9FB9F2",
      "startDateKey": "2026-03-06",
      "thumbnailUrl": "",
      "totalSeconds": 2160000,
      "ctEscalatedAt": null,
      "endDayPercent": 85.41666666666666,
      "finalQuantity": null,
      "originOrderId": "ORD-2025FW-001::S-2025FW-J003::INDIGO::W",
      "proposalBasis": "ST",
      "proposalSeconds": 2160000,
      "startDayPercent": 89.58333333333334,
      "versionUpdatedAt": "2026-03-05T10:17:14.922Z",
      "contractedSeconds": 2160000,
      "ctEscalationReason": null,
      "ctEscalationStatus": null,
      "startDayOffsetPercent": 10.41666666666667,
      "ctEscalationTargetRole": null
    },
    {
      "lineKey": "LINE_2",
      "id": "A-ORD-2025SS-001::S-2025SS-T001::NAVY::W-2-9",
      "basis": "ST",
      "color": "#DCE9FF",
      "label": "레귤러핏 라운드넥 티셔츠",
      "cardId": "ORD-2025SS-001::S-2025SS-T001::NAVY::W",
      "ctNote": "제안 송부 2026-03-03T08:45:33.113Z",
      "gender": "W",
      "lineId": "2",
      "colorId": 292,
      "orderNo": "ORD-2025SS-001",
      "version": 6,
      "ctSentAt": null,
      "ctSource": "OPERATOR_PROPOSAL",
      "ctStatus": "AGREED",
      "customer": "테스트 발주자",
      "endIndex": 13,
      "imageUrl": "",
      "quantity": 400,
      "colorName": "네이비",
      "createdAt": "2026-03-03T08:31:22.717Z",
      "updatedAt": "2026-03-03T09:10:00.466Z",
      "ctAgreedAt": "2026-03-03T09:09:57.142Z",
      "ctAgreedBy": "라인2 작업자01",
      "ctOverride": false,
      "endDateKey": "2026-03-13",
      "previewUrl": "",
      "startIndex": 10,
      "completedAt": null,
      "isCompleted": false,
      "stripeColor": "#9FB9F2",
      "startDateKey": "2026-03-10",
      "thumbnailUrl": "",
      "totalSeconds": 1400000,
      "ctEscalatedAt": null,
      "endDayPercent": 28.47222222222222,
      "finalQuantity": null,
      "originOrderId": "ORD-2025SS-001::S-2025SS-T001::NAVY::W",
      "proposalBasis": "ST",
      "proposalSeconds": 1400000,
      "startDayPercent": 14.58333333333334,
      "versionUpdatedAt": "2026-03-05T10:17:14.922Z",
      "contractedSeconds": 1400000,
      "ctEscalationReason": null,
      "ctEscalationStatus": null,
      "startDayOffsetPercent": 85.41666666666666,
      "ctEscalationTargetRole": null
    },
    {
      "lineKey": "LINE_2",
      "id": "A-ORD-2025SS-001::S-2025SS-T001::BLACK::M-2-13",
      "basis": "ST",
      "color": "#DCE9FF",
      "label": "레귤러핏 라운드넥 티셔츠",
      "cardId": "ORD-2025SS-001::S-2025SS-T001::BLACK::M",
      "ctNote": "제안 송부 2026-03-05T10:17:31.486Z",
      "gender": "M",
      "lineId": "2",
      "colorId": 291,
      "orderNo": "ORD-2025SS-001",
      "version": 4,
      "ctSentAt": null,
      "ctSource": "OPERATOR_PROPOSAL",
      "ctStatus": "AGREED",
      "customer": "테스트 발주자",
      "endIndex": 16,
      "imageUrl": "",
      "quantity": 600,
      "colorName": "블랙",
      "createdAt": "2026-03-05T10:17:16.832Z",
      "updatedAt": "2026-03-05T10:19:09.753Z",
      "ctAgreedAt": "2026-03-05T10:20:50.253Z",
      "ctAgreedBy": "라인2 작업자01",
      "ctOverride": false,
      "endDateKey": "2026-03-17",
      "previewUrl": "",
      "startIndex": 12,
      "completedAt": null,
      "isCompleted": false,
      "stripeColor": "#9FB9F2",
      "startDateKey": "2026-03-13",
      "thumbnailUrl": "",
      "totalSeconds": 2100000,
      "ctEscalatedAt": null,
      "endDayPercent": 93.05555555555556,
      "finalQuantity": null,
      "originOrderId": "ORD-2025SS-001::S-2025SS-T001::BLACK::M",
      "proposalBasis": "ST",
      "proposalSeconds": 2100000,
      "startDayPercent": 71.52777777777779,
      "versionUpdatedAt": "2026-03-05T10:20:52.702Z",
      "contractedSeconds": 2100000,
      "ctEscalationReason": null,
      "ctEscalationStatus": null,
      "startDayOffsetPercent": 28.47222222222222,
      "ctEscalationTargetRole": null
    },
    {
      "lineKey": "LINE_2",
      "id": "A-ORD-2025SS-001::S-2025SS-T001::NAVY::M-2-16",
      "basis": "ST",
      "color": "#DCE9FF",
      "label": "레귤러핏 라운드넥 티셔츠",
      "cardId": "ORD-2025SS-001::S-2025SS-T001::NAVY::M",
      "ctNote": "제안 송부 2026-03-05T10:17:50.029Z",
      "gender": "M",
      "lineId": "2",
      "colorId": 292,
      "orderNo": "ORD-2025SS-001",
      "version": 4,
      "ctSentAt": null,
      "ctSource": "OPERATOR_PROPOSAL",
      "ctStatus": "AGREED",
      "customer": "테스트 발주자",
      "endIndex": 20,
      "imageUrl": "",
      "quantity": 600,
      "colorName": "네이비",
      "createdAt": "2026-03-05T10:17:16.832Z",
      "updatedAt": "2026-03-05T10:17:53.055Z",
      "ctAgreedAt": "2026-03-05T10:20:58.051Z",
      "ctAgreedBy": "라인2 작업자01",
      "ctOverride": false,
      "endDateKey": "2026-03-21",
      "previewUrl": "",
      "startIndex": 16,
      "completedAt": null,
      "isCompleted": false,
      "stripeColor": "#9FB9F2",
      "startDateKey": "2026-03-17",
      "thumbnailUrl": "",
      "totalSeconds": 2100000,
      "ctEscalatedAt": null,
      "endDayPercent": 57.63888888888889,
      "finalQuantity": null,
      "originOrderId": "ORD-2025SS-001::S-2025SS-T001::NAVY::M",
      "proposalBasis": "ST",
      "proposalSeconds": 2100000,
      "startDayPercent": 6.944444444444445,
      "versionUpdatedAt": "2026-03-05T10:21:00.667Z",
      "contractedSeconds": 2100000,
      "ctEscalationReason": null,
      "ctEscalationStatus": null,
      "startDayOffsetPercent": 93.05555555555556,
      "ctEscalationTargetRole": null
    },
    {
      "lineKey": "LINE_2",
      "id": "A-ORD-2025SS-001::S-2025SS-P002::WHITE::W-2-19",
      "basis": "ST",
      "color": "#DCE9FF",
      "label": "슬림핏 카라 폴로 셔츠",
      "cardId": "ORD-2025SS-001::S-2025SS-P002::WHITE::W",
      "ctNote": "제안 송부 2026-03-05T10:18:05.093Z",
      "gender": "W",
      "lineId": "2",
      "colorId": 290,
      "orderNo": "ORD-2025SS-001",
      "version": 4,
      "ctSentAt": null,
      "ctSource": "OPERATOR_PROPOSAL",
      "ctStatus": "AGREED",
      "customer": "테스트 발주자",
      "endIndex": 24,
      "imageUrl": "",
      "quantity": 350,
      "colorName": "화이트",
      "createdAt": "2026-03-05T10:17:16.832Z",
      "updatedAt": "2026-03-05T10:18:08.109Z",
      "ctAgreedAt": "2026-03-05T10:21:05.725Z",
      "ctAgreedBy": "라인2 작업자01",
      "ctOverride": false,
      "endDateKey": "2026-03-25",
      "previewUrl": "",
      "startIndex": 20,
      "completedAt": null,
      "isCompleted": false,
      "stripeColor": "#9FB9F2",
      "startDateKey": "2026-03-21",
      "thumbnailUrl": "",
      "totalSeconds": 1540000,
      "ctEscalatedAt": null,
      "endDayPercent": 25,
      "finalQuantity": null,
      "originOrderId": "ORD-2025SS-001::S-2025SS-P002::WHITE::W",
      "proposalBasis": "ST",
      "proposalSeconds": 1540000,
      "startDayPercent": 42.36111111111111,
      "versionUpdatedAt": "2026-03-05T10:21:08.179Z",
      "contractedSeconds": 1540000,
      "ctEscalationReason": null,
      "ctEscalationStatus": null,
      "startDayOffsetPercent": 57.63888888888889,
      "ctEscalationTargetRole": null
    },
    {
      "lineKey": "LINE_2",
      "id": "A-ORD-2025FW-001::S-2025FW-J003::LT-BLUE::W-2-24",
      "basis": "ST",
      "color": "#DCE9FF",
      "label": "오버핏 데님 재킷",
      "cardId": "ORD-2025FW-001::S-2025FW-J003::LT-BLUE::W",
      "ctNote": "제안 송부 2026-03-05T10:18:25.525Z",
      "gender": "W",
      "lineId": "2",
      "colorId": 294,
      "orderNo": "ORD-2025FW-001",
      "version": 4,
      "ctSentAt": null,
      "ctSource": "OPERATOR_PROPOSAL",
      "ctStatus": "AGREED",
      "customer": "테스트 발주자",
      "endIndex": 29,
      "imageUrl": "",
      "quantity": 380,
      "colorName": "라이트블루",
      "createdAt": "2026-03-05T10:17:16.832Z",
      "updatedAt": "2026-03-05T10:18:28.549Z",
      "ctAgreedAt": "2026-03-05T10:21:13.029Z",
      "ctAgreedBy": "라인2 작업자01",
      "ctOverride": false,
      "endDateKey": "2026-03-30",
      "previewUrl": "",
      "startIndex": 24,
      "completedAt": null,
      "isCompleted": false,
      "stripeColor": "#9FB9F2",
      "startDateKey": "2026-03-25",
      "thumbnailUrl": "",
      "totalSeconds": 2280000,
      "ctEscalatedAt": null,
      "endDayPercent": 20.83333333333334,
      "finalQuantity": null,
      "originOrderId": "ORD-2025FW-001::S-2025FW-J003::LT-BLUE::W",
      "proposalBasis": "ST",
      "proposalSeconds": 2280000,
      "startDayPercent": 75,
      "versionUpdatedAt": "2026-03-05T10:21:15.647Z",
      "contractedSeconds": 2280000,
      "ctEscalationReason": null,
      "ctEscalationStatus": null,
      "startDayOffsetPercent": 25,
      "ctEscalationTargetRole": null
    },
    {
      "lineKey": "LINE_2",
      "id": "A-ORD-2025FW-001::S-2025FW-J003::MID-BLUE::W-2-28",
      "basis": "ST",
      "color": "#DCE9FF",
      "label": "오버핏 데님 재킷",
      "cardId": "ORD-2025FW-001::S-2025FW-J003::MID-BLUE::W",
      "ctNote": "제안 송부 2026-03-05T10:18:43.189Z",
      "gender": "W",
      "lineId": "2",
      "colorId": 295,
      "orderNo": "ORD-2025FW-001",
      "version": 4,
      "ctSentAt": null,
      "ctSource": "OPERATOR_PROPOSAL",
      "ctStatus": "AGREED",
      "customer": "테스트 발주자",
      "endIndex": 33,
      "imageUrl": "",
      "quantity": 380,
      "colorName": "미드블루",
      "createdAt": "2026-03-05T10:17:16.832Z",
      "updatedAt": "2026-03-05T10:18:46.215Z",
      "ctAgreedAt": "2026-03-05T10:21:20.053Z",
      "ctAgreedBy": "라인2 작업자01",
      "ctOverride": false,
      "endDateKey": "2026-04-03",
      "previewUrl": "",
      "startIndex": 29,
      "completedAt": null,
      "isCompleted": false,
      "stripeColor": "#9FB9F2",
      "startDateKey": "2026-03-30",
      "thumbnailUrl": "",
      "totalSeconds": 2280000,
      "ctEscalatedAt": null,
      "endDayPercent": 16.66666666666666,
      "finalQuantity": null,
      "originOrderId": "ORD-2025FW-001::S-2025FW-J003::MID-BLUE::W",
      "proposalBasis": "ST",
      "proposalSeconds": 2280000,
      "startDayPercent": 79.16666666666666,
      "versionUpdatedAt": "2026-03-05T10:21:22.502Z",
      "contractedSeconds": 2280000,
      "ctEscalationReason": null,
      "ctEscalationStatus": null,
      "startDayOffsetPercent": 20.83333333333334,
      "ctEscalationTargetRole": null
    }
  ]
};

const prisma = new PrismaClient();

const MANUFACTURER_CODE = 'TSMF';
const BRAND_CODE = 'TSBR';
const BASELINE_FACTORY_NAME = 'Sample Factory';

const BASELINE_EMPLOYEE_NAME_BY_EMAIL = {
  'manufacturer-admin@test.local': 'Manager',
  'manufacturer-operator@test.local': 'Operator',
  'manufacturer-accountant@test.local': 'Accountant',
};

const BASELINE_WORKER_NAME_BY_EMAIL = {};
for (let i = 1; i <= 20; i++) {
  const n = String(i).padStart(2, '0');
  BASELINE_WORKER_NAME_BY_EMAIL[`line1-worker${n}@baro.local`] = `Line1 Worker ${n}`;
}
for (let i = 1; i <= 20; i++) {
  const n = String(i).padStart(2, '0');
  BASELINE_WORKER_NAME_BY_EMAIL[`line2-worker${n}@baro.local`] = `Line2 Worker ${n}`;
}

const BASELINE_LINE_WORKER_MAP = [
  {
    lineName: 'Sample Line 1',
    managerEmail: 'line1-worker01@baro.local',
    emails: Array.from({ length: 20 }, (_, i) => `line1-worker${String(i + 1).padStart(2, '0')}@baro.local`),
  },
  {
    lineName: 'Sample Line 2',
    managerEmail: 'line2-worker01@baro.local',
    emails: Array.from({ length: 20 }, (_, i) => `line2-worker${String(i + 1).padStart(2, '0')}@baro.local`),
  },
];

const BASELINE_STAFF_MEMBERSHIPS = [
  { orgCode: MANUFACTURER_CODE, email: 'manufacturer-admin@test.local', role: 'ADMIN' },
  { orgCode: MANUFACTURER_CODE, email: 'manufacturer-operator@test.local', role: 'OPERATOR' },
  { orgCode: MANUFACTURER_CODE, email: 'manufacturer-accountant@test.local', role: 'ACCOUNTANT' },
  { orgCode: BRAND_CODE, email: 'brand-admin@test.local', role: 'ADMIN' },
  { orgCode: BRAND_CODE, email: 'brand-operator@test.local', role: 'OPERATOR' },
  { orgCode: BRAND_CODE, email: 'brand-accountant@test.local', role: 'ACCOUNTANT' },
];

const BASELINE_WORKER_MEMBERSHIPS = BASELINE_LINE_WORKER_MAP.flatMap((line) =>
  line.emails.map((email) => ({
    orgCode: MANUFACTURER_CODE,
    email,
    role: 'WORKER',
  }))
);

const BASELINE_TEST_MEMBERSHIPS = [
  ...BASELINE_STAFF_MEMBERSHIPS,
  ...BASELINE_WORKER_MEMBERSHIPS,
];

const BASELINE_COLORS = [
  { code: 'WHITE', name: 'White' },
  { code: 'BLACK', name: 'Black' },
  { code: 'NAVY', name: 'Navy' },
  { code: 'GRAY-MEL', name: 'Gray Melange' },
  { code: 'LT-BLUE', name: 'Light Blue' },
  { code: 'MID-BLUE', name: 'Mid Blue' },
  { code: 'INDIGO', name: 'Indigo' },
];

const BASELINE_PROCESSES = [
  { code: 'P01', name: 'Test Process 01' },
  { code: 'P02', name: 'Test Process 02' },
  { code: 'P03', name: 'Test Process 03' },
  { code: 'P04', name: 'Test Process 04' },
  { code: 'P05', name: 'Test Process 05' },
  { code: 'P06', name: 'Test Process 06' },
  { code: 'P07', name: 'Test Process 07' },
  { code: 'P08', name: 'Test Process 08' },
  { code: 'P09', name: 'Test Process 09' },
  { code: 'P10', name: 'Test Process 10' },
];

const BASELINE_STYLES = [
  {
    styleId: 'S-2025SS-T001',
    styleCode: '25SS-T001',
    name: 'Daily Round T-Shirt',
    registrationDate: '2025-03-10',
    designer: 'Designer Kim',
    season: '2025SS',
    collection: 'Basic Line',
    processes: [
      { code: 'P01', name: 'Cut Front', pt: 500, timeRefQuantity: 1000 },
      { code: 'P02', name: 'Sew Front', pt: 460, timeRefQuantity: 1000 },
      { code: 'P03', name: 'Sew Back', pt: 440, timeRefQuantity: 1000 },
      { code: 'P04', name: 'Sew Sleeve', pt: 480, timeRefQuantity: 1000 },
      { code: 'P05', name: 'Neck Label Attach', pt: 420, timeRefQuantity: 1000 },
      { code: 'P06', name: 'Hem', pt: 400, timeRefQuantity: 1000 },
      { code: 'P07', name: 'Finish Neck', pt: 400, timeRefQuantity: 1000 },
      { code: 'P08', name: 'Inspect Pack', pt: 400, timeRefQuantity: 1000 },
    ],
  },
  {
    styleId: 'S-2025SS-P002',
    styleCode: '25SS-P002',
    name: 'Slim Collar Hero Polo',
    registrationDate: '2025-03-18',
    designer: 'Designer Lee',
    season: '2025SS',
    collection: 'Sport Casual',
    processes: [
      { code: 'P01', name: 'Cut Front', pt: 550, timeRefQuantity: 1000 },
      { code: 'P02', name: 'Sew Front', pt: 500, timeRefQuantity: 1000 },
      { code: 'P03', name: 'Sew Back', pt: 500, timeRefQuantity: 1000 },
      { code: 'P04', name: 'Sew Sleeve', pt: 480, timeRefQuantity: 1000 },
      { code: 'P05', name: 'Collar Start', pt: 500, timeRefQuantity: 1000 },
      { code: 'P06', name: 'Collar Attach', pt: 490, timeRefQuantity: 1000 },
      { code: 'P07', name: 'Sleeve Process', pt: 480, timeRefQuantity: 1000 },
      { code: 'P08', name: 'Finish Hem', pt: 450, timeRefQuantity: 1000 },
      { code: 'P09', name: 'Inspect Pack', pt: 450, timeRefQuantity: 1000 },
    ],
  },
  {
    styleId: 'S-2025FW-J003',
    styleCode: '25FW-J003',
    name: 'Urban Corduroy Pants',
    registrationDate: '2025-04-02',
    designer: 'Designer Park',
    season: '2025FW',
    collection: 'Urban Premium',
    processes: [
      { code: 'P01', name: 'Cut Front', pt: 700, timeRefQuantity: 1000 },
      { code: 'P02', name: 'Pocket Attach', pt: 650, timeRefQuantity: 1000 },
      { code: 'P03', name: 'Sew Front', pt: 650, timeRefQuantity: 1000 },
      { code: 'P04', name: 'Sew Back', pt: 600, timeRefQuantity: 1000 },
      { code: 'P05', name: 'Sew Sleeve', pt: 600, timeRefQuantity: 1000 },
      { code: 'P06', name: 'Collar Attach', pt: 600, timeRefQuantity: 1000 },
      { code: 'P07', name: 'Waistband Process', pt: 600, timeRefQuantity: 1000 },
      { code: 'P08', name: 'Lining Attach', pt: 550, timeRefQuantity: 1000 },
      { code: 'P09', name: 'Shape Finish', pt: 550, timeRefQuantity: 1000 },
      { code: 'P10', name: 'Inspect Pack', pt: 500, timeRefQuantity: 1000 },
    ],
  },
];

const BASELINE_ORDERS = [
  {
    orderId: 'ORD-2025SS-001',
    orderNumber: 'ORD-2025SS-001',
    status: 'ORDER_RECEIVED',
    items: [
      { styleId: 'S-2025SS-T001', styleCode: '25SS-T001', colorCode: 'WHITE', colorName: 'White', gender: 'M', sizeQuantities: { S: 90, M: 210, L: 210, XL: 90 } },
      { styleId: 'S-2025SS-T001', styleCode: '25SS-T001', colorCode: 'WHITE', colorName: 'White', gender: 'W', sizeQuantities: { S: 70, M: 130, L: 130, XL: 70 } },
      { styleId: 'S-2025SS-T001', styleCode: '25SS-T001', colorCode: 'BLACK', colorName: 'Black', gender: 'M', sizeQuantities: { S: 90, M: 210, L: 210, XL: 90 } },
      { styleId: 'S-2025SS-T001', styleCode: '25SS-T001', colorCode: 'BLACK', colorName: 'Black', gender: 'W', sizeQuantities: { S: 70, M: 130, L: 130, XL: 70 } },
      { styleId: 'S-2025SS-T001', styleCode: '25SS-T001', colorCode: 'NAVY', colorName: 'Navy', gender: 'M', sizeQuantities: { S: 90, M: 210, L: 210, XL: 90 } },
      { styleId: 'S-2025SS-T001', styleCode: '25SS-T001', colorCode: 'NAVY', colorName: 'Navy', gender: 'W', sizeQuantities: { S: 70, M: 130, L: 130, XL: 70 } },
      { styleId: 'S-2025SS-P002', styleCode: '25SS-P002', colorCode: 'WHITE', colorName: 'White', gender: 'M', sizeQuantities: { S: 100, M: 225, L: 225, XL: 100 } },
      { styleId: 'S-2025SS-P002', styleCode: '25SS-P002', colorCode: 'WHITE', colorName: 'White', gender: 'W', sizeQuantities: { S: 55, M: 120, L: 120, XL: 55 } },
      { styleId: 'S-2025SS-P002', styleCode: '25SS-P002', colorCode: 'GRAY-MEL', colorName: 'Gray Melange', gender: 'M', sizeQuantities: { S: 100, M: 225, L: 225, XL: 100 } },
      { styleId: 'S-2025SS-P002', styleCode: '25SS-P002', colorCode: 'GRAY-MEL', colorName: 'Gray Melange', gender: 'W', sizeQuantities: { S: 55, M: 120, L: 120, XL: 55 } },
    ],
  },
  {
    orderId: 'ORD-2025FW-001',
    orderNumber: 'ORD-2025FW-001',
    status: 'ORDER_RECEIVED',
    items: [
      { styleId: 'S-2025FW-J003', styleCode: '25FW-J003', colorCode: 'LT-BLUE', colorName: 'Light Blue', gender: 'M', sizeQuantities: { S: 50, M: 130, L: 160, XL: 100, '2XL': 30 } },
      { styleId: 'S-2025FW-J003', styleCode: '25FW-J003', colorCode: 'LT-BLUE', colorName: 'Light Blue', gender: 'W', sizeQuantities: { S: 70, M: 130, L: 120, XL: 60 } },
      { styleId: 'S-2025FW-J003', styleCode: '25FW-J003', colorCode: 'MID-BLUE', colorName: 'Mid Blue', gender: 'M', sizeQuantities: { S: 50, M: 130, L: 160, XL: 100, '2XL': 30 } },
      { styleId: 'S-2025FW-J003', styleCode: '25FW-J003', colorCode: 'MID-BLUE', colorName: 'Mid Blue', gender: 'W', sizeQuantities: { S: 70, M: 130, L: 120, XL: 60 } },
      { styleId: 'S-2025FW-J003', styleCode: '25FW-J003', colorCode: 'INDIGO', colorName: 'Indigo', gender: 'M', sizeQuantities: { S: 45, M: 120, L: 155, XL: 90, '2XL': 30 } },
      { styleId: 'S-2025FW-J003', styleCode: '25FW-J003', colorCode: 'INDIGO', colorName: 'Indigo', gender: 'W', sizeQuantities: { S: 65, M: 125, L: 115, XL: 55 } },
    ],
  },
];

const sumItemQuantity = (item) =>
  Object.values(item.sizeQuantities || {}).reduce((s, v) => s + Number(v || 0), 0);

const cloneJson = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return JSON.parse(JSON.stringify(value));
};

const BASELINE_LINE_NAME_BY_KEY = {
  LINE_1: BASELINE_LINE_WORKER_MAP[0]?.lineName,
  LINE_2: BASELINE_LINE_WORKER_MAP[1]?.lineName,
};

const resolveBaselineLineId = (lineNameToId, lineKey) => {
  const lineName = BASELINE_LINE_NAME_BY_KEY[lineKey];
  if (!lineName) {
    throw new Error(`Unknown baseline line key: ${lineKey}`);
  }
  const lineId = lineNameToId[lineName];
  if (!lineId) {
    throw new Error(`Line not found for baseline seed: ${lineName}`);
  }
  return lineId;
};

function buildBaselineAssignmentBoardCards(orders, styleMap) {
  const cards = [];
  const occurrenceByVariant = new Map();

  for (const order of orders) {
    const orderId = String(order.orderId || order.orderNumber || '');
    const items = Array.isArray(order.items) ? order.items : [];

    for (const item of items) {
      const style = styleMap.get(item.styleId);
      if (!style) continue;

      const variantKey = `${orderId}::${item.styleId}::${item.colorCode || ''}`;
      const occurrence = occurrenceByVariant.get(variantKey) || 0;
      occurrenceByVariant.set(variantKey, occurrence + 1);

      // The reset baseline lists each color bucket in M -> W order.
      const gender = occurrence === 0 ? 'M' : occurrence === 1 ? 'W' : 'U';
      const quantity = Number(item.totalQuantity || sumItemQuantity(item) || 0);
      const processes = Array.isArray(style.processes) ? style.processes : [];
      const processCount = processes.length;
      const totalPtPerPiece = processes.reduce((sum, process) => sum + Number(process?.pt || 0), 0);
      const totalAtPerPiece = processes.reduce((sum, process) => sum + Number(process?.at || 0), 0);
      const totalStPerPiece = processes.reduce((sum, process) => {
        const at = Number(process?.at);
        if (Number.isFinite(at) && at > 0) return sum + at;
        return sum + Number(process?.pt || 0);
      }, 0);
      const totalPt = totalPtPerPiece * quantity;
      const totalAt = totalAtPerPiece * quantity;
      const totalSt = totalStPerPiece * quantity;
      const status = totalSt > 0 ? 'ST' : totalAt > 0 ? 'AT' : 'PT';
      const cardId = `${orderId}::${item.styleId}::${item.colorCode}::${gender}`;

      cards.push({
        id: cardId,
        originOrderId: cardId,
        orderNo: order.orderNumber,
        dueDate: order.dueDate,
        customer: order.customerName || order.customer || '',
        styleId: item.styleId,
        styleName: style.name,
        styleCode: style.styleCode,
        colorId: item.colorCode,
        colorName: item.colorName || '',
        gender,
        quantity,
        processCount,
        status,
        totalSeconds: status === 'ST' ? totalSt : status === 'AT' ? totalAt : totalPt,
        totalPt,
        totalAt,
        totalSt,
        previewUrl: '',
      });
    }
  }

  return cards;
}

function applyBaselineAgreementSnapshots(cards, lineNameToId) {
  const snapshotByCardId = new Map(
    (Array.isArray(BASELINE_ASSIGNMENT_AGREEMENTS.cards) ? BASELINE_ASSIGNMENT_AGREEMENTS.cards : [])
      .map((entry) => [String(entry.cardId), entry])
  );

  return cards.map((card) => {
    const seed = snapshotByCardId.get(String(card.id));
    if (!seed?.ctAgreedSnapshot) {
      return card;
    }

    return {
      ...card,
      pendingCtProposal: null,
      ctAgreedSnapshot: {
        ...cloneJson(seed.ctAgreedSnapshot),
        lineId: String(resolveBaselineLineId(lineNameToId, seed.lineKey)),
      },
    };
  });
}

function buildBaselineAgreedAssignments(lineNameToId) {
  return (Array.isArray(BASELINE_ASSIGNMENT_AGREEMENTS.assignments)
    ? BASELINE_ASSIGNMENT_AGREEMENTS.assignments
    : []
  ).map((seed) => {
    const cloned = cloneJson(seed);
    const lineKey = cloned.lineKey;
    delete cloned.lineKey;
    return {
      ...cloned,
      lineId: String(resolveBaselineLineId(lineNameToId, lineKey)),
    };
  });
}

function buildAssignmentPlanSeedRows(orgId, lineNameToId) {
  return buildBaselineAgreedAssignments(lineNameToId).map((seed) => {
    const updatedAt = new Date(seed.updatedAt || seed.ctAgreedAt || new Date().toISOString());
    const createdAt = seed.createdAt ? new Date(seed.createdAt) : updatedAt;
    return {
      orgId,
      lineId: Number(seed.lineId),
      externalId: seed.id,
      cardId: seed.cardId || null,
      orderNo: seed.orderNo || null,
      customer: seed.customer || null,
      label: seed.label || null,
      colorName: seed.colorName || null,
      previewUrl: seed.previewUrl || null,
      imageUrl: seed.imageUrl || null,
      thumbnailUrl: seed.thumbnailUrl || null,
      quantity: seed.quantity ?? null,
      originOrderId: seed.originOrderId || null,
      basis: seed.basis || null,
      proposalBasis: seed.proposalBasis || null,
      proposalSeconds: seed.proposalSeconds ?? null,
      contractedSeconds: seed.contractedSeconds ?? null,
      ctStatus: seed.ctStatus || 'PENDING',
      ctSource: seed.ctSource || null,
      ctAgreedBy: seed.ctAgreedBy || null,
      ctAgreedAt: seed.ctAgreedAt ? new Date(seed.ctAgreedAt) : null,
      ctNote: seed.ctNote || null,
      color: seed.color || null,
      stripeColor: seed.stripeColor || null,
      totalSeconds: seed.totalSeconds ?? null,
      startIndex: seed.startIndex,
      endIndex: seed.endIndex,
      startDayOffsetPercent: seed.startDayOffsetPercent ?? null,
      startDayPercent: seed.startDayPercent ?? null,
      endDayPercent: seed.endDayPercent ?? null,
      createdAt,
      updatedAt,
    };
  });
}

// ???? 癲ル슢??猿눫??????깆뱾 ??節뚮쳮雅?????????????????????????????????????????????????????????????????????????????????????????????????????????
const PROD_SECONDS_PER_DAY = 40 * 8 * 3600; // 40癲???8??癰???= 1,152,000????

// date ??れ삀?????⑥??days ???ㅼ굡????????モ? ?袁⑸즵???
function addWorkingDays(date, days) {
  const result = new Date(date);
  let remaining = days;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    if (result.getDay() !== 0 && result.getDay() !== 6) remaining--;
  }
  return result;
}

// ???????釉먯뒭甕?癲ル슢???癲????袁⑸즵???
function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function toYYYYMMDD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ??낆뒩?戮る즵 ??ш끽維쀩????獄쏅똾????????ш끽維?????????ㅼ굡???????節뚮쳮雅?
function computeOrderWorkingDays(order, styleMap) {
  let totalSeconds = 0;
  for (const item of order.items) {
    const style = styleMap.get(item.styleId);
    if (!style) continue;
    const ptPerPiece = style.processes.reduce((sum, p) => sum + p.pt, 0);
    totalSeconds += ptPerPiece * sumItemQuantity(item);
  }
  return Math.ceil(totalSeconds / PROD_SECONDS_PER_DAY);
}

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const upsertBaselineOrganization = async ({ code, type }) =>
  prisma.organization.upsert({
    where: { code },
    update: { type },
    create: {
      code,
      name: code,
      type,
    },
  });

async function ensureBaselineFactoryAndLines(manufacturerOrgId) {
  const existingFactory = await prisma.factory.findFirst({
    where: {
      orgId: manufacturerOrgId,
      name: BASELINE_FACTORY_NAME,
    },
    select: { id: true },
  });

  const factory = existingFactory
    ? await prisma.factory.update({
        where: { id: existingFactory.id },
        data: {
          targetMonthlyWage: 8000000,
          wagePerSecond: 10.68,
        },
      })
    : await prisma.factory.create({
        data: {
          orgId: manufacturerOrgId,
          name: BASELINE_FACTORY_NAME,
          targetMonthlyWage: 8000000,
          wagePerSecond: 10.68,
        },
      });

  for (const lineSeed of BASELINE_LINE_WORKER_MAP) {
    await prisma.line.upsert({
      where: {
        factoryId_name: {
          factoryId: factory.id,
          name: lineSeed.lineName,
        },
      },
      update: {
        orgId: manufacturerOrgId,
        isActive: true,
      },
      create: {
        orgId: manufacturerOrgId,
        factoryId: factory.id,
        name: lineSeed.lineName,
        isActive: true,
      },
    });
  }

  return { factory };
}

async function seedBaselineMembershipsAndEmployees({ manufacturer, brand, factory }) {
  const orgIdByCode = {
    [MANUFACTURER_CODE]: manufacturer.id,
    [BRAND_CODE]: brand.id,
  };
  const now = new Date();

  let upsertedMemberships = 0;
  let upsertedEmployees = 0;
  for (const membershipSeed of BASELINE_TEST_MEMBERSHIPS) {
    const orgId = orgIdByCode[membershipSeed.orgCode];
    if (!orgId) continue;
    const email = normalizeEmail(membershipSeed.email);

    const membership = await prisma.orgMembership.upsert({
      where: { orgId_email: { orgId, email } },
      update: {
        role: membershipSeed.role,
        status: 'ACTIVE',
        approvedAt: now,
      },
      create: {
        orgId,
        email,
        role: membershipSeed.role,
        status: 'ACTIVE',
        approvedAt: now,
      },
    });
    upsertedMemberships += 1;

    if (membershipSeed.orgCode !== MANUFACTURER_CODE) {
      continue;
    }

    const baselineName =
      BASELINE_EMPLOYEE_NAME_BY_EMAIL[email] ||
      BASELINE_WORKER_NAME_BY_EMAIL[email] ||
      null;

    await prisma.employee.upsert({
      where: { orgMembershipId: membership.id },
      update: {
        orgId: manufacturer.id,
        factoryId: factory.id,
        name: baselineName,
      },
      create: {
        orgId: manufacturer.id,
        orgMembershipId: membership.id,
        factoryId: factory.id,
        name: baselineName,
      },
    });
    upsertedEmployees += 1;
  }

  return { upsertedMemberships, upsertedEmployees };
}

async function ensureBaselineTestAccounts() {
  const manufacturer = await upsertBaselineOrganization({
    code: MANUFACTURER_CODE,
    type: 'MANUFACTURER',
  });
  const brand = await upsertBaselineOrganization({
    code: BRAND_CODE,
    type: 'BRAND',
  });

  await prisma.orgRelationship.upsert({
    where: {
      manufacturerOrgId_brandOrgId: {
        manufacturerOrgId: manufacturer.id,
        brandOrgId: brand.id,
      },
    },
    update: {},
    create: {
      manufacturerOrgId: manufacturer.id,
      brandOrgId: brand.id,
      customerCode: BRAND_CODE,
    },
  });

  const { factory } = await ensureBaselineFactoryAndLines(manufacturer.id);
  const membershipSeedResult = await seedBaselineMembershipsAndEmployees({
    manufacturer,
    brand,
    factory,
  });

  await prisma.systemUser.upsert({
    where: { email: 'system-admin@test.local' },
    update: { systemRole: 'SYSTEM_ADMIN' },
    create: { email: 'system-admin@test.local', systemRole: 'SYSTEM_ADMIN' },
  });

  return {
    manufacturer,
    brand,
    membershipSeedResult,
  };
}

async function main() {
  const { manufacturer, brand, membershipSeedResult } =
    await ensureBaselineTestAccounts();

  console.log('\n?????釉뚰?節낇맪?');
  console.log(`  TSMF (??筌믠뵎??? orgId: ${manufacturer.id}`);
  console.log(`  TSBR (??怨쀫뮛??? orgId: ${brand.id}`);
  console.log('\n?縕?猿녿뎨????筌믨퀣援?..\n');

  const results = {
    membershipSeed: membershipSeedResult,
  };

  // 1. Style ????(TSMF + TSBR ??ш끽維??
  const deletedStyles = await prisma.style.deleteMany({
    where: { orgId: { in: [manufacturer.id, brand.id] } },
  });
  results.style = deletedStyles.count;
  console.log(`[1/9] Style deleted: ${deletedStyles.count}`);

  // 2. WorkOrder ????
  const deletedOrders = await prisma.workOrder.deleteMany({
    where: { orgId: { in: [manufacturer.id, brand.id] } },
  });
  results.workOrder = deletedOrders.count;
  console.log(`[2/9] WorkOrder deleted: ${deletedOrders.count}`);

  // 3. AssignmentPlan ????
  const deletedPlans = await prisma.assignmentPlan.deleteMany({
    where: { orgId: manufacturer.id },
  });
  results.assignmentPlan = deletedPlans.count;
  console.log(`[3/9] AssignmentPlan deleted: ${deletedPlans.count}`);

  // 4. AssignmentBoardState ????
  const deletedBoardState = await prisma.assignmentBoardState.deleteMany({
    where: { orgId: manufacturer.id },
  });
  results.assignmentBoardState = deletedBoardState.count;
  console.log(`[4/9] AssignmentBoardState deleted: ${deletedBoardState.count}`);

  // 5. AttrProcess + AttrColor: ??ш끽維?????????怨뚮옖甕??
  await prisma.attrProcess.deleteMany({ where: { orgId: manufacturer.id } });
  await prisma.attrProcess.createMany({
    data: BASELINE_PROCESSES.map((p) => ({ orgId: manufacturer.id, ...p })),
    skipDuplicates: true,
  });
  await prisma.attrColor.deleteMany({ where: { orgId: manufacturer.id } });
  await prisma.attrColor.createMany({
    data: BASELINE_COLORS.map((c) => ({ orgId: manufacturer.id, ...c })),
    skipDuplicates: true,
  });
  results.attrProcess = 'P01~P10 restored';
  results.attrColor = `${BASELINE_COLORS.length} colors restored`;
  console.log(`[5/9] AttrProcess + AttrColor restored`);

  // 6. ??? ???Β??????????嶺????(factory, ???????怨멸껑 employee)
  let normalizedEmployees = 0;

  let factory = await prisma.factory.findFirst({
    where: { orgId: manufacturer.id },
    select: { id: true, name: true, wagePerSecond: true },
  });
  if (factory && factory.name !== BASELINE_FACTORY_NAME) {
    await prisma.factory.update({
      where: { id: factory.id },
      data: { name: BASELINE_FACTORY_NAME },
    });
    factory = {
      ...factory,
      name: BASELINE_FACTORY_NAME,
    };
  }

  // ???????怨멸껑 ??????嶺????
  const staffEmails = Object.keys(BASELINE_EMPLOYEE_NAME_BY_EMAIL);
  const staffEmployees = await prisma.employee.findMany({
    where: { orgId: manufacturer.id, membership: { email: { in: staffEmails } } },
    select: { id: true, name: true, membership: { select: { email: true } } },
  });
  for (const emp of staffEmployees) {
    const emailKey = normalizeEmail(emp.membership?.email);
    const baselineName = BASELINE_EMPLOYEE_NAME_BY_EMAIL[emailKey];
    if (!baselineName || String(emp.name || '').trim() === baselineName) continue;
    await prisma.employee.update({ where: { id: emp.id }, data: { name: baselineName } });
    normalizedEmployees += 1;
  }

  // ?????????????嶺????
  const workerEmailList = Object.keys(BASELINE_WORKER_NAME_BY_EMAIL);
  const workerEmployees = await prisma.employee.findMany({
    where: { orgId: manufacturer.id, membership: { email: { in: workerEmailList } } },
    select: { id: true, name: true, membership: { select: { email: true } } },
  });
  for (const emp of workerEmployees) {
    const emailKey = normalizeEmail(emp.membership?.email);
    const baselineName = BASELINE_WORKER_NAME_BY_EMAIL[emailKey];
    if (!baselineName || String(emp.name || '').trim() === baselineName) continue;
    await prisma.employee.update({ where: { id: emp.id }, data: { name: baselineName } });
    normalizedEmployees += 1;
  }

  results.normalizedEmployees = normalizedEmployees;
  console.log(`[6/9] Employee names normalized: ${normalizedEmployees}`);

  // 7. ??繹먮끏???袁⑸즲????縕?猿녿뎨?? ??ш끽維?????⑤챷??????繹먮끏??1 (01~20), ??繹먮끏??2 (01~20) ?????+ ??繹먮끏??????源놁젳
  const allWorkerEmails = Object.keys(BASELINE_WORKER_NAME_BY_EMAIL);
  const workerMemberships = await prisma.orgMembership.findMany({
    where: { orgId: manufacturer.id, email: { in: allWorkerEmails } },
    select: { id: true, email: true, employee: { select: { id: true } } },
  });
  const emailToEmployeeId = {};
  for (const m of workerMemberships) {
    if (m.employee?.id) emailToEmployeeId[normalizeEmail(m.email)] = m.employee.id;
  }

  const workerEmployeeIds = Object.values(emailToEmployeeId);
  const now = new Date();
  const baselineLineAssignmentStartAt = now;

  // ??れ삀?????筌????袁⑸즲??????ろ꼤嶺?
  const closedAssignments = await prisma.lineAssignment.updateMany({
    where: { employeeId: { in: workerEmployeeIds }, endAt: null },
    data: { endAt: now },
  });
  // lineName ?縕?猿녿뎨??
  await prisma.employee.updateMany({
    where: { id: { in: workerEmployeeIds } },
    data: { lineName: null },
  });

  // ??繹먮끏???釉뚰???
  const lineNames = BASELINE_LINE_WORKER_MAP.map((l) => l.lineName);
  const lineRecords = await prisma.line.findMany({
    where: { orgId: manufacturer.id, name: { in: lineNames } },
    select: { id: true, name: true },
  });
  const lineNameToId = Object.fromEntries(lineRecords.map((l) => [l.name, l.id]));

  // ???ル㎦???袁⑸즲?????獄쏅똻??+ lineName ????녿ぅ??熬곣뫀肄?
  let assignedCount = 0;
  for (const { lineName, emails } of BASELINE_LINE_WORKER_MAP) {
    const lineId = lineNameToId[lineName];
    if (!lineId) {
      console.warn(`  ?濡ろ뜑??? ??繹먮끏??'${lineName}'??癲ル슓??젆???????⑤９苑??袁⑸즲????癲꾧퀗??????ㅿ폍???`);
      continue;
    }
    for (const email of emails) {
      const employeeId = emailToEmployeeId[normalizeEmail(email)];
      if (!employeeId) {
        console.warn(`  ?濡ろ뜑??? '${email}' 癲ル슣?????癲ル슓??젆???????⑤９苑?癲꾧퀗??????ㅿ폍???`);
        continue;
      }
      await prisma.lineAssignment.create({
        data: { lineId, employeeId, startAt: baselineLineAssignmentStartAt },
      });
      await prisma.employee.update({
        where: { id: employeeId },
        data: { lineName },
      });
      assignedCount += 1;
    }
  }

  // ??繹먮끏????????
  let managersSet = 0;
  for (const { lineName, managerEmail } of BASELINE_LINE_WORKER_MAP) {
    const lineId = lineNameToId[lineName];
    if (!lineId) continue;
    const managerEmployeeId = emailToEmployeeId[normalizeEmail(managerEmail)];
    if (!managerEmployeeId) {
      console.warn(`  ?濡ろ뜑??? ??繹먮끏?????節뚮쳮??'${managerEmail}'??癲ル슓??젆???????⑤８?????덊렡.`);
      continue;
    }
    await prisma.line.update({
      where: { id: lineId },
      data: { managerEmployeeId },
    });
    managersSet += 1;
  }

  results.lineAssignment = { closed: closedAssignments.count, assigned: assignedCount, managersSet };
  console.log(`[7/9] ??繹먮끏???袁⑸즲????縕?猿녿뎨?? ${closedAssignments.count}癲????⑤챷?? ${assignedCount}癲????ル㎦???袁⑸즲??? ??繹먮끏???${managersSet}癲????源놁젳`);

  // 8. ??????濚밸Ŧ援욃ㅇ?(BASELINE_STYLES)
  let createdStyles = 0;
  let skippedStyles = 0;
  for (const style of BASELINE_STYLES) {
    const exists = await prisma.style.findFirst({
      where: { orgId: manufacturer.id, styleId: style.styleId },
    });
    if (exists) {
      skippedStyles += 1;
      continue;
    }
    await prisma.style.create({
      data: {
        orgId: manufacturer.id,
        styleId: style.styleId,
        styleCode: style.styleCode,
        name: style.name,
        customer: brand.name,
        registrationDate: style.registrationDate,
        designer: style.designer,
        season: style.season,
        collection: style.collection,
        processes: style.processes,
      },
    });
    createdStyles += 1;
  }
  results.styles = { created: createdStyles, skipped: skippedStyles };
  console.log(`[8/9] Styles seeded: created=${createdStyles}, skipped=${skippedStyles}`);

  // 9. ??낆뒩?戮る즵 ?濚밸Ŧ援욃ㅇ?(BASELINE_ORDERS) ??癲ル슢??猿눫??????덈틖 ??筌믨퀣????れ삀?? ????깆뱾 ??節뚮쳮雅?
  const styleMap = new Map(BASELINE_STYLES.map((s) => [s.styleId, s]));
  let prevOrderEnd = new Date(); // ????몄툜??딅텑?????筌?鍮???筌믨퀣援?

  let createdOrders = 0;
  let skippedOrders = 0;
  for (const order of BASELINE_ORDERS) {
    const items = order.items.map((item) => ({
      ...item,
      totalQuantity: sumItemQuantity(item),
    }));
    const totalQuantity = items.reduce((s, i) => s + i.totalQuantity, 0);

    // ???⑤챷????낆뒩?戮る즵 ??ш끽維??????筌?鍮???筌믨퀣援?????ш끽維??????彛??繹먮끏爰???釉먮폏???癲ル슢??猿눫???⑥??
    const workingDays = computeOrderWorkingDays(order, styleMap);
    const productionEnd = addWorkingDays(prevOrderEnd, workingDays);
    const dueDate = toYYYYMMDD(endOfMonth(productionEnd));
    prevOrderEnd = productionEnd;

    const exists = await prisma.workOrder.findFirst({
      where: { buyerOrgId: brand.id, sellerOrgId: manufacturer.id, orderNumber: order.orderNumber },
    });
    if (exists) {
      skippedOrders += 1;
      continue;
    }
    await prisma.workOrder.create({
      data: {
        orgId:         brand.id,
        orderId:       order.orderId,
        orderNumber:   order.orderNumber,
        buyerOrgId:    brand.id,
        buyerOrgName:  brand.name,
        sellerOrgId:   manufacturer.id,
        sellerOrgName: manufacturer.name,
        customerId:    brand.id,
        customerName:  brand.name,
        dueDate,
        status:        order.status,
        items,
        totalQuantity,
      },
    });
    createdOrders += 1;
    console.log(`        ${order.orderNumber}: ${totalQuantity.toLocaleString()}?? ${workingDays}????獄쏅똾??????ш끽維??${toYYYYMMDD(productionEnd)} ??癲ル슢??猿눫?${dueDate}`);
  }
  results.orders = { created: createdOrders, skipped: skippedOrders };
  console.log(`[9/9] Orders seeded: created=${createdOrders}, skipped=${skippedOrders}`);

  const seededOrders = await prisma.workOrder.findMany({
    where: {
      buyerOrgId: brand.id,
      sellerOrgId: manufacturer.id,
      orderNumber: { in: BASELINE_ORDERS.map((order) => order.orderNumber) },
    },
    select: {
      orderId: true,
      orderNumber: true,
      dueDate: true,
      customerName: true,
      customer: true,
      items: true,
    },
    orderBy: { orderNumber: 'asc' },
  });

  const baselineCards = buildBaselineAssignmentBoardCards(seededOrders, styleMap);
  const seededCards = applyBaselineAgreementSnapshots(baselineCards, lineNameToId);
  const seededAssignments = buildBaselineAgreedAssignments(lineNameToId);
  const assignmentPlanSeedRows = buildAssignmentPlanSeedRows(
    manufacturer.id,
    lineNameToId
  );

  if (assignmentPlanSeedRows.length > 0) {
    await prisma.assignmentPlan.createMany({
      data: assignmentPlanSeedRows,
    });
  }

  await prisma.assignmentBoardState.create({
    data: {
      orgId: manufacturer.id,
      cards: seededCards,
      assignments: seededAssignments,
    },
  });

  results.assignmentBoardSeed = {
    cards: seededCards.length,
    agreedCards: (BASELINE_ASSIGNMENT_AGREEMENTS.cards || []).length,
    agreedAssignments: seededAssignments.length,
  };
  console.log(`[post-reset] Assignment board seed: cards=${seededCards.length}, agreedCards=${(BASELINE_ASSIGNMENT_AGREEMENTS.cards || []).length}, agreedAssignments=${seededAssignments.length}`);



  const remaining = await prisma.$transaction([
    prisma.employee.count({ where: { orgId: manufacturer.id } }),
    prisma.line.count({ where: { orgId: manufacturer.id } }),
    prisma.lineAssignment.count({ where: { endAt: null } }),
    prisma.factory.count({ where: { orgId: manufacturer.id } }),
    prisma.style.count({ where: { orgId: manufacturer.id } }),
    prisma.workOrder.count({ where: { OR: [{ buyerOrgId: brand.id }, { sellerOrgId: manufacturer.id }] } }),
    prisma.assignmentPlan.count({ where: { orgId: manufacturer.id } }),
    prisma.assignmentBoardState.count({ where: { orgId: manufacturer.id } }),
  ]);

  console.log('\n=== ?縕?猿녿뎨????ш끽維??===');
  console.log(JSON.stringify(results, null, 2));
  console.log('\n??ш끽維?????Β????');
  console.log(`  Employee: ${remaining[0]}`);
  console.log(`  Factory: ${remaining[3]}`);
  console.log(`  Line: ${remaining[1]}`);
  console.log(`  LineAssignment (active): ${remaining[2]}`);
  console.log(`  Style: ${remaining[4]}`);
  console.log(`  WorkOrder: ${remaining[5]}`);
  console.log(`  AssignmentPlan: ${remaining[6]}`);
  console.log(`  AssignmentBoardState: ${remaining[7]}`);
}

main()
  .catch((e) => {
    console.error('\n?縕?猿녿뎨??????됰꽡:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
