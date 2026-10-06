import type {
  ChatResponse,
  DocumentRecord,
  HistoryEntry,
  ModelRecord,
  ScanStatus,
  SearchResponse,
  UsageDashboard
} from "./types";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, options);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { detail?: string };
    throw new Error(body.detail ?? `Request failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  documents: () => request<DocumentRecord[]>("/documents"),
  models: () => request<ModelRecord[]>("/models"),
  scanStatus: () => request<ScanStatus>("/scan/status"),
  scan: () => request<ScanStatus>("/scan", { method: "POST" }),
  search: (query: string) =>
    request<SearchResponse>(`/search?q=${encodeURIComponent(query)}`),
  chat: (message: string) =>
    request<ChatResponse>("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    }),
  history: () => request<HistoryEntry[]>("/history"),
  usage: () => request<UsageDashboard>("/usage"),
  clearHistory: () =>
    request<{ deleted: number }>("/history", { method: "DELETE" }),
  feedback: (historyId: number, rating: "good" | "bad") =>
    request<{ total: number; good: number; bad: number }>("/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history_id: historyId, rating })
    }),
  activateModel: (model: string) =>
    request<{ active_model: string }>("/models/active", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model })
    }),
  upload: (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<{ name: string; status: string }>("/documents/upload", {
      method: "POST",
      body
    });
  }
};
