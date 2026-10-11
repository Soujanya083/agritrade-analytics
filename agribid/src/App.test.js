import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

// Replaces the unmodified Create-React-App template test, which looked for a
// "learn react" link that never existed in this app (so it always failed).
// Heavy children are stubbed so this checks App's own routing/auth behaviour.
jest.mock('./components/Dashboard/DashboardPage', () => () => <div>DASHBOARD</div>);
jest.mock('./components/Hero/Hero', () => () => <div>HERO</div>);
jest.mock('./components/Features/Features', () => () => <div>FEATURES</div>);
jest.mock('./components/HowItWorks/HowItWorks', () => () => <div>HOWITWORKS</div>);
jest.mock('./components/Footer/Footer', () => () => <div>FOOTER</div>);
jest.mock('./components/Auth/LoginPage', () => () => <div>LOGIN</div>);
jest.mock('./components/Auth/SignupPage', () => () => <div>SIGNUP</div>);

beforeEach(() => localStorage.clear());

test('shows the landing page to a visitor who is not logged in', () => {
  render(<App />);
  expect(screen.getByText('HERO')).toBeInTheDocument();
  expect(screen.queryByText('DASHBOARD')).not.toBeInTheDocument();
});

test('goes straight to the dashboard when a session is stored', () => {
  localStorage.setItem('user', JSON.stringify({ id: 'u1', role: 'Farmer', fullName: 'Asha' }));
  render(<App />);
  expect(screen.getByText('DASHBOARD')).toBeInTheDocument();
});

test('a corrupt stored session is discarded instead of crashing', () => {
  localStorage.setItem('user', '{not json');
  localStorage.setItem('token', 'abc');
  render(<App />);
  expect(screen.getByText('HERO')).toBeInTheDocument();
  expect(localStorage.getItem('token')).toBeNull();
});

test('the call to action makes no unverifiable "thousands of users" claim', () => {
  render(<App />);
  expect(screen.queryByText(/thousands of farmers/i)).not.toBeInTheDocument();
});
