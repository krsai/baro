import test from 'node:test';
import assert from 'node:assert/strict';
import workRecordShared from '../backend/dist/work-records/workRecord.shared.js';

const { resolveWorkRecordResponseStyleName } = workRecordShared;

test('work record response keeps style name from the canonical relation', () => {
  assert.equal(
    resolveWorkRecordResponseStyleName({
      style: { name: 'AJ1979' },
      styleName: 'stale display value',
    }),
    'AJ1979'
  );
});

test('work record response keeps an already hydrated flat style name', () => {
  assert.equal(
    resolveWorkRecordResponseStyleName({ styleName: 'AJ1979' }),
    'AJ1979'
  );
});
