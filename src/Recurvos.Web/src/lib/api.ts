import { getAuth, setAuth } from "./auth";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:7001/api";

export function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

function toFriendlyFieldName(field: string) {
  return field
    .replace(/\[\d+\]/g, "")
    .split(".")
    .filter(Boolean)
    .map((part) => part.replace(/([a-z0-9])([A-Z])/g, "$1 $2"))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatApiError(payload: unknown, fallbackStatus: number) {
  if (!payload || typeof payload !== "object") {
    return `Request failed with ${fallbackStatus}`;
  }

  const typedPayload = payload as {
    title?: string;
    detail?: string;
    errors?: Record<string, string[]>;
  };

  if (typedPayload.errors) {
    const messages = Object.entries(typedPayload.errors)
      .flatMap(([field, fieldErrors]) =>
        fieldErrors.map((message) => {
          const cleanedField = field === "request" || field === "$" ? "" : toFriendlyFieldName(field);
          const normalizedMessage = message.startsWith("The field ")
            ? message.replace("The field ", "")
            : message;

          return cleanedField && !normalizedMessage.toLowerCase().startsWith(cleanedField.toLowerCase())
            ? `${cleanedField}: ${normalizedMessage}`
            : normalizedMessage;
        }))
      .filter(Boolean);

    if (messages.length > 0) {
      return messages.join("\n");
    }
  }

  return typedPayload.detail || typedPayload.title || `Request failed with ${fallbackStatus}`;
}

function getFallbackMessage(status: number) {
  switch (status) {
    case 400:
      return "Please check the details and try again.";
    case 401:
      return "Your session has expired or you are not authorized. Please sign in again.";
    case 403:
      return "You do not have permission to perform this action.";
    case 404:
      return "The requested record could not be found.";
    case 500:
      return "Something went wrong. Please try again.";
    default:
      return `Request failed with ${status}`;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const auth = getAuth();
  const headers = new Headers(init?.headers);
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  if (!isFormData) {
    headers.set("Content-Type", "application/json");
  }
  if (auth?.accessToken) {
    headers.set("Authorization", `Bearer ${auth.accessToken}`);
  }

  const response = await fetch(buildApiUrl(path), { ...init, headers });
  if (response.status === 401 && auth?.refreshToken) {
    const refreshed = await fetch(buildApiUrl("/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: auth.refreshToken }),
    });

    if (refreshed.ok) {
      const refreshedAuth = await refreshed.json();
      setAuth(refreshedAuth);
      return request<T>(path, init);
    }
  }

  if (!response.ok) {
    const rawError = await response.text();

    try {
      throw new Error(formatApiError(JSON.parse(rawError), response.status));
    } catch (parseError) {
      if (parseError instanceof SyntaxError) {
        throw new Error(rawError && !rawError.trim().startsWith("<") ? rawError : getFallbackMessage(response.status));
      }

      throw parseError;
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const rawBody = await response.text();
  if (!rawBody) {
    return undefined as T;
  }

  return JSON.parse(rawBody) as T;
}

async function requestBlob(path: string, init?: RequestInit): Promise<{ blob: Blob; fileName: string | null; contentType: string | null }> {
  const auth = getAuth();
  const headers = new Headers(init?.headers);
  if (auth?.accessToken) {
    headers.set("Authorization", `Bearer ${auth.accessToken}`);
  }

  const response = await fetch(buildApiUrl(path), { ...init, headers });
  if (response.status === 401 && auth?.refreshToken) {
    const refreshed = await fetch(buildApiUrl("/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: auth.refreshToken }),
    });

    if (refreshed.ok) {
      const refreshedAuth = await refreshed.json();
      setAuth(refreshedAuth);
      return requestBlob(path, init);
    }
  }

  if (!response.ok) {
    const rawError = await response.text();
    try {
      throw new Error(formatApiError(JSON.parse(rawError), response.status));
    } catch (parseError) {
      if (parseError instanceof SyntaxError) {
        throw new Error(rawError && !rawError.trim().startsWith("<") ? rawError : getFallbackMessage(response.status));
      }

      throw parseError;
    }
  }

  const disposition = response.headers.get("Content-Disposition");
  const fileNameMatch = disposition?.match(/filename\*=UTF-8''([^;]+)|filename="?([^"]+)"?/i);
  const fileName = decodeURIComponent(fileNameMatch?.[1] ?? fileNameMatch?.[2] ?? "");
  return {
    blob: await response.blob(),
    fileName: fileName || null,
    contentType: response.headers.get("Content-Type"),
  };
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  postDownload: (path: string, body?: unknown) =>
    requestBlob(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) }),
  postForm: <T>(path: string, body: FormData) =>
    request<T>(path, { method: "POST", body }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (path: string) => request<void>(path, { method: "DELETE" }),
  download: (path: string) => requestBlob(path),
};
