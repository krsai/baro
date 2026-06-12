const assert = require("node:assert/strict");
const {
  buildWorkLogNoteWithEmploymentAdjustments,
  resolveWorkRecordEmploymentCoverage,
} = require("../dist/work-records/workRecordEmployment");

const resignedMidPeriod = resolveWorkRecordEmploymentCoverage({
  coverageStartDate: "2026-04-01",
  coverageEndDate: "2026-04-30",
  joinedDateKey: "2025-01-01",
  leftDateKey: "2026-04-15",
});
assert.equal(resignedMidPeriod.valid, true);
assert.equal(resignedMidPeriod.adjusted, true);
assert.equal(resignedMidPeriod.effectiveStartDate, "2026-04-01");
assert.equal(resignedMidPeriod.effectiveEndDate, "2026-04-15");

const afterResignation = resolveWorkRecordEmploymentCoverage({
  coverageStartDate: "2026-05-01",
  coverageEndDate: "2026-05-31",
  leftDateKey: "2026-04-15",
});
assert.equal(afterResignation.valid, false);

const adjustments = [
  {
    workerId: 11,
    workerName: "Worker A",
    ...resignedMidPeriod,
  },
  {
    workerId: 12,
    workerName: "Worker B",
    ...resolveWorkRecordEmploymentCoverage({
      coverageStartDate: "2026-04-01",
      coverageEndDate: "2026-04-30",
      joinedDateKey: "2026-04-10",
    }),
  },
];
const firstNote = buildWorkLogNoteWithEmploymentAdjustments({
  note: "월간 입력",
  adjustments,
});
assert.match(firstNote, /Worker A/);
assert.match(firstNote, /퇴사일 2026-04-15/);
assert.match(firstNote, /Worker B/);
assert.match(firstNote, /입사일 2026-04-10/);

const rebuiltNote = buildWorkLogNoteWithEmploymentAdjustments({
  note: firstNote,
  adjustments: [adjustments[0]],
});
assert.equal((rebuiltNote.match(/\[재직기간 자동 조정\]/g) || []).length, 1);
assert.doesNotMatch(rebuiltNote, /Worker B/);

console.log("work-record employment coverage tests passed");
