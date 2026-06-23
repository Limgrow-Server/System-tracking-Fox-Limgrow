import "server-only";

export async function parseJsonBody<T>(request: Request): Promise<T> {
  return (await request.json().catch(() => ({}))) as T;
}
