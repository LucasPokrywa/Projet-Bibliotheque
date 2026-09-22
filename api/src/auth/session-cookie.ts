import type { CookieOptions, Request } from 'express';

export const SESSION_COOKIE = 'bibliotheque_session';

export function sessionCookieOptions(request: Request): CookieOptions {
  return {
    httpOnly: true,
    secure: request.secure || process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/v1',
  };
}

export function readSessionCookie(
  header: string | undefined,
): string | undefined {
  const cookies = (header ?? '').split(';').map((part) => part.trim());
  const matches = cookies.filter((part) =>
    part.startsWith(`${SESSION_COOKIE}=`),
  );
  if (matches.length !== 1) return undefined;
  try {
    return (
      decodeURIComponent(matches[0].slice(SESSION_COOKIE.length + 1)) ||
      undefined
    );
  } catch {
    return undefined;
  }
}
