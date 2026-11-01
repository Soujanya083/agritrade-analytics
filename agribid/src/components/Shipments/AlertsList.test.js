import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AlertsList from './AlertsList';

const alert = (extra = {}) => ({
  id: 'a1', shipmentId: 'SHP-1', type: 'damage_reported', severity: 'critical', status: 'open',
  reason: 'Damaged goods reported by the buyer: 40 kg of 100 kg (40.0%).', raisedAt: '2026-10-30T10:00:00Z',
  details: { affectedPercent: 40, criticalPercent: 25 }, history: [], ...extra,
});

test('every alert explains why it was raised, with its severity', () => {
  render(<AlertsList alerts={[alert()]} roles={['farmer']} onAction={() => {}} />);
  expect(screen.getByText(/Why you are seeing this:/)).toBeInTheDocument();
  expect(screen.getByText(/40 kg of 100 kg/)).toBeInTheDocument();
  expect(screen.getByText('critical')).toBeInTheDocument();
});

test('the numbers behind the alert can be opened', () => {
  render(<AlertsList alerts={[alert()]} roles={['farmer']} onAction={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Show the numbers behind it' }));
  expect(screen.getByText('Affected Percent')).toBeInTheDocument();
  expect(screen.getByText('40')).toBeInTheDocument();
});

test('a farmer can acknowledge and investigate a damage alert, but not resolve it', () => {
  render(<AlertsList alerts={[alert()]} roles={['farmer']} onAction={() => {}} />);
  expect(screen.getByRole('button', { name: 'Acknowledge' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add investigation note' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Resolve' })).toBeNull();
});

test('the buyer can resolve it with a note', async () => {
  const onAction = jest.fn().mockResolvedValue(true);
  render(<AlertsList alerts={[alert()]} roles={['buyer']} onAction={onAction} />);
  fireEvent.change(screen.getByLabelText('Note for this alert'), { target: { value: 'Refund agreed' } });
  fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
  await waitFor(() => expect(onAction).toHaveBeenCalledWith('a1', 'resolve', 'Refund agreed'));
});

test('a resolved alert has no buttons and shows its resolution', () => {
  render(<AlertsList alerts={[alert({ status: 'resolved', resolutionNote: 'Refund agreed' })]} roles={['buyer']} onAction={() => {}} />);
  expect(screen.queryByRole('button', { name: 'Resolve' })).toBeNull();
  expect(screen.getByText(/Resolution: Refund agreed/)).toBeInTheDocument();
});

test('says so when there are no alerts', () => {
  render(<AlertsList alerts={[]} roles={['buyer']} onAction={() => {}} />);
  expect(screen.getByText('No alerts for this shipment.')).toBeInTheDocument();
});
