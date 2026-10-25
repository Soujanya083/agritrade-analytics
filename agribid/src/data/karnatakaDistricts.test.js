import { KARNATAKA_DISTRICTS } from './karnatakaDistricts';

test('lists Karnataka\'s 31 districts once each, in alphabetical order', () => {
  expect(KARNATAKA_DISTRICTS).toHaveLength(31);
  expect(new Set(KARNATAKA_DISTRICTS).size).toBe(31);
  expect([...KARNATAKA_DISTRICTS].sort()).toEqual(KARNATAKA_DISTRICTS);
});
