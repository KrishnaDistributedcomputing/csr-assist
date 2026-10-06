import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
          ? { read_only_demo: false }
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
  expect(screen.queryByLabelText("Token usage dashboard")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Analytics" }));
  expect(await screen.findByLabelText("Token usage dashboard")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Architecture" }));
  expect(await screen.findByLabelText("System architecture")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: /History/ }));
  expect(screen.getByText("No history yet")).toBeInTheDocument();
  expect(screen.queryByLabelText("Message Mira")).not.toBeInTheDocument();
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
        ? { read_only_demo: false }
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
