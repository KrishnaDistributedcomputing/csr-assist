import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import App from "../src/App";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const value = url.includes("/models")
        ? []
        : url.includes("/deployment")
          ? {
              read_only_demo: false,
              online_available: false,
              online_model: ""
            }
        : url.includes("/usage")
          ? {
              totals: {
                requests: 0,
                cache_hits: 0,
                cache_hit_rate: 0,
                prompt_tokens: 0,
                output_tokens: 0,
                total_tokens: 0,
                avg_latency_ms: 0
              },
              by_model: [],
              daily: [],
              key_facts: 0,
              cached_answers: 0,
              corpus_revision: 1,
              feedback: { total: 0, good: 0, bad: 0 }
            }
        : url.includes("/scan/status")
          ? { state: "idle", id: "", discovered: 0, processed: 0, unchanged: 0, removed: 0, errors: 0 }
          : [];
      return new Response(JSON.stringify(value), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    })
  );
});

afterEach(() => {
  cleanup();
});

test("renders the document workspace and Mira", async () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: /find answers/i })).toBeInTheDocument();
  expect(screen.getByLabelText("Mira assistant")).toBeInTheDocument();
  expect(await screen.findByText("No documents indexed")).toBeInTheDocument();
  expect(screen.getByText("Hello! How can I help?")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "All document prompts" }));
  expect(
    screen.getByText("What information is missing from the indexed documents?")
  ).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /Online/ })[0]).toBeDisabled();
  expect(screen.queryByLabelText("Token usage dashboard")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: /Analytics/ }));
  expect(
    await screen.findByLabelText(
      "Token usage dashboard",
      {},
      { timeout: 5000 }
    )
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: /Architecture/ }));
  expect(
    await screen.findByLabelText("System architecture", {}, { timeout: 5000 })
  ).toBeInTheDocument();
  expect(screen.getByLabelText("LLM token cost matrix")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: /Compliance/ }));
  expect(
    await screen.findByLabelText(
      "Data and accessibility compliance",
      {},
      { timeout: 5000 }
    )
  ).toBeInTheDocument();
  expect(screen.getByText(/not a certification or legal opinion/i)).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Local processing boundary" })
  ).toBeInTheDocument();
  expect(screen.getByText("No Azure AI transfer")).toBeInTheDocument();
  expect(screen.getByText(/Customer-data boundary: Offline/i)).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: /Official standard/i })
  ).toHaveAttribute("href", expect.stringContaining("11-software"));
  fireEvent.click(screen.getByRole("tab", { name: "Assistant" }));
  fireEvent.click(screen.getByRole("tab", { name: /History/ }));
  expect(screen.getByText("No history yet")).toBeInTheDocument();
  expect(screen.queryByLabelText("Message Mira")).not.toBeInTheDocument();
}, 15000);

test("workspace tabs support keyboard navigation", async () => {
  render(<App />);
  const assistant = screen.getByRole("tab", { name: "Assistant" });
  assistant.focus();
  fireEvent.keyDown(assistant, { key: "End" });

  const compliance = screen.getByRole("tab", { name: "Compliance" });
  expect(compliance).toHaveAttribute("aria-selected", "true");
  expect(
    await screen.findByLabelText("Data and accessibility compliance")
  ).toBeInTheDocument();
});

test("shows indexed data and document-aware prompts", async () => {
  const currentFetch = vi.mocked(fetch);
  const defaultFetch = currentFetch.getMockImplementation();
  currentFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("/documents")) {
      return Promise.resolve(new Response(JSON.stringify([{
        id: 7,
        relative_path: "policies/returns.md",
        name: "returns.md",
        extension: ".md",
        size_bytes: 2048,
        status: "ready",
        chunk_count: 4,
        key_fact_count: 6,
        indexed_at: "2026-10-06 20:00:00"
      }]), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }));
    }
    if (!defaultFetch) throw new Error("Default fetch mock is unavailable");
    return defaultFetch(input, init);
  });

  render(<App />);
  expect(await screen.findByLabelText("Indexed data")).toBeInTheDocument();
  expect(screen.getByText("1 search-ready documents")).toBeInTheDocument();
  expect(screen.getByText('Summarize "returns.md"')).toBeInTheDocument();
  expect(
    screen.getByText('Draft a customer-ready response using "returns.md"')
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Indexed data")).toHaveTextContent("6");
  expect(screen.getByLabelText("Indexed data")).toHaveTextContent("2.0 KB");
});

test("document search does not disable a prepared chat message", async () => {
  const currentFetch = vi.mocked(fetch);
  const defaultFetch = currentFetch.getMockImplementation();
  let finishSearch: ((response: Response) => void) | undefined;
  const pendingSearch = new Promise<Response>((resolve) => {
    finishSearch = resolve;
  });
  currentFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("/search?")) return pendingSearch;
    if (!defaultFetch) throw new Error("Default fetch mock is unavailable");
    return defaultFetch(input, init);
  });

  render(<App />);
  fireEvent.click(screen.getByRole("tab", { name: "Sources" }));
  fireEvent.change(screen.getByLabelText("Search documents"), {
    target: { value: "return policy" }
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();

  fireEvent.click(screen.getByRole("tab", { name: "Assistant" }));
  fireEvent.change(screen.getByLabelText("Message Mira"), {
    target: { value: "What is the return policy?" }
  });
  expect(screen.getByRole("button", { name: "Send" })).not.toBeDisabled();

  await act(async () => {
    finishSearch?.(new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));
    await pendingSearch;
  });
});

test("guided demo explains the workspace step by step", async () => {
  render(<App />);
  const help = screen.getByRole("button", { name: "How to use" });

  fireEvent.click(help);

  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Choose an environment" })
  ).toBeInTheDocument();
  expect(screen.getByText(/Guided demo · Deployment · 1 of 11/)).toBeInTheDocument();
  expect(
    screen.getByText("Docker keeps retrieval and optional Ollama inference local.")
  ).toBeInTheDocument();

  for (const title of [
    "Confirm the knowledge boundary",
    "Search approved knowledge",
    "Review exact source excerpts",
    "Track quality and performance",
    "Explore architecture and LLM costs",
    "Check compliance responsibilities",
    "Select the right LLM",
    "Start with a guided prompt",
    "Ask Mira with source context",
    "Validate the final answer"
  ]) {
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
  }

  fireEvent.click(screen.getByRole("button", { name: "Finish" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await waitFor(() => expect(help).toHaveFocus());
});

test("guided demo supports direct feature navigation and restores the workspace", async () => {
  render(<App />);
  fireEvent.click(screen.getByRole("tab", { name: /Compliance/ }));
  expect(
    await screen.findByLabelText("Data and accessibility compliance")
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "How to use" }));
  fireEvent.click(
    screen.getByRole("button", {
      name: "Go to step 6: Explore architecture and LLM costs"
    })
  );

  expect(
    screen.getByRole("heading", { name: "Explore architecture and LLM costs" })
  ).toBeInTheDocument();
  expect(
    await screen.findByLabelText("System architecture")
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Close guided demo" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(
    await screen.findByLabelText("Data and accessibility compliance")
  ).toBeInTheDocument();
});

test("public demo can preview Docker and Azure environments", async () => {
  const currentFetch = vi.mocked(fetch);
  let chatRequest: Record<string, string> | undefined;
  currentFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/chat")) {
      chatRequest = JSON.parse(String(init?.body)) as Record<string, string>;
      return new Response(JSON.stringify({
        state: "answered",
        text: "Grounded answer [1]",
        model: "azure-foundry:gpt-4o-mini",
        citations: [],
        sources: [],
        cached: false,
        history_id: 0
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    const value = url.includes("/deployment")
      ? {
          read_only_demo: true,
          online_available: true,
          online_model: "phi-4-mini",
          online_models: [
            {
              id: "phi-4-mini",
              provider: "Azure AI Foundry",
              name: "Phi-4 Mini",
              installed: true,
              available: true,
              active: true,
              input_cost_per_million: 0.075,
              output_cost_per_million: 0.3,
              pricing_note: "Estimated Azure provider-token rate."
            },
            {
              id: "gpt-4o-mini",
              provider: "Azure AI Foundry",
              name: "GPT-4o Mini",
              installed: true,
              available: true,
              active: false,
              input_cost_per_million: 0.15,
              output_cost_per_million: 0.6,
              pricing_note: "Test rate."
            }
          ],
          azure_region: "West US 2",
          azure_services: [
            {
              name: "Azure AI Search",
              resource: "srch-csr-assist-kvenk26",
              region: "West US 2",
              sku: "Free",
              billing_basis: "Provisioned search capacity; not token-priced"
            }
          ],
          token_pricing_as_of: "2026-10-06"
        }
      : url.includes("/scan/status")
        ? {
            state: "idle",
            id: "",
            discovered: 0,
            processed: 0,
            unchanged: 0,
            removed: 0,
            errors: 0
          }
        : [];
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  });

  render(<App />);

  const docker = await screen.findByRole("button", {
    name: "Docker on-premises"
  });
  const azure = screen.getByRole("button", { name: "Azure cloud" });
  expect(docker).toHaveAttribute("aria-pressed", "true");
  expect(azure).toHaveAttribute("aria-pressed", "false");

  fireEvent.click(azure);

  expect(azure).toHaveAttribute("aria-pressed", "true");
  expect(docker).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByText("Online search")).toBeInTheDocument();
  expect(
    screen.getAllByText(/approved Azure-indexed sources/i).length
  ).toBeGreaterThan(0);
  fireEvent.change(screen.getByLabelText("Azure LLM model"), {
    target: { value: "gpt-4o-mini" }
  });
  expect(screen.getByLabelText("Selected model token cost")).toHaveTextContent(
    "$0.000372 estimated per request"
  );
  fireEvent.change(screen.getByLabelText("Message Mira"), {
    target: { value: "What is supported?" }
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));

  await waitFor(() => {
    expect(chatRequest).toMatchObject({
      source: "online",
      model: "gpt-4o-mini"
    });
  });
});

test("reports an actionable error when an API route returns HTML", async () => {
  const currentFetch = vi.mocked(fetch);
  currentFetch.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/deployment")) {
      return new Response("<!doctype html><title>CSR Assist</title>", {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }
    const value = url.includes("/scan/status")
      ? {
          state: "idle",
          id: "",
          discovered: 0,
          processed: 0,
          unchanged: 0,
          removed: 0,
          errors: 0
        }
      : [];
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  });

  render(<App />);

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "API returned an unexpected response for /deployment"
  );
});

test("shows document search progress while the request is pending", async () => {
  let finishSearch: ((response: Response) => void) | undefined;
  const currentFetch = vi.mocked(fetch);
  currentFetch.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/search")) {
      return new Promise<Response>((resolve) => {
        finishSearch = resolve;
      });
    }
    const value = url.includes("/usage")
      ? {
          totals: {
            requests: 0,
            cache_hits: 0,
            cache_hit_rate: 0,
            prompt_tokens: 0,
            output_tokens: 0,
            total_tokens: 0,
            avg_latency_ms: 0
          },
          by_model: [],
          daily: [],
          key_facts: 0,
          cached_answers: 0,
          corpus_revision: 1,
          feedback: { total: 0, good: 0, bad: 0 }
        }
      : url.includes("/deployment")
        ? {
            read_only_demo: false,
            online_available: false,
            online_model: ""
          }
      : url.includes("/scan/status")
        ? { state: "idle", id: "", discovered: 0, processed: 0, unchanged: 0, removed: 0, errors: 0 }
        : [];
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  });

  render(<App />);
  fireEvent.click(screen.getByRole("tab", { name: "Sources" }));
  fireEvent.change(screen.getByLabelText("Search documents"), {
    target: { value: "return policy" }
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  expect(screen.getByRole("status")).toHaveTextContent("Searching extracted key facts");
  expect(screen.getByRole("status")).toHaveTextContent("Processing locally");

  await act(async () => {
    finishSearch?.(
      new Response(JSON.stringify({ query: "return policy", results: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
  });
});

test("switches document search to Azure AI online mode", async () => {
  const currentFetch = vi.mocked(fetch);
  currentFetch.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    const value = url.includes("/deployment")
      ? {
          read_only_demo: true,
          online_available: true,
          online_model: "phi-4-mini"
        }
      : url.includes("/search")
        ? { query: "Cogsdale", source: "online", results: [] }
        : url.includes("/scan/status")
          ? {
              state: "idle",
              id: "",
              discovered: 0,
              processed: 0,
              unchanged: 0,
              removed: 0,
              errors: 0
            }
          : [];
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  });

  render(<App />);
  const onlineButtons = await screen.findAllByRole("button", { name: /Online/ });
  const onlineButton = onlineButtons[onlineButtons.length - 1];
  await waitFor(() => expect(onlineButton).not.toBeDisabled());
  fireEvent.click(onlineButton);
  expect(document.querySelector("main")).toHaveClass("source-online");
  expect(
    screen.getAllByText(/Offline documents are isolated/i).length
  ).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("tab", { name: "Compliance" }));
  expect(
    await screen.findByRole("heading", { name: "Azure processing boundary" })
  ).toBeInTheDocument();
  expect(screen.getByText("Offline data isolation")).toBeInTheDocument();
  expect(
    screen.getByText(/Changing to Online does not upload or synchronize local files/i)
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Sources" }));
  fireEvent.change(screen.getByLabelText("Search documents"), {
    target: { value: "Cogsdale" }
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  await screen.findByText("Approved online sources");
  expect(
    currentFetch.mock.calls.some(([input]) =>
      String(input).includes("/search?q=Cogsdale&source=online")
    )
  ).toBe(true);
});

test("shows Azure-specific progress while Online chat is pending", async () => {
  let finishChat: ((response: Response) => void) | undefined;
  const currentFetch = vi.mocked(fetch);
  currentFetch.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/chat")) {
      return new Promise<Response>((resolve) => {
        finishChat = resolve;
      });
    }
    const value = url.includes("/deployment")
      ? {
          read_only_demo: true,
          online_available: true,
          online_model: "phi-4-mini"
        }
      : url.includes("/scan/status")
        ? {
            state: "idle",
            id: "",
            discovered: 0,
            processed: 0,
            unchanged: 0,
            removed: 0,
            errors: 0
          }
        : [];
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  });

  render(<App />);
  const onlineButtons = await screen.findAllByRole("button", { name: /Online/ });
  const onlineButton = onlineButtons[onlineButtons.length - 1];
  await waitFor(() => expect(onlineButton).not.toBeDisabled());
  fireEvent.click(onlineButton);
  fireEvent.change(screen.getByLabelText("Message Mira"), {
    target: { value: "What is Cogsdale?" }
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));

  expect(screen.getByRole("status")).toHaveTextContent(
    "Mira is reviewing Azure sources"
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "Checking the answer cache"
  );
  expect(screen.getByRole("status")).toHaveTextContent("Querying Azure AI Search");
  expect(screen.getByRole("status")).toHaveTextContent("Selecting grounded evidence");
  expect(screen.getByRole("status")).toHaveTextContent("Generating with phi-4-mini");
  expect(screen.getByRole("status")).toHaveTextContent(
    "Validating citations and final answer"
  );
  expect(screen.getByRole("status")).toHaveTextContent("Elapsed 0:00");
  expect(screen.getByRole("status")).toHaveTextContent(
    "Estimated total 10 sec–45 sec"
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "Estimated remaining 10 sec–45 sec"
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "Only the question and bounded approved excerpts"
  );

  await act(async () => {
    finishChat?.(
      new Response(
        JSON.stringify({
          state: "insufficient-evidence",
          text: "No supported answer.",
          model: "azure-foundry:phi-4-mini",
          citations: [],
          sources: [],
          cached: false,
          history_id: 0
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      )
    );
  });
});

test("shows detailed local-model processing information", async () => {
  let finishChat: ((response: Response) => void) | undefined;
  const currentFetch = vi.mocked(fetch);
  currentFetch.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/chat")) {
      return new Promise<Response>((resolve) => {
        finishChat = resolve;
      });
    }
    const value = url.includes("/models")
      ? [{
          id: "smollm2:1.7b",
          provider: "Hugging Face",
          name: "SmolLM2 1.7B",
          installed: true,
          available: true,
          active: true,
          input_cost_per_million: 0,
          output_cost_per_million: 0,
          pricing_note: "No provider token charge."
        }]
      : url.includes("/deployment")
        ? {
            read_only_demo: true,
            online_available: false,
            online_model: "",
            online_models: []
          }
        : url.includes("/scan/status")
          ? {
              state: "idle",
              id: "",
              discovered: 0,
              processed: 0,
              unchanged: 0,
              removed: 0,
              errors: 0
            }
          : [];
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  });

  render(<App />);
  await waitFor(() =>
    expect(screen.getByLabelText("Docker LLM model")).toHaveValue("smollm2:1.7b")
  );
  fireEvent.change(screen.getByLabelText("Message Mira"), {
    target: { value: "Summarize the support policy" }
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));

  const progress = screen.getByRole("status");
  expect(progress).toHaveTextContent("Mira is reviewing local sources");
  expect(progress).toHaveTextContent("SmolLM2 1.7B · Elapsed 0:00");
  expect(progress).toHaveTextContent("Estimated total 30 sec–2 min");
  expect(progress).toHaveTextContent("Estimated remaining 30 sec–2 min");
  expect(progress).toHaveTextContent("Searching extracted facts");
  expect(progress).toHaveTextContent("Retrieving and ranking excerpts");
  expect(progress).toHaveTextContent("Loading SmolLM2 1.7B");
  expect(progress).toHaveTextContent("Generating and validating the cited answer");
  expect(progress).toHaveTextContent("stay inside this container");
  expect(progress).toHaveTextContent("Stage timing is estimated");

  await act(async () => {
    finishChat?.(
      new Response(JSON.stringify({
        state: "answered",
        text: "Supported response [1]",
        model: "smollm2:1.7b",
        citations: [],
        sources: [],
        cached: false,
        history_id: 0
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
  });
});
