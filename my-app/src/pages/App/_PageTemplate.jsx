// src/pages/App/_PageTemplate.jsx
import React from 'react';

const PageTemplate = () => {
  return (
    <div className="page-wrapper">
      <header className="page-header">
        <h1 className="page-title">페이지 제목</h1>
        <div className="page-actions">
          {/* Action buttons go here */}
          <button className="btn btn-primary">액션 버튼</button>
        </div>
      </header>
      <main className="page-content">
        <section className="page-section">
          <h2>섹션 제목 1</h2>
          <p>여기에 섹션 내용이 들어갑니다.</p>
          {/* Example of a form group */}
          <div className="form-group">
            <label htmlFor="exampleInput" className="form-label">예시 입력</label>
            <input type="text" id="exampleInput" className="input-field" placeholder="텍스트를 입력하세요" />
          </div>
        </section>
        <section className="page-section">
          <h2>섹션 제목 2</h2>
          <p>다른 섹션 내용.</p>
          {/* Example of a data table */}
          <table className="data-table">
            <thead>
              <tr>
                <th>컬럼 1</th>
                <th>컬럼 2</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>데이터 1-1</td>
                <td>데이터 1-2</td>
              </tr>
              <tr>
                <td>데이터 2-1</td>
                <td>데이터 2-2</td>
              </tr>
            </tbody>
          </table>
          <div className="pagination">
            <button className="pagination-button">&laquo;</button>
            <button className="pagination-button active">1</button>
            <button className="pagination-button">2</button>
            <button className="pagination-button">&raquo;</button>
          </div>
        </section>
      </main>
    </div>
  );
};

export default PageTemplate;