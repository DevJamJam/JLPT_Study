export const PROFILE_EMOJIS = [
  '🐰',
  '🐱',
  '🐶',
  '🐻',
  '🐼',
  '🐨',
  '🦊',
  '🐯',
  '🦁',
  '🐵',
  '🐸',
  '🐙',
  '🐳',
  '🐬',
  '🐧',
  '🐢',
  '🐟',
  '🐥',
  '🌸',
  '⭐',
] as const;

export function isPin(value: unknown): value is string {
  return typeof value === 'string' && value.length === 4 && /^[0-9]{4}$/.test(value);
}

export function normalizeNickname(value: unknown) {
  if (typeof value !== 'string') return null;
  const nickname = value.trim().normalize('NFC');
  if (
    [...nickname].length < 2 ||
    [...nickname].length > 12 ||
    /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(nickname)
  ) {
    return null;
  }
  return { nickname, nicknameKey: nickname.toLowerCase() };
}

export function validateJoinInput(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const data = input as Record<string, unknown>;
  const normalized = normalizeNickname(data.nickname);
  if (
    !normalized ||
    !isPin(data.pin) ||
    data.pinConfirm !== data.pin ||
    typeof data.requestId !== 'string' ||
    data.requestId.length !== 36 ||
    !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(data.requestId) ||
    !PROFILE_EMOJIS.some((emoji) => emoji === data.emoji)
  )
    return null;
  return {
    ...normalized,
    pin: data.pin,
    emoji: data.emoji as (typeof PROFILE_EMOJIS)[number],
    requestId: data.requestId.toLowerCase(),
  };
}
