import React, { useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import AppPageContainer from '../../../components/AppPageContainer';
import SearchInput from '../../../components/SearchInput';

const INVENTORY_MOVEMENT_TYPES = [
  { value: 'INBOUND_CUSTOMER', label: '고객 입고(+)' },
  { value: 'ISSUE_TO_LINE', label: '라인 불출(-)' },
  { value: 'ADJUSTMENT', label: '운영자 조정(+/-)' },
];

const STOCK_MOVEMENT_DIRECTION = {
  INBOUND_CUSTOMER: 1,
  ISSUE_TO_LINE: -1,
  ADJUSTMENT: 1,
};

const INITIAL_ITEMS = [
  {
    id: 101,
    category: '원단',
    name: 'YS001',
    code: 'FAB-YS001',
    spec: '58"',
    color: 'BLACK',
    unit: 'yd',
    stockQty: 320,
  },
  {
    id: 102,
    category: '부자재',
    name: '스냅',
    code: 'SNAP-10',
    spec: '10mm',
    color: 'NICKEL',
    unit: 'ea',
    stockQty: 2800,
  },
  {
    id: 103,
    category: '부자재',
    name: '스냅',
    code: 'SNAP-15',
    spec: '15mm',
    color: 'NICKEL',
    unit: 'ea',
    stockQty: 1900,
  },
];

const INITIAL_MOVEMENTS = [
  {
    id: 'm1',
    type: 'INBOUND_CUSTOMER',
    itemId: 101,
    quantity: 120,
    counterpart: '고객 A',
    reason: '',
    createdAt: '2026-03-05 09:20',
  },
  {
    id: 'm2',
    type: 'ISSUE_TO_LINE',
    itemId: 101,
    quantity: -75,
    counterpart: '라인 2',
    reason: '',
    createdAt: '2026-03-05 10:30',
  },
];

const INITIAL_TRANSFERS = [
  {
    id: 't1',
    fromFactory: '서울 1공장',
    toFactory: '부산 2공장',
    itemId: 102,
    sentQty: 300,
    receivedQty: 290,
    deltaReason: '검수 중 10개 불량 확인',
  },
];

const INITIAL_BOM_ROWS = [
  {
    id: 'b1',
    styleCode: 'ST-2408',
    componentItemId: 102,
    finishedQty: 500,
    bomPerUnit: 2,
    actualUsage: 1030,
    deltaReason: '',
    reviewed: false,
  },
  {
    id: 'b2',
    styleCode: 'ST-2409',
    componentItemId: 103,
    finishedQty: 260,
    bomPerUnit: 1,
    actualUsage: 260,
    deltaReason: '',
    reviewed: true,
  },
];

const normalizeText = (value) => String(value || '').trim().toLowerCase();
const tokenize = (value) =>
  normalizeText(value)
    .split(/\s+/)
    .filter(Boolean);

const buildItemSearchText = (item) =>
  [
    item?.category,
    item?.name,
    item?.code,
    item?.spec,
    item?.color,
    `${item?.category || ''}${item?.name || ''}`,
  ]
    .map((part) => normalizeText(part))
    .join(' ');

const resolveNowLabel = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
};

const emptyQuickCreate = {
  category: '',
  name: '',
  code: '',
  spec: '',
  color: '',
  unit: '',
};

const InventoryBoard = () => {
  const [items, setItems] = useState(INITIAL_ITEMS);
  const [movements, setMovements] = useState(INITIAL_MOVEMENTS);
  const [transfers, setTransfers] = useState(INITIAL_TRANSFERS);
  const [bomRows, setBomRows] = useState(INITIAL_BOM_ROWS);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedItemId, setSelectedItemId] = useState(INITIAL_ITEMS[0]?.id || null);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateDraft, setQuickCreateDraft] = useState(emptyQuickCreate);
  const [movementDraft, setMovementDraft] = useState({
    type: INVENTORY_MOVEMENT_TYPES[0].value,
    quantity: '',
    counterpart: '',
    reason: '',
  });
  const [transferDraft, setTransferDraft] = useState({
    fromFactory: '',
    toFactory: '',
    itemId: '',
    sentQty: '',
    receivedQty: '',
    deltaReason: '',
  });

  const itemById = useMemo(
    () =>
      items.reduce((map, item) => {
        map.set(Number(item.id), item);
        return map;
      }, new Map()),
    [items]
  );

  const filteredItems = useMemo(() => {
    const tokens = tokenize(searchKeyword);
    if (tokens.length === 0) return items;
    return items.filter((item) => {
      const text = buildItemSearchText(item);
      return tokens.every((token) => text.includes(token));
    });
  }, [items, searchKeyword]);

  const selectedItem = itemById.get(Number(selectedItemId)) || null;
  const searchHasNoResult = tokenize(searchKeyword).length > 0 && filteredItems.length === 0;

  const handleQuickCreateSave = () => {
    const category = quickCreateDraft.category.trim();
    const name = quickCreateDraft.name.trim();
    const unit = quickCreateDraft.unit.trim();
    if (!category || !name || !unit) return;

    const newItem = {
      id: Date.now(),
      category,
      name,
      code: quickCreateDraft.code.trim() || `ITEM-${String(Date.now()).slice(-6)}`,
      spec: quickCreateDraft.spec.trim(),
      color: quickCreateDraft.color.trim(),
      unit,
      stockQty: 0,
    };
    setItems((prev) => [newItem, ...prev]);
    setSelectedItemId(newItem.id);
    setQuickCreateDraft(emptyQuickCreate);
    setQuickCreateOpen(false);
    setSearchKeyword(`${newItem.category} ${newItem.name}`.trim());
  };

  const handleAddMovement = () => {
    if (!selectedItem) return;
    const qty = Number(movementDraft.quantity);
    if (!Number.isFinite(qty)) return;

    const isAdjustment = movementDraft.type === 'ADJUSTMENT';
    if (isAdjustment && qty === 0) return;
    if (!isAdjustment && qty <= 0) return;

    const direction = STOCK_MOVEMENT_DIRECTION[movementDraft.type] || 1;
    const signedQty = isAdjustment
      ? qty
      : direction === -1
        ? -Math.abs(qty)
        : Math.abs(qty);
    const nextMovement = {
      id: `m-${Date.now()}`,
      type: movementDraft.type,
      itemId: selectedItem.id,
      quantity: signedQty,
      counterpart: movementDraft.counterpart.trim(),
      reason: movementDraft.reason.trim(),
      createdAt: resolveNowLabel(),
    };
    setMovements((prev) => [nextMovement, ...prev]);
    setMovementDraft((prev) => ({
      ...prev,
      quantity: '',
      counterpart: '',
      reason: '',
    }));
  };

  const handleAddTransfer = () => {
    const itemId = Number(transferDraft.itemId);
    const sentQty = Number(transferDraft.sentQty);
    const receivedQty = Number(transferDraft.receivedQty);
    if (!itemById.has(itemId)) return;
    if (!Number.isFinite(sentQty) || sentQty < 0) return;
    if (!Number.isFinite(receivedQty) || receivedQty < 0) return;

    const nextTransfer = {
      id: `t-${Date.now()}`,
      fromFactory: transferDraft.fromFactory.trim(),
      toFactory: transferDraft.toFactory.trim(),
      itemId,
      sentQty,
      receivedQty,
      deltaReason: transferDraft.deltaReason.trim(),
    };
    setTransfers((prev) => [nextTransfer, ...prev]);
    setTransferDraft({
      fromFactory: '',
      toFactory: '',
      itemId: '',
      sentQty: '',
      receivedQty: '',
      deltaReason: '',
    });
  };

  const handleBomReasonChange = (rowId, value) => {
    setBomRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, deltaReason: value } : row))
    );
  };

  const handleBomReviewToggle = (rowId) => {
    setBomRows((prev) =>
      prev.map((row) =>
        row.id === rowId ? { ...row, reviewed: !row.reviewed } : row
      )
    );
  };

  const header = (
    <Stack spacing={1}>
      <Typography variant="h6">재고 관리 (UI 시안)</Typography>
      <Typography variant="body2" color="text.secondary">
        품목 FK 기반 거래를 전제로 한 화면 구조입니다. 현재 단계에서는 저장/비교를 로컬 상태로만 동작시킵니다.
      </Typography>
    </Stack>
  );

  return (
    <AppPageContainer header={header}>
      <Stack spacing={2}>
        <Card variant="outlined">
          <CardHeader
            title="통합 품목 검색 + 빠른 등록"
            subheader="종류/품목명/코드/규격/색상을 단일 입력에서 토큰 단위로 부분 검색"
          />
          <CardContent>
            <Stack spacing={1.5}>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <SearchInput
                  value={searchKeyword}
                  onChange={(event) => setSearchKeyword(event.target.value)}
                  placeholder="예: 원단 YS, 스냅 10, 지퍼 블랙"
                  sx={{ width: { xs: '100%', md: 420 } }}
                />
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => setQuickCreateOpen(true)}
                >
                  품목 빠른 등록
                </Button>
                <Chip label={`검색 결과 ${filteredItems.length}건`} size="small" />
              </Box>

              {searchHasNoResult && (
                <Alert
                  severity="info"
                  action={
                    <Button
                      color="inherit"
                      size="small"
                      onClick={() => setQuickCreateOpen(true)}
                    >
                      바로 등록
                    </Button>
                  }
                >
                  검색 결과가 없습니다. 화면 이동 없이 신규 품목을 등록해 바로 사용할 수 있습니다.
                </Alert>
              )}

              <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>품목</TableCell>
                      <TableCell>분류</TableCell>
                      <TableCell>코드</TableCell>
                      <TableCell>규격</TableCell>
                      <TableCell>색상</TableCell>
                      <TableCell>단위</TableCell>
                      <TableCell align="right">현재고(샘플)</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredItems.map((item) => (
                      <TableRow
                        key={item.id}
                        hover
                        selected={Number(selectedItemId) === Number(item.id)}
                        onClick={() => setSelectedItemId(item.id)}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell>{item.name || '-'}</TableCell>
                        <TableCell>{item.category || '-'}</TableCell>
                        <TableCell>{item.code || '-'}</TableCell>
                        <TableCell>{item.spec || '-'}</TableCell>
                        <TableCell>{item.color || '-'}</TableCell>
                        <TableCell>{item.unit || '-'}</TableCell>
                        <TableCell align="right">{Number(item.stockQty || 0).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                    {filteredItems.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} align="center">
                          조회된 품목이 없습니다.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Paper>
            </Stack>
          </CardContent>
        </Card>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', xl: '1fr 1fr' },
            gap: 2,
          }}
        >
          <Card variant="outlined">
            <CardHeader
              title="입고/불출 기록 (UI)"
              subheader="고객 입고, 라인 불출, 조정을 하나의 입력 흐름으로 기록"
            />
            <CardContent>
              <Stack spacing={1.5}>
                <Autocomplete
                  options={items}
                  value={selectedItem}
                  onChange={(_event, value) => setSelectedItemId(value?.id || null)}
                  getOptionLabel={(option) =>
                    `${option.category || ''} ${option.name || ''} ${option.spec || ''} ${
                      option.color || ''
                    }`.trim()
                  }
                  renderInput={(params) => <TextField {...params} label="품목(FK)" size="small" />}
                />
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                  <TextField
                    select
                    size="small"
                    label="거래 유형"
                    value={movementDraft.type}
                    onChange={(event) =>
                      setMovementDraft((prev) => ({ ...prev, type: event.target.value }))
                    }
                  >
                    {INVENTORY_MOVEMENT_TYPES.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    size="small"
                    label="수량"
                    type="number"
                    value={movementDraft.quantity}
                    onChange={(event) =>
                      setMovementDraft((prev) => ({ ...prev, quantity: event.target.value }))
                    }
                  />
                  <TextField
                    size="small"
                    label="상대(고객/라인)"
                    value={movementDraft.counterpart}
                    onChange={(event) =>
                      setMovementDraft((prev) => ({ ...prev, counterpart: event.target.value }))
                    }
                  />
                  <TextField
                    size="small"
                    label="사유(선택)"
                    value={movementDraft.reason}
                    onChange={(event) =>
                      setMovementDraft((prev) => ({ ...prev, reason: event.target.value }))
                    }
                  />
                </Box>
                <Box>
                  <Button variant="contained" onClick={handleAddMovement} disabled={!selectedItem}>
                    입력 행 추가
                  </Button>
                </Box>
                <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>일시</TableCell>
                        <TableCell>유형</TableCell>
                        <TableCell>품목</TableCell>
                        <TableCell>상대</TableCell>
                        <TableCell align="right">수량</TableCell>
                        <TableCell>사유</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {movements.map((row) => {
                        const item = itemById.get(Number(row.itemId));
                        return (
                          <TableRow key={row.id}>
                            <TableCell>{row.createdAt}</TableCell>
                            <TableCell>
                              {INVENTORY_MOVEMENT_TYPES.find((type) => type.value === row.type)?.label ||
                                row.type}
                            </TableCell>
                            <TableCell>{item ? `${item.category} ${item.name}` : '-'}</TableCell>
                            <TableCell>{row.counterpart || '-'}</TableCell>
                            <TableCell
                              align="right"
                              sx={{ color: row.quantity < 0 ? 'error.main' : 'success.main' }}
                            >
                              {row.quantity < 0 ? '' : '+'}
                              {Number(row.quantity || 0).toLocaleString()}
                            </TableCell>
                            <TableCell>{row.reason || '-'}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Paper>
              </Stack>
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardHeader
              title="공장 간 이동 기록 (UI)"
              subheader="송신/수신 수량 차이를 즉시 표시하고, 불일치 시 사유를 기록"
              avatar={<LocalShippingIcon color="action" />}
            />
            <CardContent>
              <Stack spacing={1.5}>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                  <TextField
                    size="small"
                    label="보내는 공장"
                    value={transferDraft.fromFactory}
                    onChange={(event) =>
                      setTransferDraft((prev) => ({ ...prev, fromFactory: event.target.value }))
                    }
                  />
                  <TextField
                    size="small"
                    label="받는 공장"
                    value={transferDraft.toFactory}
                    onChange={(event) =>
                      setTransferDraft((prev) => ({ ...prev, toFactory: event.target.value }))
                    }
                  />
                  <TextField
                    select
                    size="small"
                    label="품목(FK)"
                    value={transferDraft.itemId}
                    onChange={(event) =>
                      setTransferDraft((prev) => ({ ...prev, itemId: event.target.value }))
                    }
                  >
                    {items.map((item) => (
                      <MenuItem key={item.id} value={item.id}>
                        {`${item.category} ${item.name} ${item.spec || ''}`.trim()}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    size="small"
                    label="송신 수량"
                    type="number"
                    value={transferDraft.sentQty}
                    onChange={(event) =>
                      setTransferDraft((prev) => ({ ...prev, sentQty: event.target.value }))
                    }
                  />
                  <TextField
                    size="small"
                    label="수신 수량"
                    type="number"
                    value={transferDraft.receivedQty}
                    onChange={(event) =>
                      setTransferDraft((prev) => ({ ...prev, receivedQty: event.target.value }))
                    }
                  />
                  <TextField
                    size="small"
                    label="불일치 사유"
                    value={transferDraft.deltaReason}
                    onChange={(event) =>
                      setTransferDraft((prev) => ({ ...prev, deltaReason: event.target.value }))
                    }
                  />
                </Box>
                <Box>
                  <Button
                    variant="contained"
                    startIcon={<CompareArrowsIcon />}
                    onClick={handleAddTransfer}
                  >
                    이동 기록 추가
                  </Button>
                </Box>

                <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>경로</TableCell>
                        <TableCell>품목</TableCell>
                        <TableCell align="right">송신</TableCell>
                        <TableCell align="right">수신</TableCell>
                        <TableCell align="right">차이</TableCell>
                        <TableCell>상태</TableCell>
                        <TableCell>사유</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {transfers.map((row) => {
                        const delta = Number(row.receivedQty || 0) - Number(row.sentQty || 0);
                        const mismatch = delta !== 0;
                        const item = itemById.get(Number(row.itemId));
                        return (
                          <TableRow key={row.id} sx={mismatch ? { bgcolor: '#fff6f5' } : undefined}>
                            <TableCell>{`${row.fromFactory || '-'} -> ${row.toFactory || '-'}`}</TableCell>
                            <TableCell>{item ? `${item.category} ${item.name}` : '-'}</TableCell>
                            <TableCell align="right">{Number(row.sentQty || 0).toLocaleString()}</TableCell>
                            <TableCell align="right">{Number(row.receivedQty || 0).toLocaleString()}</TableCell>
                            <TableCell
                              align="right"
                              sx={{ color: mismatch ? 'error.main' : 'success.main' }}
                            >
                              {delta > 0 ? '+' : ''}
                              {delta.toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <Chip
                                size="small"
                                label={mismatch ? 'MISMATCH' : 'CONFIRMED'}
                                color={mismatch ? 'error' : 'success'}
                              />
                            </TableCell>
                            <TableCell>{row.deltaReason || '-'}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Paper>
              </Stack>
            </CardContent>
          </Card>
        </Box>

        <Card variant="outlined">
          <CardHeader
            title="BOM 예상 소모 vs 실제 변동 비교 (UI)"
            subheader="현재는 작업 완료 도메인 부재로 임시 검토 상태만 제공"
          />
          <CardContent>
            <Stack spacing={1.5}>
              <Alert severity="warning">
                이 영역은 화면/검토 흐름만 구현되었습니다. 백엔드 확정 전까지는 계산/저장 기준이 로컬 상태입니다.
              </Alert>
              <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>스타일</TableCell>
                      <TableCell>부품 품목(FK)</TableCell>
                      <TableCell align="right">완성품 수량</TableCell>
                      <TableCell align="right">BOM 소요</TableCell>
                      <TableCell align="right">예상 소모</TableCell>
                      <TableCell align="right">실제 변동</TableCell>
                      <TableCell align="right">차이</TableCell>
                      <TableCell>사유</TableCell>
                      <TableCell>검토</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {bomRows.map((row) => {
                      const expectedQty = Number(row.finishedQty || 0) * Number(row.bomPerUnit || 0);
                      const actualQty = Number(row.actualUsage || 0);
                      const delta = actualQty - expectedQty;
                      const mismatch = delta !== 0;
                      const item = itemById.get(Number(row.componentItemId));
                      return (
                        <TableRow key={row.id} sx={mismatch ? { bgcolor: '#fffaf2' } : undefined}>
                          <TableCell>{row.styleCode || '-'}</TableCell>
                          <TableCell>{item ? `${item.category} ${item.name}` : '-'}</TableCell>
                          <TableCell align="right">
                            {Number(row.finishedQty || 0).toLocaleString()}
                          </TableCell>
                          <TableCell align="right">{Number(row.bomPerUnit || 0).toLocaleString()}</TableCell>
                          <TableCell align="right">{expectedQty.toLocaleString()}</TableCell>
                          <TableCell align="right">{actualQty.toLocaleString()}</TableCell>
                          <TableCell
                            align="right"
                            sx={{ color: mismatch ? 'error.main' : 'success.main' }}
                          >
                            {delta > 0 ? '+' : ''}
                            {delta.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <TextField
                              size="small"
                              placeholder={mismatch ? '차이 사유 입력' : '-'}
                              value={row.deltaReason}
                              onChange={(event) =>
                                handleBomReasonChange(row.id, event.target.value)
                              }
                              disabled={!mismatch}
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              variant={row.reviewed ? 'contained' : 'outlined'}
                              color={row.reviewed ? 'success' : 'primary'}
                              size="small"
                              onClick={() => handleBomReviewToggle(row.id)}
                              disabled={mismatch && !row.deltaReason.trim()}
                            >
                              {row.reviewed ? '검토완료' : '검토대기'}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Paper>
            </Stack>
          </CardContent>
        </Card>
      </Stack>

      <Dialog open={quickCreateOpen} onClose={() => setQuickCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>품목 빠른 등록</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <TextField
              size="small"
              label="종류"
              value={quickCreateDraft.category}
              onChange={(event) =>
                setQuickCreateDraft((prev) => ({ ...prev, category: event.target.value }))
              }
              placeholder="예: 원단, 부자재"
              required
            />
            <TextField
              size="small"
              label="품목명"
              value={quickCreateDraft.name}
              onChange={(event) =>
                setQuickCreateDraft((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="예: YS001, 스냅"
              required
            />
            <TextField
              size="small"
              label="코드(선택)"
              value={quickCreateDraft.code}
              onChange={(event) =>
                setQuickCreateDraft((prev) => ({ ...prev, code: event.target.value }))
              }
            />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
              <TextField
                size="small"
                label="규격(선택)"
                value={quickCreateDraft.spec}
                onChange={(event) =>
                  setQuickCreateDraft((prev) => ({ ...prev, spec: event.target.value }))
                }
              />
              <TextField
                size="small"
                label="색상(선택)"
                value={quickCreateDraft.color}
                onChange={(event) =>
                  setQuickCreateDraft((prev) => ({ ...prev, color: event.target.value }))
                }
              />
            </Box>
            <TextField
              size="small"
              label="단위"
              value={quickCreateDraft.unit}
              onChange={(event) =>
                setQuickCreateDraft((prev) => ({ ...prev, unit: event.target.value }))
              }
              placeholder="예: yd, m, ea"
              required
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setQuickCreateOpen(false)}>닫기</Button>
          <Button
            variant="contained"
            onClick={handleQuickCreateSave}
            disabled={
              !quickCreateDraft.category.trim() ||
              !quickCreateDraft.name.trim() ||
              !quickCreateDraft.unit.trim()
            }
          >
            저장
          </Button>
        </DialogActions>
      </Dialog>
    </AppPageContainer>
  );
};

export default InventoryBoard;
