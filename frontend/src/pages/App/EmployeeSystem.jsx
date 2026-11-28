import ActionNotice from '../../components/ActionNotice';
import {employeeGradeText} from '../../constants/employeeGrade';
import {usePageDialogs} from '../../components/PageDialogProvider';
import { useLanguage } from '../../context/LanguageContext';
import { hasLocalizedName } from '../../utils/localizedName.mjs';
import DeleteActionButton from '../../components/DeleteActionButton';
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {Box,Button,IconButton,MenuItem,Paper,Stack,TextField,Tooltip,Typography} from '@mui/material';
import Alert from "../../components/AppNotice";
import AppPageContainer from "../../components/AppPageContainer";
import { useAuth } from "../../context/AuthContext";
import { buildQueryString, requestJSON } from "../../utils/apiClient";
import { emitWorkspaceDataChanged, WORKSPACE_DATA_TOPICS } from "../../utils/workspaceDataEvents";

const toGradeDraft = (grade) => ({
  id: grade.id,
  nameKo: grade.nameKo || "",
  nameEn: grade.nameEn || grade.name || "",
  nameVi: grade.nameVi || "",
  sortOrder: String(grade.sortOrder ?? ""),
});
const EmployeeSystem = () => {
  const { activeOrgId } = useAuth();
  const { languageCode } = useLanguage();
  const gradeText=employeeGradeText[languageCode]||employeeGradeText.en,dialogs=usePageDialogs(),deleteLock=useRef(false);
  const [sets, setSets] = useState([]);
  const [grades, setGrades] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [newGrade, setNewGrade] = useState({
    setId: "",
    code: "",
    nameKo: "",
    nameEn: "",
    nameVi: "",
    sortOrder: "",
  });

  const load = useCallback(async () => {
    if (!activeOrgId) return;
    try {
      const gradeRows = await requestJSON(`/employee-grades${buildQueryString({ orgId: activeOrgId })}`);
      const nextSets = Array.isArray(gradeRows) ? gradeRows : [];
      setSets(nextSets);
      setGrades(Object.fromEntries(nextSets.flatMap((set) => set.grades.map((grade) => [grade.id, toGradeDraft(grade)]))));
    } catch (error) {
      setMessage({
        severity: "error",
        text: error?.message || "직원 체계 정보를 불러오지 못했습니다.",
      });
    }
  }, [activeOrgId]);
  useEffect(() => {
    load();
  }, [load]);
  const activeSet = sets[0];
  useEffect(() => {
    if (activeSet && !newGrade.setId) setNewGrade((value) => ({ ...value, setId: String(activeSet.id) }));
  }, [activeSet, newGrade.setId]);

  const allGrades = useMemo(() => sets.flatMap((set) => set.grades || []), [sets]);
  const gradesChanged = allGrades.some((grade) => JSON.stringify(grades[grade.id]) !== JSON.stringify(toGradeDraft(grade)));
  const gradesValid = allGrades.every((grade) => {
    const row = grades[grade.id];
    return hasLocalizedName(row) && Number(row?.sortOrder) > 0;
  });
  const canSave = gradesChanged && gradesValid;

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      for (const set of sets)
        await requestJSON(`/employee-grade-sets/${set.id}/grades${buildQueryString({ orgId: activeOrgId })}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            grades: set.grades.map((grade) => ({
              ...grades[grade.id],
              sortOrder: Number(grades[grade.id].sortOrder),
            })),
          }),
        });
      await load();
      emitWorkspaceDataChanged({
        topics: [WORKSPACE_DATA_TOPICS.EMPLOYEES, WORKSPACE_DATA_TOPICS.SALARY_SYSTEM_SETTINGS],
        orgId: activeOrgId,
        source: "employee-grade-save",
      });
      setMessage({
        severity: "success",
        text: "직급 설정을 저장했습니다.",
      });
    } catch (error) {
      setMessage({
        severity: "error",
        text: error?.message || "저장하지 못했습니다.",
      });
    } finally {
      setSaving(false);
    }
  };
  const editGrade = (id, key, value) => setGrades((rows) => ({ ...rows, [id]: { ...rows[id], [key]: value } }));
  const addGrade = async () => {
    try {
      await requestJSON(`/employee-grades${buildQueryString({ orgId: activeOrgId })}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newGrade,
          setId: Number(newGrade.setId),
          sortOrder: Number(newGrade.sortOrder),
        }),
      });
      setNewGrade({
        setId: String(activeSet?.id || ""),
        code: "",
        nameKo: "",
        nameEn: "",
        nameVi: "",
        sortOrder: "",
      });
      await load();
    } catch (error) {
      setMessage({
        severity: "error",
        text: error?.message || "직급을 추가하지 못했습니다.",
      });
    }
  };
  const removeGrade = async (grade) => {
    if(deleteLock.current||saving||gradesChanged||grade.isDefault||grade._count?.employees>0)return;
    deleteLock.current=true;
    try {
      if(!await dialogs.confirm(gradeText.confirmDelete.replace('{name}',grade[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'nameEn']||grade.name||grade.code)))return;
      setSaving(true);
      await requestJSON(`/employee-grades/${grade.id}${buildQueryString({ orgId: activeOrgId })}`, { method: "DELETE" });
      await load();
    } catch (error) {
      setMessage({
        severity: "error",
        text: ({EMPLOYEE_GRADE_IN_USE:gradeText.inUse,EMPLOYEE_GRADE_DEFAULT:gradeText.defaultGrade,EMPLOYEE_GRADE_CHANGED:gradeText.changed,EMPLOYEE_GRADE_NOT_FOUND:gradeText.changed})[error?.message]||gradeText.failed,
      });
    } finally {
      deleteLock.current=false;
      setSaving(false);
    }
  };

  return (
    <AppPageContainer title="직원 체계" titleActions={
          <Button variant="contained" disabled={!canSave || saving} onClick={save}>
            {saving ? "저장 중" : "저장"}
          </Button>
    }>
      <Box sx={{ width: "100%" }}>

        {message && (
          <ActionNotice eventKey={message} severity={message.severity} onClose={() => setMessage(null)} sx={{ mb: 2 }}>
            {message.text}
          </ActionNotice>
        )}
        <>
            {sets.map((set) => (
              <Paper key={set.id} variant="outlined" sx={{ p: 3, mb: 2 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  직급 세트: {set.name} ({set.code})
                </Typography>
                <Stack spacing={1.25}>
                  {set.grades.map((grade) => (
                    <Box
                      key={grade.id}
                      sx={{
                        display: "grid",
                        gridTemplateColumns: "90px repeat(3, minmax(150px, 1fr)) 90px 44px",
                        gap: 1,
                        alignItems: "center",
                      }}
                    >
                      <TextField size="small" label="코드" value={grade.code} disabled />
                      <TextField size="small" label="직급명 (한국어)" value={grades[grade.id]?.nameKo || ""} onChange={(e) => editGrade(grade.id, "nameKo", e.target.value)} />
                      <TextField size="small" label="Grade name (English)" value={grades[grade.id]?.nameEn || ""} onChange={(e) => editGrade(grade.id, "nameEn", e.target.value)} />
                      <TextField size="small" label="Tên cấp bậc (Tiếng Việt)" value={grades[grade.id]?.nameVi || ""} onChange={(e) => editGrade(grade.id, "nameVi", e.target.value)} />
                      <TextField size="small" label="순서" type="number" value={grades[grade.id]?.sortOrder || ""} onChange={(e) => editGrade(grade.id, "sortOrder", e.target.value)} />
                      <Tooltip title={grade.isDefault?gradeText.defaultGrade:grade._count?.employees>0?gradeText.inUse:''}><span><DeleteActionButton data-grade-delete={grade.id} color="error" disabled={grade.isDefault || grade._count?.employees>0 || saving || gradesChanged} onClick={() => removeGrade(grade)} /></span></Tooltip>
                    </Box>
                  ))}
                </Stack>
              </Paper>
            ))}
            {activeSet && (
              <Paper variant="outlined" sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  직급 추가
                </Typography>
                <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                  <TextField select size="small" label="직급 세트" value={newGrade.setId} onChange={(e) => setNewGrade({ ...newGrade, setId: e.target.value })}>
                    {sets.map((set) => (
                      <MenuItem key={set.id} value={String(set.id)}>
                        {set.name}
                      </MenuItem>
                    ))}
                  </TextField>
                  {[
                    ["code", "코드"],
                    ["nameKo", "직급명 (한국어)"],
                    ["nameEn", "Grade name (English)"],
                    ["nameVi", "Tên cấp bậc (Tiếng Việt)"],
                    ["sortOrder", "순서"],
                  ].map(([key, label]) => (
                    <TextField
                      key={key}
                      size="small"
                      label={label}
                      type={key === "sortOrder" ? "number" : "text"}
                      value={newGrade[key]}
                      onChange={(e) =>
                        setNewGrade({
                          ...newGrade,
                          [key]: key === "code" ? e.target.value.toUpperCase() : e.target.value,
                        })
                      }
                    />
                  ))}
                  <Button variant="outlined" onClick={addGrade}>
                    추가
                  </Button>
                </Stack>
              </Paper>
            )}
        </>
      </Box>
    </AppPageContainer>
  );
};
export default EmployeeSystem;
