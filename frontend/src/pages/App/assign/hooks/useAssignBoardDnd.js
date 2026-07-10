import { useCallback } from 'react';
import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { resolveCardCustomerDisplay } from '../utils/assignmentCard';

/**
 * AssignBoard의 드래그&드롭 sensors와 단순 핸들러를 관리하는 훅.
 * activeDrag state는 AssignBoard에서 관리하고, setActiveDrag를 주입받는다.
 *
 * cardsRef/assignmentsRef를 사용해 훅을 컴포넌트 상단(cardById/assignmentById 정의 전)에서
 * 호출할 수 있도록 설계. ref.current는 event handler 실행 시점에 항상 최신 값.
 *
 * handleDragEnd는 assignments, days, lineCapacityById 등에 깊이 의존하므로
 * AssignBoard.jsx에서 useCallback으로 관리.
 */
export const useAssignBoardDnd = ({
  persistReady,
  loading,
  cardsRef,
  assignmentsRef,
  setActiveDrag,
  languageCode = 'en',
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragStart = useCallback(
    (event) => {
      if (!persistReady || loading) return;
      const { active } = event;
      if (!active) return;
      const id = String(active.id);

      if (id.startsWith('card-')) {
        const cardId = id.replace('card-', '');
        const card = cardsRef.current.find((c) => c.id === cardId);
        if (card) {
          setActiveDrag({
            type: 'card',
            label: card.styleName,
            orderNo: card.orderNo,
            previewUrl: card.previewUrl,
            imageUrl: card.imageUrl,
            thumbnailUrl: card.thumbnailUrl,
            customer: resolveCardCustomerDisplay(card, languageCode),
          });
        }
        return;
      }

      if (id.startsWith('assign-')) {
        const assignmentId = id.replace('assign-', '');
        const assignment = assignmentsRef.current.find((a) => a.id === assignmentId);
        if (assignment) {
          setActiveDrag({
            type: 'assignment',
            label: assignment.label,
            customer: resolveCardCustomerDisplay(assignment, languageCode),
            orderNo: assignment.orderNo,
          });
        }
      }
    },
    [cardsRef, assignmentsRef, loading, persistReady, setActiveDrag, languageCode],
  );

  const handleDragCancel = useCallback(() => {
    setActiveDrag(null);
  }, [setActiveDrag]);

  return { sensors, handleDragStart, handleDragCancel };
};
