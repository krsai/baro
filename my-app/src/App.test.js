import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

test('renders login page on initial load', () => {
  render(
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
  
  // App should redirect to /login, so we expect to see the login page heading.
  const headingElement = screen.getByRole('heading', { name: /로그인/i });
  expect(headingElement).toBeInTheDocument();
});