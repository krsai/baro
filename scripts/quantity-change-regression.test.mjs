import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileBoardStateForQuantityChanges } from '../frontend/src/utils/quantityChangeBoard.mjs';

const calcProcessTotal = (processes, key, orderQuantity) => {
  const qty = Number(orderQuantity) > 0 ? Number(orderQuantity) : 1;
  return (Array.isArray(processes) ? processes : []).reduce((sum, process) => {
    const processQty = Number(process?.quantity) > 0 ? Number(process.quantity) : 1;
    if (key === 'at' && process?.atParams) {
      const a = Number(process.atParams.a);
      const b = Number(process.atParams.b);
      if (Number.isFinite(a) && Number.isFinite(b) && a >= 0 && b >= 0) {
        return sum + processQty * (a * qty + b);
      }
    }
    const value = Number(process?.[key]);
    if (!Number.isFinite(value) || value < 0) return sum;
    return sum + processQty * value * qty;
  }, 0);
};

test('changed assigned card is cancelled and rebuilt as unassigned with updated quantity', () => {
  const originId = 'ORDER-1::STYLE-1::RED::M';
  const result = reconcileBoardStateForQuantityChanges({
    currentCards: [
      {
        id: originId,
        originOrderId: originId,
        styleId: 'STYLE-1',
        quantity: 2,
        totalPt: 40,
        totalAt: 60,
        customer: 'Buyer A',
      },
    ],
    currentAssignments: [{ id: 'assign-1', cardId: originId, lineId: 'line-1' }],
    changedVariantIds: [originId],
    nextVariantMap: new Map([
      [
        originId,
        {
          styleId: 'STYLE-1',
          styleName: 'Style One',
          styleCode: 'S1',
          colorId: 'RED',
          colorName: 'Red',
          gender: 'M',
          quantity: 3,
        },
      ],
    ]),
    styleProcessSummaryById: new Map([
      [
        'STYLE-1',
        {
          processCount: 1,
          previewUrl: '',
          processes: [{ quantity: 2, pt: 10, atParams: { a: 5, b: 20 } }],
        },
      ],
    ]),
    orderId: 'ORDER-1',
    orderNumber: 'WO-001',
    customerName: 'Buyer A',
    calculateProcessTotalForOrderQuantity: calcProcessTotal,
  });

  assert.equal(result.cancelledAssignmentCount, 1);
  assert.equal(result.assignments.length, 0);
  assert.equal(result.cards.length, 1);
  assert.equal(result.cards[0].quantity, 3);
  assert.equal(result.cards[0].status, 'ST');
  assert.equal(result.cards[0].stTotalSeconds, 60);
  assert.equal(result.cards[0].totalPt, 60);
  assert.equal(result.cards[0].totalAt, 70);
  assert.equal(result.cards[0].cardStTotalSeconds, 60);
});

test('quantity zero removes the card entirely', () => {
  const originId = 'ORDER-2::STYLE-2::BLU::W';
  const result = reconcileBoardStateForQuantityChanges({
    currentCards: [{ id: originId, originOrderId: originId, quantity: 4 }],
    currentAssignments: [{ id: 'assign-2', cardId: originId }],
    changedVariantIds: [originId],
    nextVariantMap: new Map([[originId, { styleId: 'STYLE-2', quantity: 0 }]]),
    orderId: 'ORDER-2',
  });

  assert.equal(result.cancelledAssignmentCount, 1);
  assert.equal(result.assignments.length, 0);
  assert.equal(result.cards.length, 0);
});

test('delta cards for same order are removed while other order deltas remain', () => {
  const originId = 'ORDER-3::STYLE-3::GRN::U';
  const result = reconcileBoardStateForQuantityChanges({
    currentCards: [
      { id: 'delta-same', type: 'DELTA', workOrderId: 'ORDER-3', quantity: 1 },
      { id: 'delta-other', type: 'DELTA', workOrderId: 'ORDER-99', quantity: 1 },
      { id: originId, originOrderId: originId, quantity: 2, totalPt: 20, totalAt: 0 },
    ],
    currentAssignments: [],
    changedVariantIds: [originId],
    nextVariantMap: new Map([
      [
        originId,
        {
          styleId: 'STYLE-3',
          styleName: 'Style Three',
          styleCode: 'S3',
          colorId: 'GRN',
          colorName: 'Green',
          gender: 'U',
          quantity: 3,
        },
      ],
    ]),
    orderId: 'ORDER-3',
    orderNumber: 'WO-003',
    customerName: 'Buyer C',
  });

  const cardIds = result.cards.map((card) => card.id).sort();
  assert.deepEqual(cardIds, [originId, 'delta-other']);
  const rebuilt = result.cards.find((card) => card.id === originId);
  assert.equal(rebuilt.quantity, 3);
});
