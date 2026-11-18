import React from 'react';
import { render, screen } from '@testing-library/react';
import QrCode from './QrCode';

// a 3 x 3 matrix: the middle row is dark
const modules = ['000', '111', '000'];

test('draws the matrix as an accessible SVG with the blank border readers need', () => {
  render(<QrCode size={3} modules={modules} label="QR code for shipment SHP-1" />);
  const svg = screen.getByRole('img', { name: 'QR code for shipment SHP-1' });
  expect(svg.getAttribute('viewBox')).toBe('0 0 11 11');             // 3 modules + 4 on each side
  expect(svg.querySelector('path').getAttribute('d')).toBe('M4 5h3v1h-3z'); // one merged run for the dark row
});

test('only numbers become drawing commands: text in the data is never rendered as markup', () => {
  render(<QrCode size={3} modules={['<s>', '111', '000']} />);
  expect(document.querySelector('script')).toBeNull();
  expect(screen.getByRole('img').querySelector('path').getAttribute('d')).toBe('M4 5h3v1h-3z');
});
