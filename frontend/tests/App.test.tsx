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
  fireEvent.click(screen.getByRole("tab", { name: "All prompts" }));
  expect(screen.getByText("Summarize the key points")).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /Online/ })[0]).toBeDisabled();
  expect(screen.queryByLabelText("Token usage dashboard")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: /Analytics/ }));
  expect(await screen.findByLabelText("Token usage dashboard")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: /Architecture/ }));
  expect(await screen.findByLabelText("System architecture")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: /Compliance/ }));
  expect(
    await screen.findByLabelText("Data and accessibility compliance")
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
  fireEvent.click(screen.getByRole("tab", { name: /History/ }));
  expect(screen.getByText("No history yet")).toBeInTheDocument();
  expect(screen.queryByLabelText("Message Mira")).not.toBeInTheDocument();
});

test("workspace tabs support keyboard navigation", async () => {
  render(<App />);
  const answers = screen.getByRole("tab", { name: "Answers" });
  answers.focus();
  fireEvent.keyDown(answers, { key: "End" });

  const compliance = screen.getByRole("tab", { name: "Compliance" });
  expect(compliance).toHaveAttribute("aria-selected", "true");
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
              active: true
            },
            {
              id: "gpt-4o-mini",
              provider: "Azure AI Foundry",
              name: "GPT-4o Mini",
              installed: true,
              available: true,
              active: false
            }
          ]
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
  fireEvent.click(screen.getByRole("tab", { name: "Answers" }));
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
    "Checking approved Azure sources"
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
