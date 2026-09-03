import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, IconButton, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AppPageContainer from "../../components/AppPageContainer";
import { useAuth } from "../../context/AuthContext";
import { buildQueryString, requestJSON } from "../../utils/apiClient";
import { emitWorkspaceDataChanged, WORKSPACE_DATA_TOPICS } from "../../utils/workspaceDataEvents";

const toGradeDraft = (grade) => ({
  id: grade.id,
  nameKo: grade.nameKo || grade.name || "",
  nameEn: grade.nameEn || grade.name || "",
  nameVi: grade.nameVi || grade.name || "",
  sortOrder: String(grade.sortOrder ?? ""),
});
const EmployeeSystem = () => {
  const { activeOrgId } = useAuth();
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
    return row?.nameKo.trim() && row?.nameEn.trim() && row?.nameVi.trim() && Number(row?.sortOrder) > 0;
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
    try {
      await requestJSON(`/employee-grades/${grade.id}${buildQueryString({ orgId: activeOrgId })}`, { method: "DELETE" });
      await load();
    } catch (error) {
      setMessage({
        severity: "error",
        text: error?.message || "직급을 삭제하지 못했습니다.",
      });
    }
  };

  return (
    <AppPageContainer>
      <Box sx={{ p: 2, width: "100%" }}>
        <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
          <Typography variant="h5" fontWeight={700}>
            직원 체계
          </Typography>
          <Button variant="contained" sx={{ ml: "auto" }} disabled={!canSave || saving} onClick={save}>
            {saving ? "저장 중" : "저장"}
          </Button>
        </Box>
        {message && (
          <Alert severity={message.severity} onClose={() => setMessage(null)} sx={{ mb: 2 }}>
            {message.text}
          </Alert>
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
                      <IconButton color="error" disabled={grade.isDefault || saving || gradesChanged} onClick={() => removeGrade(grade)}>
                        <DeleteOutlineIcon />
                      </IconButton>
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
