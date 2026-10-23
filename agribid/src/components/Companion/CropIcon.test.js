import React from 'react';
import { render, screen } from '@testing-library/react';
import CropIcon, { ICON_KINDS } from './CropIcon';
import { CROPS, findCrop } from '../../data/companionPlanting';

test('an emoji crop renders its emoji with an accessible name', () => {
  render(<CropIcon crop={findCrop('Mango')} />);
  expect(screen.getByRole('img', { name: 'Mango' }).textContent).toBe('🥭');
});

test('a drawn crop renders its own SVG illustration', () => {
  render(<CropIcon crop={findCrop('Wheat')} />);
  const svg = screen.getByRole('img', { name: 'Wheat illustration' });
  expect(svg.tagName.toLowerCase()).toBe('svg');
  expect(svg.querySelectorAll('ellipse,path,circle').length).toBeGreaterThan(5);
});

test('size is respected for mobile and desktop layouts', () => {
  render(<CropIcon crop={findCrop('Wheat')} size={40} />);
  const svg = screen.getByRole('img', { name: 'Wheat illustration' });
  expect(svg.getAttribute('width')).toBe('40');
  expect(svg.getAttribute('height')).toBe('40');
});

test('fallback: a crop with no icon shows a lettered badge instead of breaking', () => {
  render(<CropIcon crop={{ name: 'Quinoa', icon: null }} />);
  expect(screen.getByRole('img', { name: 'Quinoa' }).textContent).toBe('Q');
});

test('fallback: an unknown drawing kind shows a lettered badge', () => {
  render(<CropIcon crop={{ name: 'Teff', icon: { type: 'svg', kind: 'does-not-exist' } }} />);
  expect(screen.getByRole('img', { name: 'Teff' }).textContent).toBe('T');
});

test('fallback: no crop at all shows a question mark', () => {
  render(<CropIcon crop={null} />);
  expect(screen.getByRole('img', { name: 'Unknown crop' }).textContent).toBe('?');
});

test('every drawing kind used by the catalog exists, and every crop renders a distinct icon', () => {
  const kinds = new Set(CROPS.filter((c) => c.icon.type === 'svg').map((c) => c.icon.kind));
  kinds.forEach((kind) => expect(ICON_KINDS).toContain(kind));
  const seen = new Set();
  CROPS.forEach((crop) => {
    const { container, unmount } = render(<CropIcon crop={crop} />);
    seen.add(container.innerHTML);
    expect(container.querySelector('[role="img"]')).not.toBeNull();
    unmount();
  });
  expect(seen.size).toBe(CROPS.length);
});
