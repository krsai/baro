import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { matchesAutocompleteSearch } from '../frontend/src/utils/autocompleteSearch.js';

const [page, statuses] = await Promise.all([
  readFile(new URL('../frontend/src/pages/App/order/OrderList.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/constants/orderStatus.js', import.meta.url), 'utf8'),
]);

test('order row style search matches style code/name only, not the shared customer name', () => {
  // availableStyleOptions is already narrowed to the order's one buyer, so
  // every candidate option shares the same option.customer value. The
  // default SearchableSelect filter matches against every primitive field on
  // the option object, so typing part of the customer name (e.g. "SAN"
  // matching "THE SAN") matched every style and made the filter look broken.
  // filterStyleAutocompleteOptions strips the option down to name/styleCode
  // before matching - reproduce that stripping here directly.
  const styleOption = { id: 3, name: 'AM01622', styleCode: 'AM01622', customer: 'THE SAN' };
  const matchesNarrowed = (option, inputValue) =>
    matchesAutocompleteSearch(
      { name: option.name, styleCode: option.styleCode },
      inputValue,
      (candidate) => candidate?.name || ''
    );
  assert.equal(matchesNarrowed(styleOption, 'SAN'), false);
  assert.equal(matchesNarrowed(styleOption, 'AM01622'), true);
  assert.equal(matchesNarrowed(styleOption, '01622'), true);

  // Also guard the actual wiring: both the vertical and horizontal order
  // detail layouts render a style SearchableSelect off availableStyleOptions,
  // and both must pass the narrowed filter, or this fix silently regresses
  // for whichever layout is currently rendered.
  const styleSelectBlocks = [...page.matchAll(/<SearchableSelect\s[\s\S]*?\/>/g)]
    .map((match) => match[0])
    .filter((block) => block.includes('options={availableStyleOptions}'));
  assert.equal(styleSelectBlocks.length, 2);
  styleSelectBlocks.forEach((block) => {
    assert.match(block, /filterOptions=\{filterStyleAutocompleteOptions\}/);
  });
});

test('order list exposes only all, in-progress, and completed filters', () => {
  assert.match(page, /ORDER_FILTER_ALL/);
  assert.match(page, /ORDER_FILTER_IN_PROGRESS/);
  assert.match(page, /ORDER_FILTER_COMPLETED/);
  assert.match(statuses, /filterInProgressLabel/);
  assert.match(statuses, /filterCompletedLabel/);
  assert.doesNotMatch(page, /ORDER_FILTER_EXCEPT_DONE|ORDER_STATUS_OPTIONS\.map\(\(option\) => \(\{/);
});

test('order list does not filter by a date or month range', () => {
  assert.doesNotMatch(page, /MonthRangeSelector|dueDateFilterStart|dueDateFilterEnd|shiftDueDateFilterMonth/);
});
