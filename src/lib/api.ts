export type ApiResult<T> = { ok: boolean; status: number; data: T; error?: string };

/** fetch que nunca lança exceção: sempre retorna { ok, data, error }. */
export async function api<T = Record<string, unknown>>(
  url: string,
  init?: RequestInit & { json?: unknown }
): Promise<ApiResult<T>> {
  const { json, ...rest } = init ?? {};
  try {
    const res = await fetch(url, {
      ...rest,
      headers: {
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(rest.headers ?? {}),
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
    let data: unknown = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    const err =
      !res.ok && data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : !res.ok
          ? `Erro ${res.status}`
          : undefined;
    return { ok: res.ok, status: res.status, data: data as T, error: err };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, status: 0, data: {} as T, error: "abort" };
    }
    return { ok: false, status: 0, data: {} as T, error: "Falha de conexão com o servidor." };
  }
}
