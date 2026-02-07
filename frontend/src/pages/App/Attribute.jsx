import React from 'react';
import { Routes, Route } from 'react-router-dom';
import AttrBoard from './attribute/AttrBoard';

/**
 * 속성 관리 (Attribute Management) 도메인 진입점
 * - 역할: 라우팅 설정 (Board vs Detail)
 * - 규칙: agent.md 6.1 Board / Detail 화면 구조 규칙
 */
const Attribute = () => {
  return (
    <Routes>
      {/* 기본 경로: 속성 목록 및 탭 화면 (Board) */}
      <Route path="/" element={<AttrBoard />} />
    </Routes>
  );
};

export default Attribute;
