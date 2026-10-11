import { toBotMessage, toErrorMessage, SOURCE_BADGE } from './ChatbotWidget';
import { AnalyticsError } from '../../api/analyticsClient';

test('keeps the source and disclaimer so the UI can label general AI answers', () => {
  const msg = toBotMessage({ reply: 'Use neem oil.', source: 'llm_general', disclaimer: 'Verify before acting.' });
  expect(msg).toEqual({ role: 'bot', text: 'Use neem oil.', source: 'llm_general', disclaimer: 'Verify before acting.' });
  expect(SOURCE_BADGE[msg.source].label).toMatch(/not from your data/i);
});

test('project answers are labelled as marketplace data', () => {
  expect(SOURCE_BADGE[toBotMessage({ reply: 'x', source: 'project_data' }).source].label).toMatch(/marketplace data/i);
});

test('an unknown source falls back to a neutral label instead of crashing', () => {
  expect(toBotMessage({ reply: 'x' }).source).toBe('fallback');
});

test('rate limiting gets a specific, reassuring message', () => {
  expect(toErrorMessage(new AnalyticsError(429, 'slow down')).text).toMatch(/prices and demand still work/i);
});

test('other failures use the friendly error text', () => {
  expect(toErrorMessage(new AnalyticsError(0, 'x')).text).toMatch(/could not reach/i);
});
