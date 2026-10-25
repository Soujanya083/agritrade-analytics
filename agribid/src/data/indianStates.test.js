import { INDIAN_STATES } from './indianStates';

test('lists all 28 states and 8 union territories exactly once, in order', () => {
  expect(INDIAN_STATES).toHaveLength(36);
  expect(new Set(INDIAN_STATES).size).toBe(36);
  expect([...INDIAN_STATES].sort()).toEqual(INDIAN_STATES);
  ['Karnataka', 'Tamil Nadu', 'Odisha', 'Ladakh', 'Delhi'].forEach((s) => expect(INDIAN_STATES).toContain(s));
});
