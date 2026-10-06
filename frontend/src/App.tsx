import {
  Bot,
  Check,
  Cloud,
  Clipboard,
  FileSearch,
  HardDrive,
  Menu,
  Moon,
  RefreshCw,
  Search,
  Send,
  Sun,
  ThumbsDown,
  ThumbsUp,
  Upload,
  X
} from "lucide-react";
import {
  FormEvent,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { api } from "./api";
import type {
  ChatResponse,
  DeploymentInfo,
  DocumentRecord,
  HistoryEntry,
  ModelRecord,
  ScanStatus,
  Source,
  UsageDashboard
} from "./types";

const prompts = [
  "What is the return policy?",
  "Draft a customer-ready response",
  "Are there conflicting instructions?"
];
const searchProgressMessages = [
  "Searching extracted key facts",
  "Checking full document excerpts",
  "Ranking the best matches"
];
const chatProgressMessages = [
  "Checking the previous-answer cache",
  "Searching extracted key facts",
  "Ranking retrieved sources",
  "Preparing citations"
];
const AnalyticsPanel = lazy(() => import("./AnalyticsPanel"));
const ArchitecturePanel = lazy(() => import("./ArchitecturePanel"));

function PanelLoading({ label }: { label: string }) {
  return (
    <div className="analytics-loading" role="status">
      <RefreshCw className="spin" size={20} />
      <span>{label}</span>
    </div>
  );
}

export default function App() {
  const widget = new URLSearchParams(window.location.search).get("widget") === "1";
  const [dark, setDark] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(widget);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [deployment, setDeployment] = useState<DeploymentInfo>({
    read_only_demo: false,
    online_available: false,
    online_model: ""
  });
  const [dataSource, setDataSource] = useState<"offline" | "online">("offline");
  const [models, setModels] = useState<ModelRecord[]>([]);
  const [scan, setScan] = useState<ScanStatus | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Source[]>([]);
  const [preview, setPreview] = useState<Source | null>(null);
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState<ChatResponse | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [assistantTab, setAssistantTab] = useState<"chat" | "history">("chat");
  const [workspaceTab, setWorkspaceTab] = useState<
    "answers" | "analytics" | "architecture"
  >("answers");
  const [usage, setUsage] = useState<UsageDashboard | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [usageLoaded, setUsageLoaded] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState<"good" | "bad" | null>(null);
  const [chatPending, setChatPending] = useState(false);
  const [chatProgress, setChatProgress] = useState(chatProgressMessages[0]);
  const [searchProgress, setSearchProgress] = useState("");
  const [chatError, setChatError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const activeModel = useMemo(
    () => models.find((model) => model.active),
    [models]
  );

  async function refresh() {
    try {
      await Promise.all([
        api.deployment().then(setDeployment),
        api.documents().then(setDocuments),
        api.scanStatus().then(setScan)
      ]);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load status");
    }
  }

  useEffect(() => {
    void refresh();
    const modelTimer = window.setTimeout(() => {
      void api.models()
        .then(setModels)
        .catch((caught) => {
          setError(caught instanceof Error ? caught.message : "Unable to load models");
        });
    }, 350);
    const timer = window.setInterval(async () => {
      try {
        setScan(await api.scanStatus());
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Unable to refresh scan status"
        );
      }
    }, 15000);
    return () => {
      window.clearTimeout(modelTimer);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (assistantTab !== "history" || historyLoaded) return;
    void api.history()
      .then((entries) => {
        setHistory(entries);
        setHistoryLoaded(true);
      })
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : "Unable to load history");
      });
  }, [assistantTab, historyLoaded]);

  useEffect(() => {
    if (workspaceTab !== "analytics" || usageLoaded) return;
    void api.usage()
      .then((nextUsage) => {
        setUsage(nextUsage);
        setUsageLoaded(true);
      })
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : "Unable to load analytics");
      });
  }, [workspaceTab, usageLoaded]);

  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data === "csr-assist-close") setMobileOpen(false);
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setSearchProgress(searchProgressMessages[0]);
    let progressIndex = 0;
    const progressTimer = window.setInterval(() => {
      progressIndex = Math.min(progressIndex + 1, searchProgressMessages.length - 1);
      setSearchProgress(searchProgressMessages[progressIndex]);
    }, 700);
    try {
      const response = await api.search(query, dataSource);
      setResults(response.results);
      setPreview(response.results[0] ?? null);
      setHistoryLoaded(false);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Search failed");
    } finally {
      window.clearInterval(progressTimer);
      setSearchProgress("");
      setBusy(false);
    }
  }

  async function handleChat(event: FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    setChatPending(true);
    setAssistantTab("chat");
    setChatProgress(chatProgressMessages[0]);
    let progressIndex = 0;
    const progressTimer = window.setInterval(() => {
      progressIndex = Math.min(progressIndex + 1, chatProgressMessages.length - 1);
      setChatProgress(chatProgressMessages[progressIndex]);
    }, 700);
    setChatError("");
    try {
      const response = await api.chat(message, dataSource);
      setAnswer(response);
      setFeedbackRating(null);
      setMessage("");
      setHistoryLoaded(false);
      setUsageLoaded(false);
      setError("");
    } catch (caught) {
      setChatError(
        caught instanceof Error
          ? caught.message
          : "Mira could not complete the response"
      );
    } finally {
      window.clearInterval(progressTimer);
      setChatPending(false);
      setBusy(false);
    }
  }

  async function handleScan() {
    setBusy(true);
    try {
      await api.scan();
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Scan failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      await api.upload(file);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function selectDataSource(source: "offline" | "online") {
    setDataSource(source);
    setResults([]);
    setPreview(null);
    setAnswer(null);
    setFeedbackRating(null);
  }

  const sourceToggle = (
    <div className="source-toggle" role="group" aria-label="Knowledge source">
      <button
        className={dataSource === "offline" ? "active" : ""}
        onClick={() => selectDataSource("offline")}
        type="button"
      >
        <HardDrive size={15} /> Offline
      </button>
      <button
        className={dataSource === "online" ? "active online" : ""}
        onClick={() => selectDataSource("online")}
        disabled={!deployment.online_available}
        title={
          deployment.online_available
            ? "Use Azure AI Search and Azure AI Foundry"
            : "Azure AI online mode is not configured"
        }
        type="button"
      >
        <Cloud size={15} /> Online
      </button>
    </div>
  );

  const assistant = (
    <section className="assistant-panel" aria-label="Mira assistant">
      <header className="assistant-header">
        <div className="avatar"><Bot size={22} /></div>
        <div>
          <strong>Mira</strong>
          <span>CSR Assist teammate</span>
        </div>
        <button
          className="icon-button mobile-only"
          aria-label="Close Mira"
          onClick={() => setMobileOpen(false)}
        >
          <X />
        </button>
      </header>
      <div className="model-row">
        <label>Knowledge source</label>
        {sourceToggle}
        {dataSource === "offline" ? (
          <>
            <label htmlFor="model">Optional local model</label>
            <select
              id="model"
              value={activeModel?.id ?? ""}
              onChange={async (event) => {
                try {
                  await api.activateModel(event.target.value);
                  setModels(await api.models());
                } catch (caught) {
                  setError(
                    caught instanceof Error ? caught.message : "Model unavailable"
                  );
                }
              }}
            >
              {models.length === 0 && <option>Loading local models…</option>}
              {models.map((model) => (
                <option key={model.id} value={model.id} disabled={!model.available}>
                  {model.provider} · {model.name}
                  {model.installed ? " · Installed" : " · Setup required"}
                </option>
              ))}
            </select>
          </>
        ) : (
          <div className="online-provider">
            <Cloud size={17} />
            <span>
              <strong>Azure AI Foundry</strong>
              <small>{deployment.online_model}</small>
            </span>
          </div>
        )}
      </div>
      <div className="assistant-tabs" role="tablist" aria-label="Mira panels">
        <button
          role="tab"
          aria-selected={assistantTab === "chat"}
          className={assistantTab === "chat" ? "active" : ""}
          onClick={() => setAssistantTab("chat")}
        >
          Chat
        </button>
        <button
          role="tab"
          aria-selected={assistantTab === "history"}
          className={assistantTab === "history" ? "active" : ""}
          onClick={() => setAssistantTab("history")}
        >
          History <span>{history.length}</span>
        </button>
      </div>
      <div className="conversation">
        <div hidden={assistantTab !== "chat"}>
          {!answer && (
            <div className="mira-intro">
              <p>
                {dataSource === "online"
                  ? "I’ll use Azure AI Search and Foundry to answer from the public demo sources."
                  : "I’ll use the offline index to answer from the local documents."}
              </p>
              <div className="prompt-list">
                {prompts.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => {
                      setMessage(prompt);
                      setAssistantTab("chat");
                    }}
                    className="prompt"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}
          {chatPending && (
            <div className="chat-progress" role="status">
              <RefreshCw className="spin" size={18} />
              <div>
                <strong>Mira is reviewing the local sources</strong>
                <span>{chatProgress}</span>
              </div>
            </div>
          )}
          {chatError && (
            <div className="chat-error" role="alert">
              <strong>Mira could not finish the answer</strong>
              <span>{chatError}</span>
              <button onClick={() => setChatError("")}>Dismiss</button>
            </div>
          )}
          {answer && (
            <article className={`answer ${answer.state}`}>
              <div className="answer-title">
                <Bot size={18} />
                <strong>Mira</strong>
              </div>
              <p>{answer.text}</p>
              {answer.notice && (
                <div className="answer-notice" role="status">
                  {answer.notice}
                </div>
              )}
              {answer.sources.length > 0 && (
                <div className="source-cards">
                  <strong>Sources</strong>
                  {answer.sources.map((source, index) => (
                    <button
                      key={source.chunk_id}
                      onClick={() => setPreview(source)}
                      className="source-card"
                    >
                      <span>[{index + 1}] {source.name}</span>
                      <small>
                        {source.channel === "online" ? "Online" : "Offline"} ·{" "}
                        {source.location}
                      </small>
                    </button>
                  ))}
                </div>
              )}
              <div className="answer-actions">
                <button onClick={() => void navigator.clipboard.writeText(answer.text)}>
                  <Clipboard size={15} /> Copy
                </button>
                <button onClick={() => setAnswer(null)}>
                  <RefreshCw size={15} /> Clear
                </button>
              </div>
              {!deployment.read_only_demo && answer.history_id > 0 && (
              <div className="feedback-controls" aria-label="Rate this response">
                <span>
                  {feedbackRating
                    ? "Thanks. Local source ranking was updated."
                    : "Was this response useful?"}
                </span>
                <button
                  className={feedbackRating === "good" ? "selected" : ""}
                  aria-label="Good response"
                  onClick={async () => {
                    try {
                      await api.feedback(answer.history_id, "good");
                      setFeedbackRating("good");
                      setUsageLoaded(false);
                    } catch (caught) {
                      setChatError(
                        caught instanceof Error ? caught.message : "Unable to save feedback"
                      );
                    }
                  }}
                >
                  <ThumbsUp size={15} />
                </button>
                <button
                  className={feedbackRating === "bad" ? "selected" : ""}
                  aria-label="Bad response"
                  onClick={async () => {
                    try {
                      await api.feedback(answer.history_id, "bad");
                      setFeedbackRating("bad");
                      setUsageLoaded(false);
                    } catch (caught) {
                      setChatError(
                        caught instanceof Error ? caught.message : "Unable to save feedback"
                      );
                    }
                  }}
                >
                  <ThumbsDown size={15} />
                </button>
              </div>
              )}
            </article>
          )}
        </div>
        {assistantTab === "history" && (
          <section className="history history-tab" aria-label="Past queries">
            <div className="history-heading">
              <div>
                <strong>Past queries</strong>
                <span>
                  {deployment.read_only_demo
                    ? "History is disabled in the public demo"
                    : "Stored only in the local database"}
                </span>
              </div>
              {history.length > 0 && (
                <button
                  onClick={async () => {
                    await api.clearHistory();
                    setHistory([]);
                  }}
                >
                  Clear history
                </button>
              )}
            </div>
            {history.length === 0 && (
              <div className="empty history-empty">
                <RefreshCw size={26} />
                <strong>No history yet</strong>
                <span>
                  {deployment.read_only_demo
                    ? "Public demo questions are not stored."
                    : "Searches and Mira questions will appear here."}
                </span>
              </div>
            )}
            {history.map((entry) => (
              <button
                className="history-entry"
                key={entry.id}
                onClick={() => {
                  if (entry.kind === "search") setQuery(entry.query);
                  else setMessage(entry.query);
                  setAssistantTab("chat");
                }}
              >
                <span>{entry.kind === "chat" ? "Mira" : "Search"}</span>
                <strong>{entry.query}</strong>
                <small>
                  {entry.sources.length} source{entry.sources.length === 1 ? "" : "s"}
                </small>
              </button>
            ))}
          </section>
        )}
      </div>
      {assistantTab === "chat" && (
        <>
          <form className="chat-form" onSubmit={handleChat}>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Ask Mira about your local documents…"
              aria-label="Message Mira"
              rows={3}
            />
            <button className="send-button" disabled={busy || !message.trim()}>
              <Send size={18} /> Send
            </button>
          </form>
          <p className="accuracy-note">
            Citations support review but do not guarantee model accuracy.
          </p>
        </>
      )}
    </section>
  );

  if (widget) {
    return <main className={dark ? "app dark widget" : "app widget"}>{assistant}</main>;
  }

  return (
    <main className={dark ? "app dark" : "app"}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><FileSearch /></div>
          <div>
            <strong>CSR Assist</strong>
            <span>
              {deployment.read_only_demo
                ? "Public read-only demo"
                : "Private knowledge workspace"}
            </span>
          </div>
        </div>
        <div className="top-actions">
          <span className="local-pill">
            {dataSource === "online" ? <Cloud size={14} /> : <Check size={14} />}
            {dataSource === "online" ? "Online · Azure AI" : "Offline · Local index"}
          </span>
          <button
            className="icon-button"
            aria-label="Toggle dark mode"
            onClick={() => setDark((value) => !value)}
          >
            {dark ? <Sun /> : <Moon />}
          </button>
        </div>
      </header>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className="workspace">
        <section className="documents-pane">
          <div className="workspace-heading">
            <div>
              <p className="eyebrow">Document workspace</p>
              <h1>
                {deployment.read_only_demo
                  ? "Explore grounded answers from sample content"
                  : "Find answers in your local knowledge"}
              </h1>
              <p>
                {deployment.read_only_demo
                  ? "Compare cited answers from the bundled offline index and Azure AI."
                  : "Search, review, and cite documents without sending data anywhere."}
              </p>
            </div>
            <div className="workspace-actions">
              <input
                ref={fileInput}
                type="file"
                hidden
                onChange={(event) => void handleUpload(event.target.files?.[0])}
              />
              <button
                className="secondary"
                onClick={() => fileInput.current?.click()}
                disabled={deployment.read_only_demo}
                title={
                  deployment.read_only_demo
                    ? "Uploads are disabled in the public demo"
                    : undefined
                }
              >
                <Upload size={17} />
                {deployment.read_only_demo ? "Uploads disabled" : "Upload"}
              </button>
              <button className="primary" onClick={() => void handleScan()} disabled={busy}>
                <RefreshCw size={17} className={scan?.state === "running" ? "spin" : ""} />
                Scan documents
              </button>
            </div>
          </div>
          <div className="workspace-tabs" role="tablist" aria-label="Workspace panels">
            <button
              role="tab"
              aria-selected={workspaceTab === "answers"}
              className={workspaceTab === "answers" ? "active" : ""}
              onClick={() => setWorkspaceTab("answers")}
            >
              Answer workspace
            </button>
            <button
              role="tab"
              aria-selected={workspaceTab === "analytics"}
              className={workspaceTab === "analytics" ? "active" : ""}
              onClick={() => setWorkspaceTab("analytics")}
            >
              Analytics
            </button>
            <button
              role="tab"
              aria-selected={workspaceTab === "architecture"}
              className={workspaceTab === "architecture" ? "active" : ""}
              onClick={() => setWorkspaceTab("architecture")}
            >
              Architecture
            </button>
          </div>
          <div hidden={workspaceTab !== "answers"}>
          <div className="source-mode-bar">
            <div>
              <strong>
                {dataSource === "online" ? "Online search" : "Offline search"}
              </strong>
              <span>
                {dataSource === "online"
                  ? "Queries and public demo excerpts are processed by Azure AI Search and Foundry."
                  : "Queries stay in the local SQLite document index."}
              </span>
            </div>
            {sourceToggle}
          </div>
          <form className="search-bar" onSubmit={handleSearch}>
            <Search size={20} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search policies, procedures, and product information"
              aria-label="Search documents"
            />
            <button disabled={busy || !query.trim()}>Search</button>
          </form>
          {searchProgress && (
            <div className="operation-progress" role="status" aria-live="polite">
              <RefreshCw className="spin" size={17} />
              <div>
                <strong>{searchProgress}</strong>
                <span>
                  {dataSource === "online"
                    ? "Searching the managed Azure AI index."
                    : "Processing locally. No document content leaves this device."}
                </span>
              </div>
            </div>
          )}
          <div className="content-grid">
            <section className="library card">
              <div className="card-heading">
                <div>
                  <h2>Documents</h2>
                  <span>{documents.length} offline files</span>
                </div>
                {scan && <span className={`status ${scan.state}`}>{scan.state}</span>}
              </div>
              <div className="document-list">
                {documents.length === 0 && (
                  <div className="empty">
                    <FileSearch size={30} />
                    <strong>No documents indexed</strong>
                    <span>
                      {deployment.read_only_demo
                        ? "The bundled sample is being prepared."
                        : "Upload a file or scan the mounted document folder."}
                    </span>
                  </div>
                )}
                {documents.map((document) => (
                  <div className="document-row" key={document.id}>
                    <div className="file-icon">{document.extension.slice(1).toUpperCase()}</div>
                    <div>
                      <strong>{document.name}</strong>
                      <span>{document.relative_path} · {document.chunk_count} excerpts</span>
                      {document.error && <small>{document.error}</small>}
                    </div>
                    <span className={`status ${document.status}`}>{document.status}</span>
                  </div>
                ))}
              </div>
              {results.length > 0 && (
                <div className="results">
                  <h3>Search results</h3>
                  {results.map((result) => (
                    <button key={result.chunk_id} onClick={() => setPreview(result)}>
                      <strong>{result.name}</strong>
                      <span>
                        <span className={`channel-badge ${result.channel ?? dataSource}`}>
                          {result.channel === "online" ? "Online" : "Offline"}
                        </span>
                        {result.location}
                      </span>
                      <p>{result.text.slice(0, 170)}{result.text.length > 170 ? "…" : ""}</p>
                    </button>
                  ))}
                </div>
              )}
            </section>
            <section className="preview card">
              <div className="card-heading">
                <div><h2>Source preview</h2><span>Review before responding</span></div>
              </div>
              {preview ? (
                <article>
                  <p className="eyebrow">{preview.relative_path}</p>
                  <h3>{preview.name}</h3>
                  <span className="location">
                    {preview.channel === "online" ? "Online" : "Offline"} ·{" "}
                    {preview.location} · {preview.extraction}
                  </span>
                  <p className="excerpt">{preview.text}</p>
                </article>
              ) : (
                <div className="empty">
                  <Search size={30} />
                  <strong>Select a result</strong>
                  <span>The exact local excerpt will appear here.</span>
                </div>
              )}
            </section>
          </div>
          </div>
          {workspaceTab === "analytics" && (
            <Suspense fallback={<PanelLoading label="Loading local analytics" />}>
              {usage ? (
                <AnalyticsPanel usage={usage} />
              ) : (
                <PanelLoading label="Loading local analytics" />
              )}
            </Suspense>
          )}
          {workspaceTab === "architecture" && (
            <Suspense fallback={<PanelLoading label="Loading architecture" />}>
              <ArchitecturePanel />
            </Suspense>
          )}
        </section>
        <aside className="desktop-assistant">{assistant}</aside>
      </div>
      <button
        className="mira-fab mobile-only"
        aria-label="Open Mira"
        onClick={() => setMobileOpen(true)}
      >
        <Bot />
      </button>
      {mobileOpen && (
        <div className="mobile-drawer mobile-only">
          <button
            className="drawer-backdrop"
            aria-label="Close Mira"
            onClick={() => setMobileOpen(false)}
          />
          {assistant}
        </div>
      )}
    </main>
  );
}
