import type { PromptPlaceholder } from '../types';

export const PLACEHOLDER_REGEX = /\[([^[\]\r\n]+?)\]/g;

const internalWhitespaceRegex = /\s+/g;

export type PromptSegment =
  | {
      type: 'text';
      value: string;
    }
  | {
      type: 'placeholder';
      key: string;
      token: string;
    };

export function normalizePlaceholderKey(rawKey: string) {
  return rawKey.trim().replace(internalWhitespaceRegex, ' ');
}

export function placeholderToken(key: string) {
  return `[${key}]`;
}

export function humanizePlaceholderKey(key: string) {
  const normalized = normalizePlaceholderKey(key);

  if (!normalized) {
    return '';
  }

  return normalized
    .split(/[\s_-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function extractPlaceholderKeys(text: string) {
  const keys: string[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(PLACEHOLDER_REGEX)) {
    const key = normalizePlaceholderKey(match[1] ?? '');

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    keys.push(key);
  }

  return keys;
}

export function buildPromptSegments(text: string): PromptSegment[] {
  const segments: PromptSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(PLACEHOLDER_REGEX)) {
    const rawMatch = match[0] ?? '';
    const rawKey = match[1] ?? '';
    const matchIndex = match.index ?? 0;
    const normalizedKey = normalizePlaceholderKey(rawKey);

    if (matchIndex > lastIndex) {
      segments.push({
        type: 'text',
        value: text.slice(lastIndex, matchIndex),
      });
    }

    if (normalizedKey) {
      segments.push({
        type: 'placeholder',
        key: normalizedKey,
        token: placeholderToken(normalizedKey),
      });
    } else {
      segments.push({
        type: 'text',
        value: rawMatch,
      });
    }

    lastIndex = matchIndex + rawMatch.length;
  }

  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      value: text.slice(lastIndex),
    });
  }

  return segments.length > 0 ? segments : [{ type: 'text', value: text }];
}

export function buildPlaceholderDefinitions(
  text: string,
  placeholders: PromptPlaceholder[],
) {
  const placeholderMap = new Map(
    placeholders.map((placeholder) => [
      normalizePlaceholderKey(placeholder.key),
      {
        ...placeholder,
        key: normalizePlaceholderKey(placeholder.key),
      },
    ]),
  );

  return extractPlaceholderKeys(text).map((key) => {
    const existing = placeholderMap.get(key);

    return {
      key,
      label: existing?.label?.trim() || humanizePlaceholderKey(key),
      description: existing?.description?.trim() || '',
      defaultValue: existing?.defaultValue?.trim() || '',
    };
  });
}

export function resolvePromptText(text: string, values: Record<string, string>) {
  return text.replace(PLACEHOLDER_REGEX, (match, rawKey: string) => {
    const key = normalizePlaceholderKey(rawKey);
    const value = values[key]?.trim();

    return value && value.length > 0 ? value : match;
  });
}
