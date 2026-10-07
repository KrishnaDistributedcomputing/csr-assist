import {
  Bot,
  Check,
  CircleHelp,
  Cloud,
  Clipboard,
  FileSearch,
  HardDrive,
  Menu,
  Moon,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Sun,
  ThumbsDown,
  ThumbsUp,
  Upload,
  X
} from "lucide-react";
import {
  FormEvent,
  KeyboardEvent,
  lazy,
  Suspense,
  useEffect,
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
  OnlineDocumentRecord,
  ScanStatus,
  Source,
  UsageDashboard
} from "./types";

const searchProgressMessages = [
  "Searching extracted key facts",
  "Checking full document excerpts",
  "Ranking the best matches"
];

interface ChatProgressStep {
  title: string;
  detail: string;
}

interface ChatDurationEstimate {
  minimumSeconds: number;
  maximumSeconds: number;
}

function estimateChatDuration(
  source: "offline" | "online",
  modelName?: string
): ChatDurationEstimate {
  if (source === "online") {
    return { minimumSeconds: 10, maximumSeconds: 45 };
  }
  if (!modelName) {
    return { minimumSeconds: 1, maximumSeconds: 5 };
  }

  const normalizedModel = modelName.toLowerCase();
  if (normalizedModel.includes("3b")) {
    return { minimumSeconds: 90, maximumSeconds: 240 };
  }
  if (normalizedModel.includes("phi-3") || normalizedModel.includes("phi3")) {
    return { minimumSeconds: 60, maximumSeconds: 180 };
  }
  if (
    normalizedModel.includes("1b")
    || normalizedModel.includes("1.5b")
    || normalizedModel.includes("1.7b")
  ) {
    return { minimumSeconds: 30, maximumSeconds: 120 };
  }
  return { minimumSeconds: 60, maximumSeconds: 180 };
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds === 0
    ? `${minutes} min`
    : `${minutes} min ${remainingSeconds} sec`;
}

function formatDurationRange(minimumSeconds: number, maximumSeconds: number) {
  return `${formatDuration(minimumSeconds)}–${formatDuration(maximumSeconds)}`;
}

function buildChatProgressSteps(
  source: "offline" | "online",
  modelName?: string
): ChatProgressStep[] {
  if (source === "online") {
    return [
      {
        title: "Checking the answer cache",
        detail: "Looking for a verified answer from the current Azure index revision and model."
      },
      {
        title: "Querying Azure AI Search",
        detail: "Searching only administrator-approved Azure-indexed content."
      },
      {
        title: "Selecting grounded evidence",
        detail: "Removing weak matches and bounding the excerpts supplied for generation."
      },
      {
        title: `Generating with ${modelName || "Azure AI Foundry"}`,
        detail: "Sending the question and approved excerpts to the allowlisted Foundry deployment."
      },
      {
        title: "Validating citations and final answer",
        detail: "Checking citation markers and using a cited extractive fallback if generation is unusable."
      }
    ];
  }
  if (modelName) {
    return [
      {
        title: "Checking the answer cache",
        detail: "Looking for a verified answer for this local index revision and model."
      },
      {
        title: "Searching extracted facts",
        detail: "Using the local SQLite full-text index to find concise matching facts."
      },
      {
        title: "Retrieving and ranking excerpts",
        detail: "Comparing full document passages and selecting the strongest local evidence."
      },
      {
        title: `Loading ${modelName}`,
        detail: "Preparing the selected Ollama model inside the container. A cold model can take longer to load."
      },
      {
        title: "Generating and validating the cited answer",
        detail: "Running local CPU inference, checking citations, and falling back to cited extraction when needed."
      }
    ];
  }
  return [
    {
      title: "Checking the answer cache",
      detail: "Looking for a verified answer from the current local index revision."
    },
    {
      title: "Searching extracted facts",
      detail: "Using the local SQLite full-text index to find concise matching facts."
    },
    {
      title: "Retrieving and ranking excerpts",
      detail: "Comparing full document passages and selecting the strongest local evidence."
    },
    {
      title: "Composing a cited extractive answer",
      detail: "Building the response directly from retrieved sentences without calling an LLM."
    }
  ];
}

const ESTIMATED_INPUT_TOKENS = 2000;
const ESTIMATED_OUTPUT_TOKENS = 120;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatIndexedAt(value?: string) {
  if (!value) return "Not indexed";
  const parsed = new Date(`${value.replace(" ", "T")}Z`);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short"
      });
}

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

const tourSteps = [
  {
    target: "environment",
    section: "Deployment",
    title: "Choose an environment",
    detail: "Compare the on-premises Docker experience with the managed Azure path.",
    features: [
      "Docker keeps retrieval and optional Ollama inference local.",
      "Azure uses approved Azure AI Search and Foundry services."
    ],
    workspaceTab: "sources"
  },
  {
    target: "source",
    section: "Data boundary",
    title: "Confirm the knowledge boundary",
    detail: "The source notice always identifies which content is eligible for the current request.",
    features: [
      "Offline and Online indexes remain isolated.",
      "Changing the preview never copies or uploads documents."
    ],
    workspaceTab: "sources"
  },
  {
    target: "search",
    section: "Discovery",
    title: "Search approved knowledge",
    detail: "Enter a question, policy phrase, product name, or keyword to retrieve ranked matches.",
    features: [
      "Progress messages show retrieval and ranking activity.",
      "Channel badges distinguish local and Azure results."
    ],
    workspaceTab: "sources"
  },
  {
    target: "evidence",
    section: "Evidence",
    title: "Review exact source excerpts",
    detail: "Select a result to inspect the supporting passage before using or sharing an answer.",
    features: [
      "Document metadata identifies the source and location.",
      "Mira citations reopen the same reviewable evidence."
    ],
    workspaceTab: "sources"
  },
  {
    target: "analytics",
    section: "Operations",
    title: "Track quality and performance",
    detail: "Analytics summarizes request volume, latency, cache efficiency, token usage, and feedback.",
    features: [
      "Compare activity by model and day.",
      "Use cache and latency metrics to tune responsiveness."
    ],
    workspaceTab: "analytics"
  },
  {
    target: "architecture",
    section: "Technical design",
    title: "Explore architecture and LLM costs",
    detail: "Architecture explains both deployment paths, request routing, service inventory, and model economics.",
    features: [
      "Compare every enabled Docker and Azure model.",
      "Review region, service tier, token rates, and data flow."
    ],
    workspaceTab: "architecture"
  },
  {
    target: "compliance",
    section: "Governance",
    title: "Check compliance responsibilities",
    detail: "Compliance makes implemented safeguards and customer-owned controls visible for each boundary.",
    features: [
      "Review retention, access, accessibility, and data handling.",
      "Use the checklist as guidance, not as a certification."
    ],
    workspaceTab: "compliance"
  },
  {
    target: "model",
    section: "Model routing",
    title: "Select the right LLM",
    detail: "Mira routes each request only to an available, server-approved model for the active environment.",
    features: [
      "Docker offers installed Ollama models or fast retrieval without an LLM.",
      "Azure shows allowlisted Foundry deployments and estimated token cost."
    ],
    workspaceTab: "chat"
  },
  {
    target: "prompts",
    section: "Prompting",
    title: "Start with a guided prompt",
    detail: "Use common support tasks as a starting point, then edit the prompt before sending.",
    features: [
      "Draft responses, compare instructions, summarize, or identify gaps.",
      "Prompt selection never submits automatically."
    ],
    workspaceTab: "chat"
  },
  {
    target: "composer",
    section: "Grounded chat",
    title: "Ask Mira with source context",
    detail: "Write a focused question and send it to the selected retrieval and model path.",
    features: [
      "Live stages distinguish retrieval, generation, and citation work.",
      "Errors remain explicit and can be dismissed before retrying."
    ],
    workspaceTab: "chat"
  },
  {
    target: "assistant",
    section: "Review and reuse",
    title: "Validate the final answer",
    detail: "Review citations before sharing, then copy the response or record feedback when the deployment allows it.",
    features: [
      "Source cards open the exact excerpts used by Mira.",
      "History is private in production and disabled in the public demo."
    ],
    workspaceTab: "chat"
  }
] as const;
const AnalyticsPanel = lazy(() => import("./AnalyticsPanel"));
const ArchitecturePanel = lazy(() => import("./ArchitecturePanel"));
const CompliancePanel = lazy(() => import("./CompliancePanel"));
type WorkspaceTab = "chat" | "sources" | "analytics" | "architecture" | "compliance";
const workspaceTabs: WorkspaceTab[] = [
  "chat",
  "sources",
  "analytics",
  "architecture",
  "compliance"
];

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
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [onlineDocuments, setOnlineDocuments] = useState<OnlineDocumentRecord[]>([]);
  const [selectedOnlineDocumentIds, setSelectedOnlineDocumentIds] =
    useState<number[]>([]);
  const [deployment, setDeployment] = useState<DeploymentInfo>({
    read_only_demo: false,
    online_available: false,
    online_model: "",
    online_models: [],
    azure_region: "",
    azure_services: [],
    token_pricing_as_of: ""
  });
  const [dataSource, setDataSource] = useState<"offline" | "online">("offline");
  const [models, setModels] = useState<ModelRecord[]>([]);
  const [selectedOfflineModel, setSelectedOfflineModel] = useState("");
  const [selectedOnlineModel, setSelectedOnlineModel] = useState("");
  const [scan, setScan] = useState<ScanStatus | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Source[]>([]);
  const [preview, setPreview] = useState<Source | null>(null);
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState<ChatResponse | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [assistantTab, setAssistantTab] = useState<"chat" | "history">("chat");
  const [promptView, setPromptView] = useState<"suggested" | "all">("suggested");
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("chat");
  const [usage, setUsage] = useState<UsageDashboard | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [usageLoaded, setUsageLoaded] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState<"good" | "bad" | null>(null);
  const [chatPending, setChatPending] = useState(false);
  const [chatProgressSteps, setChatProgressSteps] = useState<ChatProgressStep[]>([]);
  const [chatProgressIndex, setChatProgressIndex] = useState(0);
  const [chatElapsedSeconds, setChatElapsedSeconds] = useState(0);
  const [chatProgressModel, setChatProgressModel] = useState("");
  const [chatDurationEstimate, setChatDurationEstimate] =
    useState<ChatDurationEstimate>({ minimumSeconds: 1, maximumSeconds: 5 });
  const [searchProgress, setSearchProgress] = useState("");
  const [chatError, setChatError] = useState("");
  const [searchPending, setSearchPending] = useState(false);
  const [documentPending, setDocumentPending] = useState(false);
  const [error, setError] = useState("");
  const [tourStep, setTourStep] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const helpButton = useRef<HTMLButtonElement>(null);
  const tourDialog = useRef<HTMLDivElement>(null);
  const tourOrigin = useRef<{
    workspaceTab: WorkspaceTab;
    assistantTab: "chat" | "history";
  } | null>(null);

  const appClassName = [
    "app",
    dark ? "dark" : "",
    widget ? "widget" : "",
    `source-${dataSource}`
  ].filter(Boolean).join(" ");
  const sourceBoundaryMessage =
    dataSource === "online"
      ? "Online mode searches only approved Azure-indexed sources. Offline documents are isolated and are not available in this mode."
      : "Offline mode searches only the local document index. Azure-hosted sources are not available in this mode.";
  const indexedDocuments = documents.filter(
    (document) => document.status === "ready"
  );
  const promptDocument = preview?.name ?? (
    dataSource === "online"
      ? results[0]?.name
      : indexedDocuments[0]?.name
  );
  const promptScope = promptDocument
    ? `"${promptDocument}"`
    : dataSource === "online"
      ? "the approved Azure documents"
      : "the indexed documents";
  const promptDocumentCount = dataSource === "online"
    ? new Set(results.map((result) => result.document_id)).size
    : indexedDocuments.length;
  const suggestedPrompts = [
    `Summarize ${promptScope}`,
    `Draft a customer-ready response using ${promptScope}`,
    promptDocumentCount > 1
      ? "Are there conflicting instructions across the indexed documents?"
      : `Are any instructions in ${promptScope} unclear or conflicting?`
  ];
  const allPrompts = [
    ...suggestedPrompts,
    `List the customer actions described in ${promptScope}`,
    `Which details in ${promptScope} support the answer?`,
    `What information is missing from ${promptScope}?`
  ];
  const visiblePrompts =
    promptView === "suggested" ? suggestedPrompts : allPrompts;
  const selectedModelId =
    dataSource === "online" ? selectedOnlineModel : selectedOfflineModel;
  const selectedModelDetails = (
    dataSource === "online" ? deployment.online_models : models
  ).find((model) => model.id === selectedModelId);
  const estimatedProviderCost =
    selectedModelDetails?.input_cost_per_million != null
    && selectedModelDetails.output_cost_per_million != null
      ? (
          ESTIMATED_INPUT_TOKENS
          * selectedModelDetails.input_cost_per_million
          + ESTIMATED_OUTPUT_TOKENS
          * selectedModelDetails.output_cost_per_million
        ) / 1_000_000
      : null;
  const indexedExcerpts = indexedDocuments.reduce(
    (total, document) => total + document.chunk_count,
    0
  );
  const indexedFacts = indexedDocuments.reduce(
    (total, document) => total + (document.key_fact_count ?? 0),
    0
  );
  const indexedBytes = indexedDocuments.reduce(
    (total, document) => total + document.size_bytes,
    0
  );

  async function refresh() {
    try {
      await Promise.all([
        api.deployment().then((nextDeployment) => {
          const onlineModels = nextDeployment.online_models ?? [];
          setDeployment({
            ...nextDeployment,
            online_models: onlineModels,
            azure_region: nextDeployment.azure_region ?? "",
            azure_services: nextDeployment.azure_services ?? [],
            token_pricing_as_of: nextDeployment.token_pricing_as_of ?? ""
          });
          setSelectedOnlineModel((current) =>
            onlineModels.some((model) => model.id === current)
              ? current
              : nextDeployment.online_model
          );
        }),
        api.documents().then(setDocuments),
        api.onlineDocuments().then((nextDocuments) => {
          setOnlineDocuments(nextDocuments);
          const availableIds = new Set(
            nextDocuments.map((document) => document.document_id)
          );
          setSelectedOnlineDocumentIds((current) => {
            if (current.length === 0) return current;
            const retained = current.filter((id) => availableIds.has(id));
            return retained.length === nextDocuments.length ? [] : retained;
          });
        }),
        api.scanStatus().then(setScan)
      ]);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load status");
    }
  }

  function goToTourStep(index: number) {
    const nextStep = tourSteps[index];
    setWorkspaceTab(nextStep.workspaceTab);
    setAssistantTab("chat");
    setTourStep(index);
  }

  function startTour() {
    tourOrigin.current = { workspaceTab, assistantTab };
    goToTourStep(0);
  }

  function closeTour() {
    const origin = tourOrigin.current;
    if (origin) {
      setWorkspaceTab(origin.workspaceTab);
      setAssistantTab(origin.assistantTab);
    }
    tourOrigin.current = null;
    setTourStep(null);
    window.requestAnimationFrame(() => helpButton.current?.focus());
  }

  useEffect(() => {
    void refresh();
    const modelTimer = window.setTimeout(() => {
      void api.models()
        .then((nextModels) => {
          setModels(nextModels);
          setSelectedOfflineModel((current) =>
            nextModels.some((model) => model.id === current && model.available)
              ? current
              : nextModels.find((model) => model.active && model.available)?.id
                ?? nextModels.find((model) => model.available)?.id
                ?? ""
          );
        })
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
    document.querySelectorAll(".tour-highlight").forEach((element) => {
      element.classList.remove("tour-highlight");
    });
    if (tourStep == null) return;

    const step = tourSteps[tourStep];
    const target = Array.from(
      document.querySelectorAll<HTMLElement>(
        `[data-tour="${step.target}"]`
      )
    ).find((element) => element.getClientRects().length > 0);
    target?.classList.add("tour-highlight");
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    tourDialog.current?.focus();

    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        closeTour();
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      target?.classList.remove("tour-highlight");
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [tourStep]);

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

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setSearchPending(true);
    setSearchProgress(searchProgressMessages[0]);
    let progressIndex = 0;
    const progressTimer = window.setInterval(() => {
      progressIndex = Math.min(progressIndex + 1, searchProgressMessages.length - 1);
      setSearchProgress(searchProgressMessages[progressIndex]);
    }, 700);
    try {
      const response = await api.search(
        query,
        dataSource,
        dataSource === "online" ? selectedOnlineDocumentIds : []
      );
      setResults(response.results);
      setPreview(response.results[0] ?? null);
      setHistoryLoaded(false);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Search failed");
    } finally {
      window.clearInterval(progressTimer);
      setSearchProgress("");
      setSearchPending(false);
    }
  }

  function handleWorkspaceTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const currentIndex = workspaceTabs.indexOf(workspaceTab);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % workspaceTabs.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + workspaceTabs.length) % workspaceTabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = workspaceTabs.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const nextTab = workspaceTabs[nextIndex];
    setWorkspaceTab(nextTab);
    window.requestAnimationFrame(() => {
      document.getElementById(`workspace-tab-${nextTab}`)?.focus();
    });
  }

  async function handleChat(event: FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    setChatPending(true);
    setAssistantTab("chat");
    const selectedModel =
      dataSource === "online" ? selectedOnlineModel : selectedOfflineModel;
    const progressModel = (
      dataSource === "online" ? deployment.online_models : models
    ).find((model) => model.id === selectedModel)?.name ?? selectedModel;
    const progressSteps = buildChatProgressSteps(
      dataSource,
      progressModel || undefined
    );
    setChatProgressSteps(progressSteps);
    setChatProgressIndex(0);
    setChatElapsedSeconds(0);
    setChatDurationEstimate(estimateChatDuration(dataSource, progressModel || undefined));
    setChatProgressModel(
      progressModel || (
        dataSource === "online"
          ? "Azure AI Foundry"
          : "Fast local retrieval"
      )
    );
    let progressIndex = 0;
    const progressTimer = window.setInterval(() => {
      progressIndex = Math.min(progressIndex + 1, progressSteps.length - 1);
      setChatProgressIndex(progressIndex);
    }, 1800);
    const elapsedTimer = window.setInterval(() => {
      setChatElapsedSeconds((seconds) => seconds + 1);
    }, 1000);
    setChatError("");
    try {
      const response = await api.chat(
        message,
        dataSource,
        selectedModel || undefined,
        dataSource === "online" ? selectedOnlineDocumentIds : []
      );
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
      window.clearInterval(elapsedTimer);
      setChatPending(false);
    }
  }

  async function handleScan() {
    setDocumentPending(true);
    try {
      await api.scan();
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Scan failed");
    } finally {
      setDocumentPending(false);
    }
  }

  async function handleUpload(file?: File) {
    if (!file) return;
    setDocumentPending(true);
    try {
      await api.upload(file);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed");
    } finally {
      setDocumentPending(false);
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
        aria-pressed={dataSource === "offline"}
        onClick={() => selectDataSource("offline")}
        type="button"
      >
        <HardDrive size={15} /> Offline
      </button>
      <button
        className={dataSource === "online" ? "active online" : ""}
        aria-pressed={dataSource === "online"}
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

  function toggleOnlineDocument(documentId: number) {
    const allIds = onlineDocuments.map((document) => document.document_id);
    setSelectedOnlineDocumentIds((current) => {
      const selected = current.length === 0 ? allIds : current;
      const next = selected.includes(documentId)
        ? selected.filter((id) => id !== documentId)
        : [...selected, documentId];
      const normalized = [...new Set(next)].sort((left, right) => left - right);
      return normalized.length === 0 || normalized.length === allIds.length
        ? []
        : normalized;
    });
    setResults([]);
    setPreview(null);
    setAnswer(null);
  }

  const azureGroundingSelector = dataSource === "online" && (
    <details className="azure-grounding-selector">
      <summary>
        <span>
          <FileSearch size={15} />
          <strong>Grounding documents</strong>
        </span>
        <small>
          {selectedOnlineDocumentIds.length === 0
            ? `All ${onlineDocuments.length} Azure documents`
            : `${selectedOnlineDocumentIds.length} of ${onlineDocuments.length} selected`}
        </small>
      </summary>
      <div className="azure-grounding-options">
        <label>
          <input
            type="checkbox"
            checked={selectedOnlineDocumentIds.length === 0}
            onChange={() => {
              setSelectedOnlineDocumentIds([]);
              setResults([]);
              setPreview(null);
              setAnswer(null);
            }}
          />
          <span>
            <strong>All Azure documents</strong>
            <small>Use every approved document in the managed index.</small>
          </span>
        </label>
        {onlineDocuments.map((document) => (
          <label key={document.document_id}>
            <input
              type="checkbox"
              checked={
                selectedOnlineDocumentIds.length === 0
                || selectedOnlineDocumentIds.includes(document.document_id)
              }
              onChange={() => toggleOnlineDocument(document.document_id)}
            />
            <span>
              <strong>{document.name}</strong>
              <small>{document.relative_path}</small>
            </span>
          </label>
        ))}
        {onlineDocuments.length === 0 && (
          <p>No approved Azure documents are currently available.</p>
        )}
      </div>
    </details>
  );

  const assistant = (
    <section className="assistant-panel" aria-label="Mira assistant">
      <header className="assistant-header">
        <div className="assistant-sparkle"><Sparkles size={21} /></div>
        <div className="assistant-identity">
          <div>
            <strong>Mira AI Assistant</strong>
            <span className="assistant-badge">Grounded</span>
          </div>
          <small>Your friendly document guide</small>
        </div>
        {widget && (
          <button
            className="icon-button"
            aria-label="Close Mira"
            onClick={() =>
              window.parent.postMessage("csr-assist-close", window.location.origin)
            }
          >
            <X />
          </button>
        )}
      </header>
      <div className="assistant-context">
        <div className="assistant-context-heading">
          <span>
            <strong>Knowledge source</strong>
            <small>{dataSource === "online" ? "Azure AI" : "Local index"}</small>
          </span>
          {sourceToggle}
        </div>
        <p className={`source-boundary-notice ${dataSource}`} role="note">
          {sourceBoundaryMessage}
        </p>
        {azureGroundingSelector}
        <div className="model-selector" data-tour="model">
          <label htmlFor="chat-model">
            {dataSource === "online" ? "Azure LLM model" : "Docker LLM model"}
          </label>
          <select
            id="chat-model"
            aria-label={
              dataSource === "online" ? "Azure LLM model" : "Docker LLM model"
            }
            value={
              dataSource === "online"
                ? selectedOnlineModel
                : selectedOfflineModel
            }
            onChange={(event) => {
              if (dataSource === "online") {
                setSelectedOnlineModel(event.target.value);
              } else {
                setSelectedOfflineModel(event.target.value);
              }
            }}
          >
            {dataSource === "offline" && (
              <option value="">Fast local index (no LLM)</option>
            )}
            {(dataSource === "online"
              ? deployment.online_models
              : models
            ).map((model) => (
              <option
                key={model.id}
                value={model.id}
                disabled={!model.available}
              >
                {model.provider} · {model.name}
                {!model.available ? " · Setup required" : ""}
              </option>
            ))}
            {dataSource === "online" && deployment.online_models.length === 0 && (
              <option value="">No Azure model configured</option>
            )}
          </select>
          <small>
            {dataSource === "online"
              ? "Answers use the selected managed Foundry deployment."
              : selectedOfflineModel
                ? "Answers use the selected model installed in Docker."
                : "Answers use fast extractive retrieval without an LLM."}
          </small>
          <div className="token-cost-summary" aria-label="Selected model token cost">
            <strong>
              {selectedModelDetails
                ? dataSource === "offline"
                  ? "$0 provider token charge"
                  : estimatedProviderCost == null
                    ? "Token price not configured"
                    : `$${estimatedProviderCost.toFixed(6)} estimated per request`
                : "No LLM token charge"}
            </strong>
            <span>
              {selectedModelDetails
                ? selectedModelDetails.input_cost_per_million == null
                  || selectedModelDetails.output_cost_per_million == null
                  ? selectedModelDetails.pricing_note
                  : `$${selectedModelDetails.input_cost_per_million.toFixed(3)} input / `
                    + `$${selectedModelDetails.output_cost_per_million.toFixed(3)} output per 1M tokens. `
                    + `Estimate assumes ${ESTIMATED_INPUT_TOKENS.toLocaleString()} input and `
                    + `${ESTIMATED_OUTPUT_TOKENS} output tokens.`
                : "Fast local retrieval does not invoke an LLM."}
            </span>
          </div>
        </div>
      </div>
      <div
        className="assistant-tabs"
        role="tablist"
        aria-label="Mira panels"
        data-tour="prompts"
      >
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
              <div className="mira-greeting">
                <div className="mira-greeting-icon">
                  <Sparkles size={22} />
                </div>
                <div className="mira-greeting-copy">
                  <span className="mira-welcome-kicker">Ready when you are</span>
                  <h2>What can I help you find?</h2>
                  <p>
                    Ask a question, create a customer-ready response, or explore
                    the guidance in your {dataSource === "online" ? "approved Azure sources" : "local documents"}.
                  </p>
                  <div className="mira-capabilities" aria-label="Assistant capabilities">
                    <span><Check size={12} /> Grounded answers</span>
                    <span><FileSearch size={12} /> Source citations</span>
                    <span>
                      {dataSource === "online" ? <Cloud size={12} /> : <HardDrive size={12} />}
                      {dataSource === "online" ? "Approved sources" : "Stays local"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="prompt-section-heading">
                <div>
                  <strong>Try a starting point</strong>
                  <span>Select a task, then personalize it before sending.</span>
                </div>
                <div className="prompt-tabs" role="tablist" aria-label="Prompt gallery">
                  <button
                    role="tab"
                    aria-selected={promptView === "suggested"}
                    className={promptView === "suggested" ? "active" : ""}
                    onClick={() => setPromptView("suggested")}
                  >
                    Suggested
                  </button>
                  <button
                    role="tab"
                    aria-selected={promptView === "all"}
                    className={promptView === "all" ? "active" : ""}
                    onClick={() => setPromptView("all")}
                  >
                    All prompts
                  </button>
                </div>
              </div>
              <div className="prompt-list">
                {visiblePrompts.map((prompt, index) => (
                  <button
                    key={prompt}
                    onClick={() => {
                      setMessage(prompt);
                      setAssistantTab("chat");
                    }}
                    className="prompt"
                  >
                    <span className="prompt-icon">
                      {index === 0 ? <FileSearch size={17} /> : index === 1 ? <Bot size={17} /> : <Check size={17} />}
                    </span>
                    <span className="prompt-copy">
                      <small>{index === 0 ? "Understand" : index === 1 ? "Respond" : "Review"}</small>
                      <strong>{prompt}</strong>
                    </span>
                    <Send size={15} />
                  </button>
                ))}
              </div>
              <button
                className="prompt-gallery-link"
                onClick={() => setPromptView("all")}
              >
                <Sparkles size={16} /> Browse document prompt gallery
              </button>
            </div>
          )}
          {chatPending && (
            <div className="chat-progress" role="status">
              <div className="chat-progress-heading">
                <RefreshCw className="spin" size={18} />
                <div>
                  <strong>
                    {dataSource === "online"
                      ? "Mira is reviewing Azure sources"
                      : "Mira is reviewing local sources"}
                  </strong>
                  <span>
                    {chatProgressModel} · Elapsed {formatElapsed(chatElapsedSeconds)}
                  </span>
                </div>
              </div>
              <div className="chat-progress-estimate">
                <strong>
                  Estimated total{" "}
                  {formatDurationRange(
                    chatDurationEstimate.minimumSeconds,
                    chatDurationEstimate.maximumSeconds
                  )}
                </strong>
                <span>
                  {chatElapsedSeconds >= chatDurationEstimate.maximumSeconds
                    ? "Taking longer than usual; local CPU load and a cold model can extend this estimate."
                    : `Estimated remaining ${formatDurationRange(
                        Math.max(
                          chatDurationEstimate.minimumSeconds - chatElapsedSeconds,
                          0
                        ),
                        chatDurationEstimate.maximumSeconds - chatElapsedSeconds
                      )}`}
                </span>
              </div>
              <p>{chatProgressSteps[chatProgressIndex]?.detail}</p>
              <ol className="chat-progress-steps" aria-label="Estimated request flow">
                {chatProgressSteps.map((step, index) => (
                  <li
                    key={step.title}
                    className={
                      index < chatProgressIndex
                        ? "complete"
                        : index === chatProgressIndex
                          ? "current"
                          : ""
                    }
                  >
                    <span>
                      {index < chatProgressIndex ? <Check size={11} /> : index + 1}
                    </span>
                    <div>
                      <strong>{step.title}</strong>
                      {index === chatProgressIndex && <small>{step.detail}</small>}
                    </div>
                  </li>
                ))}
              </ol>
              <div className="chat-progress-boundary">
                <strong>Data boundary</strong>
                <span>
                  {dataSource === "online"
                    ? "Only the question and bounded approved excerpts are sent to the allowlisted Azure services."
                    : chatProgressModel === "Fast local retrieval"
                      ? "Search and answer composition stay local. No LLM is called."
                      : "The question, retrieved excerpts, and model inference stay inside this container."}
                </span>
              </div>
              <small className="chat-progress-note">
                Stage timing is estimated because the server returns the completed answer
                in one response. Local CPU inference and cold model loading can take a few minutes.
              </small>
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
          <form className="chat-form" onSubmit={handleChat} data-tour="composer">
            <div className="composer-heading">
              <label htmlFor="mira-message">Ask Mira</label>
              <span>{dataSource === "online" ? "Approved Azure sources" : "Your local document index"}</span>
            </div>
            <textarea
              id="mira-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={
                dataSource === "online"
                  ? "What would you like to know from the approved Azure sources?"
                  : "What would you like to know from your local documents?"
              }
              aria-label="Message Mira"
              rows={3}
            />
            <button
              className="send-button"
              aria-label="Send"
              disabled={chatPending || !message.trim()}
            >
              <Send size={19} />
              <span>Send question</span>
            </button>
            <small className="composer-shortcut">Ctrl/⌘ + Enter to send</small>
          </form>
          <p className="accuracy-note">
            Citations support review but do not guarantee model accuracy.
          </p>
        </>
      )}
    </section>
  );

  if (widget) {
    return <main className={appClassName}>{assistant}</main>;
  }

  return (
    <main className={appClassName}>
      <a className="skip-link" href="#workspace-content">Skip to workspace</a>
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
          {deployment.read_only_demo ? (
            <div className="environment-preview" data-tour="environment">
              <span>Environment preview</span>
              <div
                className="environment-toggle"
                role="group"
                aria-label="Environment preview"
              >
                <button
                  type="button"
                  className={dataSource === "offline" ? "active" : ""}
                  aria-label="Docker on-premises"
                  aria-pressed={dataSource === "offline"}
                  onClick={() => selectDataSource("offline")}
                >
                  <HardDrive size={14} /> Docker
                </button>
                <button
                  type="button"
                  className={dataSource === "online" ? "active" : ""}
                  aria-label="Azure cloud"
                  aria-pressed={dataSource === "online"}
                  disabled={!deployment.online_available}
                  onClick={() => selectDataSource("online")}
                >
                  <Cloud size={14} /> Azure
                </button>
              </div>
            </div>
          ) : (
            <span className="local-pill" data-tour="environment">
              {dataSource === "online" ? <Cloud size={14} /> : <Check size={14} />}
              <span className="mode-label-full">
                {dataSource === "online" ? "Online · Azure AI" : "Offline · Local index"}
              </span>
              <span className="mode-label-short">
                {dataSource === "online" ? "Online" : "Offline"}
              </span>
            </span>
          )}
          <button
            ref={helpButton}
            className="help-button"
            type="button"
            onClick={startTour}
          >
            <CircleHelp size={16} /> How to use
          </button>
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
        <section
          className={`documents-pane ${workspaceTab === "chat" ? "chat-workspace" : ""}`}
          id="workspace-content"
        >
          <div className="workspace-heading">
            <div>
              <p className="eyebrow">
                {workspaceTab === "chat" ? "Grounded assistant" : "Document workspace"}
              </p>
              <h1>
                {dataSource === "online"
                  ? "Search approved Azure knowledge"
                  : deployment.read_only_demo
                  ? "Explore grounded answers from sample content"
                  : "Find answers in your local knowledge"}
              </h1>
              <p>
                {dataSource === "online"
                  ? "Search and ask questions using only administrator-approved Azure sources."
                  : deployment.read_only_demo
                  ? "Compare cited answers from the bundled offline index and Azure AI."
                  : "Search, review, and cite documents without sending data anywhere."}
              </p>
            </div>
            {workspaceTab === "sources" && (
              dataSource === "online" ? (
                <div className="managed-source-note">
                  <Cloud size={19} />
                  <span>
                    <strong>Managed Azure index</strong>
                    <small>Offline files are not available here</small>
                  </span>
                </div>
              ) : (
                <div className="workspace-actions">
                  <input
                    ref={fileInput}
                    type="file"
                    hidden
                    onChange={(event) => void handleUpload(event.target.files?.[0])}
                  />
                  {deployment.read_only_demo ? (
                    <span className="upload-status">
                      <Upload size={17} /> Uploads disabled
                    </span>
                  ) : (
                    <button
                      className="secondary"
                      disabled={documentPending}
                      onClick={() => fileInput.current?.click()}
                    >
                      <Upload size={17} /> Upload
                    </button>
                  )}
                  <button
                    className="primary"
                    onClick={() => void handleScan()}
                    disabled={documentPending}
                  >
                    <RefreshCw size={17} className={scan?.state === "running" ? "spin" : ""} />
                    {deployment.read_only_demo ? "Refresh samples" : "Scan documents"}
                  </button>
                </div>
              )
            )}
          </div>
          <div
            className="workspace-tabs"
            role="tablist"
            aria-label="Workspace panels"
            data-tour="workspace"
          >
            <button
              id="workspace-tab-chat"
              role="tab"
              aria-selected={workspaceTab === "chat"}
              aria-controls="workspace-panel-chat"
              tabIndex={workspaceTab === "chat" ? 0 : -1}
              className={workspaceTab === "chat" ? "active" : ""}
              onClick={() => setWorkspaceTab("chat")}
              onKeyDown={handleWorkspaceTabKeyDown}
            >
              <Bot size={15} /> Assistant
            </button>
            <button
              id="workspace-tab-sources"
              role="tab"
              aria-selected={workspaceTab === "sources"}
              aria-controls="workspace-panel-sources"
              tabIndex={workspaceTab === "sources" ? 0 : -1}
              className={workspaceTab === "sources" ? "active" : ""}
              onClick={() => setWorkspaceTab("sources")}
              onKeyDown={handleWorkspaceTabKeyDown}
            >
              <FileSearch size={15} /> Sources
            </button>
            <button
              id="workspace-tab-analytics"
              role="tab"
              aria-selected={workspaceTab === "analytics"}
              aria-controls="workspace-panel-analytics"
              tabIndex={workspaceTab === "analytics" ? 0 : -1}
              className={workspaceTab === "analytics" ? "active" : ""}
              onClick={() => setWorkspaceTab("analytics")}
              onKeyDown={handleWorkspaceTabKeyDown}
            >
              <RefreshCw size={15} /> Analytics
            </button>
            <button
              id="workspace-tab-architecture"
              role="tab"
              aria-selected={workspaceTab === "architecture"}
              aria-controls="workspace-panel-architecture"
              tabIndex={workspaceTab === "architecture" ? 0 : -1}
              className={workspaceTab === "architecture" ? "active" : ""}
              onClick={() => setWorkspaceTab("architecture")}
              onKeyDown={handleWorkspaceTabKeyDown}
            >
              <Menu size={15} /> Architecture
            </button>
            <button
              id="workspace-tab-compliance"
              role="tab"
              aria-selected={workspaceTab === "compliance"}
              aria-controls="workspace-panel-compliance"
              tabIndex={workspaceTab === "compliance" ? 0 : -1}
              className={workspaceTab === "compliance" ? "active" : ""}
              onClick={() => setWorkspaceTab("compliance")}
              onKeyDown={handleWorkspaceTabKeyDown}
            >
              <Check size={15} /> Compliance
            </button>
          </div>
          {workspaceTab === "chat" && (
            <div
              id="workspace-panel-chat"
              className="workspace-chat"
              role="tabpanel"
              aria-labelledby="workspace-tab-chat"
              data-tour="assistant"
            >
              {assistant}
            </div>
          )}
          <div
            id="workspace-panel-sources"
            role="tabpanel"
            aria-labelledby="workspace-tab-sources"
            hidden={workspaceTab !== "sources"}
          >
          <div className="source-mode-bar" data-tour="source">
            <div>
              <strong>
                {dataSource === "online" ? "Online search" : "Offline search"}
              </strong>
              <span>
                {dataSource === "online"
                  ? "Only approved Azure-indexed sources are available. Offline documents are isolated and won’t be searched."
                  : "Only local SQLite documents are available. Azure-hosted sources won’t be searched."}
              </span>
            </div>
            {sourceToggle}
          </div>
          {azureGroundingSelector}
          <form className="search-bar" onSubmit={handleSearch} data-tour="search">
            <Search size={20} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                dataSource === "online"
                  ? "Search approved Azure sources"
                  : "Search local policies, procedures, and product information"
              }
              aria-label="Search documents"
            />
            <button disabled={searchPending || !query.trim()}>Search</button>
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
          <div className="content-grid" data-tour="evidence">
            <section className="library card">
              <div className="card-heading">
                <div>
                  <h2>{dataSource === "online" ? "Azure search results" : "Documents"}</h2>
                  <span>
                    {dataSource === "online"
                      ? "Approved online sources"
                      : `${documents.length} offline files`}
                  </span>
                </div>
                {dataSource === "offline" && scan && (
                  <span className={`status ${scan.state}`}>{scan.state}</span>
                )}
              </div>
              {dataSource === "offline" ? (
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
              ) : results.length === 0 ? (
                <div className="empty">
                  <Cloud size={30} />
                  <strong>Search the Azure index</strong>
                  <span>Results will include only approved online sources.</span>
                </div>
              ) : null}
              {dataSource === "offline" && documents.length > 0 && (
                <section className="indexed-data" aria-label="Indexed data">
                  <div className="indexed-data-heading">
                    <div>
                      <p className="eyebrow">Search index</p>
                      <h3>Indexed data</h3>
                    </div>
                    <span>{indexedDocuments.length} search-ready documents</span>
                  </div>
                  <div className="indexed-data-summary">
                    <div><span>Documents</span><strong>{indexedDocuments.length}</strong></div>
                    <div><span>Excerpts</span><strong>{indexedExcerpts}</strong></div>
                    <div><span>Extracted facts</span><strong>{indexedFacts}</strong></div>
                    <div><span>Source size</span><strong>{formatBytes(indexedBytes)}</strong></div>
                  </div>
                  <div className="indexed-document-list">
                    {documents.map((document) => (
                      <article key={document.id}>
                        <div>
                          <strong>{document.name}</strong>
                          <span>{document.relative_path}</span>
                        </div>
                        <dl>
                          <div><dt>Excerpts</dt><dd>{document.chunk_count}</dd></div>
                          <div><dt>Facts</dt><dd>{document.key_fact_count ?? 0}</dd></div>
                          <div><dt>Size</dt><dd>{formatBytes(document.size_bytes)}</dd></div>
                          <div><dt>Indexed</dt><dd>{formatIndexedAt(document.indexed_at)}</dd></div>
                        </dl>
                      </article>
                    ))}
                  </div>
                </section>
              )}
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
                  <span>
                    {dataSource === "online"
                      ? "The exact approved Azure excerpt will appear here."
                      : "The exact local excerpt will appear here."}
                  </span>
                </div>
              )}
            </section>
          </div>
          </div>
          {workspaceTab === "analytics" && (
            <div
              id="workspace-panel-analytics"
              role="tabpanel"
              aria-labelledby="workspace-tab-analytics"
              data-tour="analytics"
            >
              <Suspense fallback={<PanelLoading label="Loading local analytics" />}>
                {usage ? (
                  <AnalyticsPanel usage={usage} />
                ) : (
                  <PanelLoading label="Loading local analytics" />
                )}
              </Suspense>
            </div>
          )}
          {workspaceTab === "architecture" && (
            <div
              id="workspace-panel-architecture"
              role="tabpanel"
              aria-labelledby="workspace-tab-architecture"
              data-tour="architecture"
            >
              <Suspense fallback={<PanelLoading label="Loading architecture" />}>
                <ArchitecturePanel
                  deployment={deployment}
                  localModels={models}
                />
              </Suspense>
            </div>
          )}
          {workspaceTab === "compliance" && (
            <div
              id="workspace-panel-compliance"
              role="tabpanel"
              aria-labelledby="workspace-tab-compliance"
              data-tour="compliance"
            >
              <Suspense fallback={<PanelLoading label="Loading compliance details" />}>
                <CompliancePanel
                  source={dataSource}
                  readOnlyDemo={deployment.read_only_demo}
                />
              </Suspense>
            </div>
          )}
        </section>
      </div>
      {workspaceTab !== "chat" && (
        <button
          className="mira-fab mobile-only"
          aria-label="Open Chat"
          data-tour="assistant"
          onClick={() => setWorkspaceTab("chat")}
        >
          <Bot size={20} />
          <span>Open Chat</span>
        </button>
      )}
      {tourStep != null && (
        <div
          className="tour-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-title"
          aria-describedby="tour-detail"
          ref={tourDialog}
          tabIndex={-1}
        >
          <div className="tour-heading">
            <span>
              Guided demo · {tourSteps[tourStep].section} · {tourStep + 1} of{" "}
              {tourSteps.length}
            </span>
            <button aria-label="Close guided demo" onClick={closeTour}>
              <X size={18} />
            </button>
          </div>
          <div className="tour-icon"><Sparkles size={20} /></div>
          <h2 id="tour-title">{tourSteps[tourStep].title}</h2>
          <p id="tour-detail">{tourSteps[tourStep].detail}</p>
          <ul className="tour-features">
            {tourSteps[tourStep].features.map((feature) => (
              <li key={feature}><Check size={14} /> <span>{feature}</span></li>
            ))}
          </ul>
          <div className="tour-progress" aria-label="Guided demo steps">
            {tourSteps.map((step, index) => (
              <button
                key={step.title}
                className={index === tourStep ? "active" : ""}
                aria-label={`Go to step ${index + 1}: ${step.title}`}
                aria-current={index === tourStep ? "step" : undefined}
                onClick={() => goToTourStep(index)}
              />
            ))}
          </div>
          <div className="tour-actions">
            <button className="tour-skip" onClick={closeTour}>Skip tour</button>
            <div>
              <button
                className="secondary"
                disabled={tourStep === 0}
                onClick={() => goToTourStep(Math.max(tourStep - 1, 0))}
              >
                Back
              </button>
              <button
                className="primary"
                onClick={() => {
                  if (tourStep === tourSteps.length - 1) closeTour();
                  else goToTourStep(tourStep + 1);
                }}
              >
                {tourStep === tourSteps.length - 1 ? "Finish" : "Next"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
