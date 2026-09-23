export const API_URL = 'https://api.bibliotheque.lucaspokrywa.site/v1';

type User = { id: number; pseudo: string; email?: string; date_inscription?: string };
let pendingSession: Promise<User | null | undefined> | undefined;

// Le cookie est HttpOnly : seule une réponse de l'API confirme la session.
export function getSession(refresh = false): Promise<User | null | undefined> {
  if (refresh || !pendingSession) {
    pendingSession = (async () => {
      try {
        const response = await fetch(`${API_URL}/users/me`, {
          credentials: 'include', cache: 'no-store',
        });
        if (response.status === 401) return null;
        if (!response.ok) return undefined;
        const user = await response.json();
        return user && Number.isSafeInteger(user.id) && typeof user.pseudo === 'string'
          ? user as User : undefined;
      } catch {
        return undefined;
      }
    })();
  }
  return pendingSession;
}

export async function authError(response: Response, fallback: string): Promise<string> {
  if (response.status === 401) return 'Adresse email ou mot de passe incorrect.';
  if (response.status === 409) return 'Cette adresse email est déjà utilisée.';
  if (response.status === 429) return 'Trop de tentatives. Patientez avant de réessayer.';
  if (response.status >= 500) return 'Le service est momentanément indisponible. Réessayez plus tard.';
  const problem = await response.json().catch(() => null);
  if (Array.isArray(problem?.errors)) {
    const errors = problem.errors.filter((message: unknown): message is string => typeof message === 'string');
    if (errors.length) return errors.join(' ');
  }
  return typeof problem?.detail === 'string' ? problem.detail : fallback;
}

export function profileUrl(pseudo: string): string {
  // Les pseudos "." et ".." ne doivent pas être interprétés comme des chemins.
  const segment = pseudo === '.' || pseudo === '..' ? encodeURIComponent(pseudo).replaceAll('.', '%252E') : encodeURIComponent(pseudo);
  return `/profil/${segment}`;
}
