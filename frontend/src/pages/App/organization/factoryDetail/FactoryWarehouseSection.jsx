import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { Box, Button, Chip, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useAppActions } from '../../../../context/AppContext';
import { useLanguage } from '../../../../context/LanguageContext';
import { requestJSON } from '../../../../utils/apiClient';

const TEXT = {
  ko: { title: '창고', description: '공장별 재고 보관 위치를 관리합니다.', saveFactory: '공장을 먼저 저장하면 기본 창고 1이 생성됩니다.', name: '창고명', add: '추가', default: '기본', setDefault: '기본 지정', error: '창고 정보를 저장하지 못했습니다.' },
  en: { title: 'Warehouses', description: 'Manage inventory storage locations for this factory.', saveFactory: 'Save the factory first to create the default Warehouse 1.', name: 'Warehouse name', add: 'Add', default: 'Default', setDefault: 'Set default', error: 'Failed to save warehouse information.' },
  vi: { title: 'Kho', description: 'Quan ly vi tri luu kho cua nha may.', saveFactory: 'Luu nha may truoc de tao Kho 1 mac dinh.', name: 'Ten kho', add: 'Them', default: 'Mac dinh', setDefault: 'Dat mac dinh', error: 'Khong the luu thong tin kho.' },
};

const FactoryWarehouseSection = forwardRef(({ factoryId }, ref) => {
  const { languageCode } = useLanguage();
  const { showNotification } = useAppActions();
  const text = TEXT[languageCode] || TEXT.en;
  const [warehouses, setWarehouses] = useState([]);
  const [draftNames, setDraftNames] = useState({});
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(async () => {
    if (!factoryId) return;
    setLoading(true);
    try {
      const rows = await requestJSON(`/factories/${factoryId}/warehouses`);
      const safeRows = Array.isArray(rows) ? rows : [];
      setWarehouses(safeRows);
      setDraftNames(Object.fromEntries(safeRows.map((row) => [String(row.id), row.name || ''])));
    } catch (error) {
      showNotification(error?.message || text.error, 'error');
    } finally {
      setLoading(false);
    }
  }, [factoryId, showNotification, text.error]);

  useEffect(() => { load(); }, [load]);

  const sortedWarehouses = useMemo(
    () => [...warehouses].sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || Number(right.isActive) - Number(left.isActive) || left.id - right.id),
    [warehouses]
  );

  useImperativeHandle(ref, () => ({
    saveChanges: async () => {
      const changedWarehouses = warehouses.filter((warehouse) => {
        const draftName = String(draftNames[String(warehouse.id)] || '').trim();
        return draftName && draftName !== warehouse.name;
      });
      if (changedWarehouses.length === 0) return;
      try {
        await Promise.all(changedWarehouses.map((warehouse) => requestJSON(
          `/factories/${factoryId}/warehouses/${warehouse.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: String(draftNames[String(warehouse.id)]).trim() }),
          }
        )));
      } catch (error) {
        showNotification(error?.message || text.error, 'error');
        throw error;
      }
    },
  }), [draftNames, factoryId, showNotification, text.error, warehouses]);

  const updateWarehouse = async (warehouse, changes) => {
    setSavingId(warehouse.id);
    try {
      await requestJSON(`/factories/${factoryId}/warehouses/${warehouse.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes),
      });
      await load();
    } catch (error) {
      showNotification(error?.message || text.error, 'error');
    } finally {
      setSavingId(null);
    }
  };

  const addWarehouse = async () => {
    const name = newName.trim();
    if (!name) return;
    setSavingId('new');
    try {
      await requestJSON(`/factories/${factoryId}/warehouses`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      });
      setNewName('');
      await load();
    } catch (error) {
      showNotification(error?.message || text.error, 'error');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{text.title}</Typography>
      <Typography variant="caption" color="text.secondary">{text.description}</Typography>
      {!factoryId ? (
        <Typography variant="body2" sx={{ mt: 2 }} color="text.secondary">{text.saveFactory}</Typography>
      ) : loading ? (
        <Box sx={{ py: 2, textAlign: 'center' }}><CircularProgress size={22} /></Box>
      ) : (
        <Stack spacing={1.25} sx={{ mt: 2 }}>
          {sortedWarehouses.map((warehouse) => (
            <Stack key={warehouse.id} direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
              <TextField
                size="small" fullWidth label={text.name}
                value={draftNames[String(warehouse.id)] ?? ''}
                onChange={(event) => setDraftNames((previous) => ({ ...previous, [String(warehouse.id)]: event.target.value }))}
                disabled={savingId !== null}
              />
              {warehouse.isDefault ? <Chip size="small" color="primary" label={text.default} /> : (
                <Button size="small" variant="outlined" disabled={savingId !== null || !warehouse.isActive} onClick={() => updateWarehouse(warehouse, { isDefault: true })}>{text.setDefault}</Button>
              )}
            </Stack>
          ))}
          <Stack direction="row" spacing={1}>
            <TextField size="small" fullWidth label={text.name} value={newName} onChange={(event) => setNewName(event.target.value)} />
            <Button variant="outlined" startIcon={<AddIcon />} disabled={!newName.trim() || savingId !== null} onClick={addWarehouse} sx={{ whiteSpace: 'nowrap', minWidth: 88 }}>{text.add}</Button>
          </Stack>
        </Stack>
      )}
    </Box>
  );
});

FactoryWarehouseSection.displayName = 'FactoryWarehouseSection';

export default FactoryWarehouseSection;
