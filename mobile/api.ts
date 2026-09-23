export const API = process.env.EXPO_PUBLIC_API_URL || 'https://api.bibliotheque.lucaspokrywa.site';
export type Book = { id: number; livre_id: number; titre: string; auteur: string; isbn: string | null; lu: boolean };
export type FoundBook = { id: number; title: string; authors: string[] };

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function request<T>(path: string, method = 'GET', body?: object): Promise<T> {
  const response = await fetch(`${API}/v1${path}`, {
    method, credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new ApiError(response.status, typeof error?.detail === 'string' ? error.detail :
      response.status === 401 ? 'Session expirée. Reconnectez-vous.' :
      response.status === 409 ? 'Ce livre est déjà dans votre bibliothèque.' :
      response.status === 404 ? 'Aucun livre trouvé pour cet ISBN.' :
      response.status === 429 ? 'Trop de requêtes. Réessayez plus tard.' : 'Une erreur est survenue.');
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
