import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CompanionPlanting from './CompanionPlanting';

test('shows the verified catalog size and the evidence caution up front', () => {
  render(<CompanionPlanting />);
  expect(screen.getByText(/116 crops\. Pairings shown only/)).toBeInTheDocument();
  expect(screen.getByText(/many popular companion-planting claims/i)).toBeInTheDocument();
});

test('category chips show counts and the Leafy filter lists only leafy crops', () => {
  render(<CompanionPlanting />);
  fireEvent.click(screen.getByRole('button', { name: /Leafy crops & herbs/ }));
  expect(screen.getByText('26 crops')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /^Spinach/ }).length).toBeGreaterThan(0);
  expect(screen.queryByRole('button', { name: /^Wheat/ })).toBeNull();
});

test('an empty search shows a friendly empty state instead of a blank grid', () => {
  render(<CompanionPlanting />);
  fireEvent.change(screen.getByLabelText('Search crops'), { target: { value: 'zzzz-nothing' } });
  expect(screen.getByText(/No crops match/)).toBeInTheDocument();
});

test('the checker explains a documented conflict with its sources', () => {
  render(<CompanionPlanting />);
  fireEvent.change(screen.getByLabelText('First crop'), { target: { value: 'Tomato' } });
  fireEvent.change(screen.getByLabelText('Second crop'), { target: { value: 'Potato' } });
  expect(screen.getAllByText(/Unsuitable \(documented conflict\)/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/late blight/i).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/sources?$/).length).toBeGreaterThan(0);
});

test('the checker says "insufficient evidence" plainly and offers evidence-based options', () => {
  render(<CompanionPlanting />);
  fireEvent.change(screen.getByLabelText('First crop'), { target: { value: 'Banana' } });
  fireEvent.change(screen.getByLabelText('Second crop'), { target: { value: 'Wheat' } });
  expect(screen.getByText(/No field research was found/)).toBeInTheDocument();
  expect(screen.getByText(/does not mean they are incompatible/)).toBeInTheDocument();
  expect(screen.getAllByText(/Rotate away from relatives/).length).toBeGreaterThan(0);
});

test('a crop with no verified pairing is explained, with sourced alternatives, never left blank', () => {
  render(<CompanionPlanting />);
  fireEvent.click(screen.getAllByRole('button', { name: /^Mango/ })[0]);
  expect(screen.getByText(/No verified companion pairing was found for/)).toBeInTheDocument();
  expect(screen.getAllByText(/Rotate away from relatives/).length).toBeGreaterThan(0);
});

test('wheat opens with its researched pairings and their risks', () => {
  render(<CompanionPlanting />);
  expect(screen.getAllByText(/Supported by research/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Mustard shades and out-competes wheat/).length).toBeGreaterThan(0);
});
