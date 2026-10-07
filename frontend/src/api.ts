import type {
  ChatResponse,
  DeploymentInfo,
  DocumentRecord,
  HistoryEntry,
  ModelRecord,
  OnlineDocumentRecord,
  ScanStatus,
  SearchResponse,
  SecurityOverview,
  UsageDashboard
} from "./types";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, options);
  const contentType = response.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(
      `API returned an unexpected response for ${path}. Refresh the page or restart the application server.`
    );
  }
  const body = await response.json() as T & { detail?: string };
  if (!response.ok) {
    throw new Error(body.detail ?? `Request failed with status ${response.status}`);
  }
  return body;
}

export const api = {
  deployment: () => request<DeploymentInfo>("/deployment"),
  documents: () => request<DocumentRecord[]>("/documents"),
  onlineDocuments: () =>
    request<OnlineDocumentRecord[]>("/online/documents"),
  models: () => request<ModelRecord[]>("/models"),
  scanStatus: () => request<ScanStatus>("/scan/status"),
  scan: () => request<ScanStatus>("/scan", { method: "POST" }),
  search: (
    query: string,
    source: "offline" | "online",
    documentIds: number[] = []
  ) =>
    request<SearchResponse>(
      `/search?q=${encodeURIComponent(query)}&source=${source}`
      + documentIds.map((id) => `&document_ids=${id}`).join("")
    ),
  chat: (
    message: string,
    source: "offline" | "online",
    model?: string,
    documentIds: number[] = []
  ) =>
    request<ChatResponse>("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        source,
        mode: source === "offline" && model ? "generated" : "fast",
        ...(model ? { model } : {}),
        ...(source === "online" && documentIds.length
          ? { document_ids: documentIds }
          : {})
      })
    }),
  history: () => request<HistoryEntry[]>("/history"),
  usage: () => request<UsageDashboard>("/usage"),
  securityOverview: () => request<SecurityOverview>("/security/overview"),
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
