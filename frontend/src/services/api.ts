export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const key = sessionStorage.getItem("opspilot-access-key");
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "X-API-Key": key } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({ detail: "Unable to reach OpsPilot" }));
    const detail =
      typeof body.detail === "string"
        ? body.detail
        : Array.isArray(body.detail)
          ? body.detail
              .map(
                (item: { loc?: (string | number)[]; msg?: string }) =>
                  `${item.loc?.filter((part) => part !== "body").join(".") || "Request"}: ${item.msg || "Invalid value"}`,
              )
              .join("\n")
          : "Unable to complete the request";
    throw new Error(detail || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}
export const post = <T>(path: string, data: unknown = {}) =>
  api<T>(path, { method: "POST", body: JSON.stringify(data) });
