import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { Box, Button, Chip, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useAppActions } from '../../../../context/AppContext';
import { useLanguage } from '../../../../context/LanguageContext';
import { requestJSON } from '../../../../utils/apiClient';

const TEXT = {
  ko: { title: '창고', description: '영문 기본명과 한글·베트남어 창고명을 관리합니다.', saveFactory: '공장을 먼저 저장하면 기본 창고가 생성됩니다.', name: '창고명 (영문)', nameKo: '창고명 (한글)', nameVi: '창고명 (베트남어)', add: '추가', default: '기본', setDefault: '기본 지정', error: '창고 정보를 저장하지 못했습니다.' },
  en: { title: 'Warehouses', description: 'Manage the primary English name and localized warehouse names.', saveFactory: 'Save the factory first to create the default warehouse.', name: 'Warehouse Name (English)', nameKo: 'Warehouse Name (Korean)', nameVi: 'Warehouse Name (Vietnamese)', add: 'Add', default: 'Default', setDefault: 'Set default', error: 'Failed to save warehouse information.' },
  vi: { title: 'Kho', description: 'Quản lý tên tiếng Anh chính và tên kho theo từng ngôn ngữ.', saveFactory: 'Lưu nhà máy trước để tạo kho mặc định.', name: 'Tên kho (Tiếng Anh)', nameKo: 'Tên kho (Tiếng Hàn)', nameVi: 'Tên kho (Tiếng Việt)', add: 'Thêm', default: 'Mặc định', setDefault: 'Đặt mặc định', error: 'Không thể lưu thông tin kho.' },
};

const buildDraft = (warehouse = {}) => ({
  name: warehouse.name || '',
  nameKo: warehouse.nameKo || '',
  nameVi: warehouse.nameVi || '',
});

const FactoryWarehouseSection = forwardRef(({ factoryId }, ref) => {
  const { languageCode } = useLanguage();
  const { showNotification } = useAppActions();
  const text = TEXT[languageCode] || TEXT.en;
  const [warehouses, setWarehouses] = useState([]);
  const [draftNames, setDraftNames] = useState({});
  const [newWarehouse, setNewWarehouse] = useState(buildDraft());
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(async () => {
    if (!factoryId) return;
    setLoading(true);
    try {
      const rows = await requestJSON(`/factories/${factoryId}/warehouses`);
      const safeRows = Array.isArray(rows) ? rows : [];
      setWarehouses(safeRows);
      setDraftNames(Object.fromEntries(safeRows.map((row) => [String(row.id), buildDraft(row)])));
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
        const draft = draftNames[String(warehouse.id)] || buildDraft();
        return String(draft.name).trim() && ['name', 'nameKo', 'nameVi'].some(
          (field) => String(draft[field] || '').trim() !== String(warehouse[field] || '')
        );
      });
      if (changedWarehouses.length === 0) return;
      try {
        await Promise.all(changedWarehouses.map((warehouse) => requestJSON(
          `/factories/${factoryId}/warehouses/${warehouse.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.fromEntries(
              ['name', 'nameKo', 'nameVi'].map((field) => [field, String(draftNames[String(warehouse.id)]?.[field] || '').trim()])
            )),
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
    const name = newWarehouse.name.trim();
    if (!name) return;
    setSavingId('new');
    try {
      await requestJSON(`/factories/${factoryId}/warehouses`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          name,
          nameKo: newWarehouse.nameKo.trim(),
          nameVi: newWarehouse.nameVi.trim(),
        }),
      });
      setNewWarehouse(buildDraft());
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
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ flex: 1, width: '100%' }}>
                {['name', 'nameKo', 'nameVi'].map((field) => (
                  <TextField
                    key={field} size="small" fullWidth required={field === 'name'} label={text[field]}
                    value={draftNames[String(warehouse.id)]?.[field] ?? ''}
                    onChange={(event) => setDraftNames((previous) => ({
                      ...previous,
                      [String(warehouse.id)]: { ...(previous[String(warehouse.id)] || buildDraft()), [field]: event.target.value },
                    }))}
                    disabled={savingId !== null}
                  />
                ))}
              </Stack>
              {warehouse.isDefault ? <Chip size="small" color="primary" label={text.default} /> : (
                <Button size="small" variant="outlined" disabled={savingId !== null || !warehouse.isActive} onClick={() => updateWarehouse(warehouse, { isDefault: true })}>{text.setDefault}</Button>
              )}
            </Stack>
          ))}
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
            {['name', 'nameKo', 'nameVi'].map((field) => (
              <TextField key={field} size="small" fullWidth required={field === 'name'} label={text[field]} value={newWarehouse[field]} onChange={(event) => setNewWarehouse((previous) => ({ ...previous, [field]: event.target.value }))} />
            ))}
            <Button variant="outlined" startIcon={<AddIcon />} disabled={!newWarehouse.name.trim() || savingId !== null} onClick={addWarehouse} sx={{ whiteSpace: 'nowrap', minWidth: 88 }}>{text.add}</Button>
          </Stack>
        </Stack>
      )}
    </Box>
  );
});

FactoryWarehouseSection.displayName = 'FactoryWarehouseSection';

export default FactoryWarehouseSection;
