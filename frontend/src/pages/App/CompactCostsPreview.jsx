import React, { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Dialog, DialogContent, DialogTitle } from '@mui/material';
import MonthRangeSelector from '../../components/MonthRangeSelector';
import { useAppActions } from '../../context/AppContext';
import './compactCostsPreview.css';

const PARTNERS = ['Ms. Cuu', 'Ms. Nguyệt', 'DEX LOGIS', 'Nga', 'Thanh Phát', 'Viet Express'];
const SERVICES = ['단춧구멍', '단춧구멍', '물류·운송', '봉제', '포장·마감', '물류·운송'];
const ROWS = Array.from({ length: 32 }, (_, i) => ({
  id: i + 1, date: `2026-10-${String(28 - Math.floor(i / 2)).padStart(2, '0')}`,
  partner: PARTNERS[i % 6], service: SERVICES[i % 6], code: ['BTH', 'BTH', 'TRKV', 'SEW', 'PKG', 'TRKV'][i % 6],
  description: ['단춧구멍 작업', '허리 단춧구멍 작업', '원단 입고 운송', '부분 봉제 작업', '제품 포장 및 마감', '완제품 출하 운송'][i % 6],
  order: ['L17-1', 'D50', 'L16-4', 'L16-3'][i % 4], style: ['AM01160', 'SAN023', 'AM02058', 'AP1166'][i % 4],
  quantity: [850, 300, 1, 600, 1200, 2][i % 6], price: [3000, 300, 450000, 1500, 800, 380000][i % 6],
  creator: ['Trần Thanh Ly', 'Nguyễn Thị Hoa', '정동원'][i % 3], status: i % 5 === 0 ? '검토 대기' : '등록 완료',
}));
const money = value => new Intl.NumberFormat('vi-VN').format(value);

export default function CompactCostsPreview() {
  const { navigateToPath } = useAppActions();
  const [search, setSearch] = useState('');
  const [partner, setPartner] = useState('');
  const [service, setService] = useState('');
  const [status, setStatus] = useState('');
  const [start, setStart] = useState(dayjs('2026-10-01'));
  const [end, setEnd] = useState(dayjs('2026-10-31'));
  const [expanded, setExpanded] = useState(true);
  const [tab, setTab] = useState('detail');
  const [selected, setSelected] = useState(null);
  const [dense, setDense] = useState(true);
  const [checked, setChecked] = useState([]);
  const [sortAscending, setSortAscending] = useState(false);
  const filtered = useMemo(() => ROWS.filter(row =>
    row.date >= start.format('YYYY-MM-DD') && row.date <= end.format('YYYY-MM-DD') &&
    (!partner || row.partner === partner) && (!service || row.service === service) && (!status || row.status === status) &&
    [row.partner, row.description, row.order, row.style, row.code].join(' ').toLowerCase().includes(search.trim().toLowerCase())
  ).sort((a, b) => sortAscending ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)), [start, end, partner, service, status, search, sortAscending]);
  const total = filtered.reduce((sum, row) => sum + row.price * row.quantity, 0);
  const groups = useMemo(() => Object.values(filtered.reduce((acc, row) => {
    const key = tab === 'partner' ? row.partner : row.service;
    acc[key] ||= { name: key, count: 0, amount: 0 };
    acc[key].count++; acc[key].amount += row.price * row.quantity;
    return acc;
  }, {})), [filtered, tab]);
  const reset = () => { setSearch(''); setPartner(''); setService(''); setStatus(''); setStart(dayjs('2026-10-01')); setEnd(dayjs('2026-10-31')); setChecked([]); };
  const updateDate = setter => (value, context) => {
    if (!value?.isValid?.() || context?.validationError) return;
    if (setter === setStart && value.isAfter(end, 'day')) return;
    if (setter === setEnd && value.isBefore(start, 'day')) return;
    setter(value);
  };
  const shift = amount => { setStart(current => current.add(amount, 'month').startOf('month')); setEnd(current => current.add(amount, 'month').endOf('month')); };
  const toggle = id => setChecked(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  return <div className="compact-costs">
    <div className="cc-heading"><div><span className="cc-kicker">PRODUCTION / COST REQUESTS</span><h1>비용 신청 <span className="cc-preview">UI 미리보기</span></h1></div><button className="cc-button" onClick={() => navigateToPath('/outsourcing-record')}>기존 화면으로 ↗</button></div>
    <div className="cc-notice"><span className="cc-dot" />디자인 검토용 예시 데이터 · 검색, 기간 선택, 요약 탭과 행 상세를 직접 확인할 수 있습니다.</div>
    <section className="cc-panel" aria-label="조회 조건">
      <div className="cc-section-bar"><span><b>SEARCH</b><span className="cc-bar-divider">/</span> 비용 신청 조회</span><button onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>{expanded ? '조건 접기 ▴' : '조건 펼치기 ▾'}</button></div>
      <div className="cc-search-line"><div className="cc-search"><span aria-hidden="true">⌕</span><input aria-label="비용 검색" placeholder="업체 · 주문번호 · 스타일 · 내용 검색" value={search} onChange={event => setSearch(event.target.value)} /><kbd>검색</kbd></div><div className="cc-dates"><MonthRangeSelector monthOnly={false} startValue={start} endValue={end} onStartChange={updateDate(setStart)} onEndChange={updateDate(setEnd)} onShift={shift} slotProps={{ textField: { sx: { width: 140, minWidth: 140 } } }} /></div><button className="cc-button" onClick={reset} title="조회 조건 초기화">↺ 초기화</button></div>
      {expanded && <div className="cc-filter-grid">
        <label><span>업체</span><select value={partner} onChange={event => setPartner(event.target.value)}><option value="">전체 업체</option>{PARTNERS.map(value => <option key={value}>{value}</option>)}</select></label>
        <label><span>업종</span><select value={service} onChange={event => setService(event.target.value)}><option value="">전체 업종</option>{[...new Set(SERVICES)].map(value => <option key={value}>{value}</option>)}</select></label>
        <label><span>처리 상태</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="">전체 상태</option><option>등록 완료</option><option>검토 대기</option></select></label>
        <div className="cc-filter-info"><span>조회 기준</span><strong>거래일</strong><span className="cc-muted">· 통화 VND</span></div>
      </div>}
    </section>
    <div className="cc-totals"><span>조회 결과 <b>{filtered.length}</b>건</span><i /><span>업체 <b>{new Set(filtered.map(row => row.partner)).size}</b>곳</span><span>검토 대기 <b className="cc-amber">{filtered.filter(row => row.status === '검토 대기').length}</b>건</span><div className="cc-total-amount"><span>신청 금액 합계</span><strong>{money(total)}<small> VND</small></strong></div></div>
    <section className="cc-panel cc-results">
      <div className="cc-tabs" role="tablist" aria-label="조회 방식">{[['detail', '상세 내역'], ['partner', '업체별 요약'], ['service', '업종별 요약']].map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>)}<span>2026년 10월 예시</span></div>
      <div className="cc-grid-tools"><span>{tab === 'detail' ? `선택 ${checked.filter(id => filtered.some(row => row.id === id)).length}건` : '조회 조건에 따른 합계'}<span className="cc-muted"> · {tab === 'detail' ? '행을 클릭하면 상세 내역을 확인합니다' : '모든 금액은 VND 기준입니다'}</span></span><label><input type="checkbox" checked={dense} onChange={event => setDense(event.target.checked)} /> 촘촘하게</label></div>
      <div className={`cc-table-scroll ${dense ? 'is-dense' : ''}`}>
        {tab === 'detail' ? <table><thead><tr><th className="cc-check"><input type="checkbox" aria-label="조회 결과 전체 선택" checked={filtered.length > 0 && filtered.every(row => checked.includes(row.id))} onChange={event => setChecked(event.target.checked ? filtered.map(row => row.id) : [])} /></th><th>No.</th><th><button className="cc-sort" onClick={() => setSortAscending(value => !value)}>거래일 {sortAscending ? '↑' : '↓'}</button></th><th>업체</th><th>업종</th><th>코드</th><th>거래 내용</th><th>주문번호</th><th>스타일</th><th className="cc-number">수량</th><th className="cc-number">단가</th><th className="cc-number">금액 (VND)</th><th>입력자</th><th>상태</th></tr></thead><tbody>
          {filtered.map((row, index) => <tr key={row.id} onClick={() => setSelected(row)} className={checked.includes(row.id) ? 'is-selected' : ''}><td className="cc-check" onClick={event => event.stopPropagation()}><input type="checkbox" aria-label={`${row.id}번 선택`} checked={checked.includes(row.id)} onChange={() => toggle(row.id)} /></td><td className="cc-row-no">{index + 1}</td><td>{row.date}</td><td><button className="cc-cell-link" onClick={() => setSelected(row)}>{row.partner}</button></td><td>{row.service}</td><td><span className="cc-code">{row.code}</span></td><td><button className="cc-cell-link" onClick={() => setSelected(row)}>{row.description}</button></td><td>{row.order}</td><td>{row.style}</td><td className="cc-number">{money(row.quantity)}</td><td className="cc-number">{money(row.price)}</td><td className="cc-number cc-amount">{money(row.quantity * row.price)}</td><td>{row.creator}</td><td><span className={`cc-status ${row.status === '검토 대기' ? 'pending' : ''}`}>{row.status}</span></td></tr>)}
          {!filtered.length && <tr><td colSpan={14} className="cc-empty">조회 조건에 맞는 내역이 없습니다.</td></tr>}
        </tbody></table> : <table className="cc-summary"><thead><tr><th>{tab === 'partner' ? '업체' : '업종'}</th><th className="cc-number">신청 건수</th><th className="cc-number">금액 (VND)</th><th>금액 비중</th></tr></thead><tbody>{groups.map(group => <tr key={group.name}><td>{group.name}</td><td className="cc-number">{group.count}</td><td className="cc-number cc-amount">{money(group.amount)}</td><td><div className="cc-share"><span><i style={{ width: `${total ? group.amount / total * 100 : 0}%` }} /></span>{total ? (group.amount / total * 100).toFixed(1) : 0}%</div></td></tr>)}{!groups.length && <tr><td colSpan={4} className="cc-empty">조회 조건에 맞는 내역이 없습니다.</td></tr>}</tbody></table>}
      </div>
      <div className="cc-footer"><span>{filtered.length ? `1–${filtered.length}` : '0'} / {filtered.length}건 <span className="cc-muted">· 전체 조회</span></span><span>예시 데이터 · 저장되지 않음</span><span>BARO GARMENT</span></div>
    </section>
    <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} fullWidth maxWidth="sm"><DialogTitle>비용 신청 상세 · 예시 <button className="cc-button" style={{ float: 'right' }} onClick={() => setSelected(null)}>닫기</button></DialogTitle><DialogContent>{selected && <dl className="cc-detail">{[['거래일', selected.date], ['업체', selected.partner], ['거래 내용', selected.description], ['주문 / 스타일', `${selected.order} / ${selected.style}`], ['수량 × 단가', `${money(selected.quantity)} × ${money(selected.price)}`], ['금액', `${money(selected.quantity * selected.price)} VND`], ['입력자', selected.creator]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}</DialogContent></Dialog>
  </div>;
}
