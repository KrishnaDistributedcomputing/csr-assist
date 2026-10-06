---
title: CSR Assist User Guide
description: Guide to document search, Mira answers, feedback, history, analytics, and administration
author: CSR Assist team
ms.date: 2026-10-06
ms.topic: how-to
---

## Answer workspace

![CSR Assist answer workspace](./images/overview.png)

The answer workspace is the default page. It loads document and scan status
before secondary model, history, and analytics data.

1. Enter a phrase in **Search documents**.
2. Review ranked results in the document card.
3. Select a result to inspect the exact processed excerpt.
4. Use **Upload** for one file or **Scan documents** to reconcile the mounted
   directory.

Search progress reports cache, key-fact, full-excerpt, ranking, and citation
phases while work is pending.

### Public demo behavior

The hosted Azure demo uses only the bundled sample policy. It does not accept
uploads, persist search or chat history, accept feedback, or allow
administrative changes. A scale-from-zero cold start can delay the first
request after an idle period.

## Ask Mira

Open Mira from the desktop side panel or the floating mobile button. Fast mode
uses processed facts and citations without running a generative model.

Suggested prompts include:

* What is the return policy?
* Draft a customer-ready response
* Are there conflicting instructions?

The model selector controls optional generated mode. Models marked **Setup
required** are approved but not installed.

Mira does not use external knowledge or speculate beyond retrieved excerpts.
When the documents do not support an answer, Mira responds:

> I’m unable to answer this question because it falls outside the scope of the
> provided documents or is not supported by their content.

## Improve retrieval with feedback

Use the thumbs-up or thumbs-down controls below an answer.

* A good rating increases the ranking weight of cited source chunks.
* A bad rating decreases their weight and invalidates the matching cache entry.
* Changing a rating reverses the previous weight before applying the new one.
* Ratings remain local and do not retrain a model automatically.

## History

Open Mira's **History** tab to load locally stored searches and questions.
Selecting an item restores its query. **Clear history** deletes the conversation
and search history from SQLite.

## Analytics

![Local token and cache analytics](./images/analytics.png)

The Analytics tab loads only when selected. It reports:

* Request and cache-hit counts
* Actual prompt and output tokens
* Average latency
* Cached answers and extracted facts
* Good and bad response totals
* Per-model and per-mode usage

Fast local-index answers correctly report zero tokens.

## Mobile interface

![Responsive mobile document workspace](./images/mobile.png)

The responsive layout places documents and source preview in one column.
Open Mira with the floating assistant button.

## Supported files

| Format | Processing |
|---|---|
| PDF | Native page text with OCR fallback |
| DOCX | Paragraph extraction |
| TXT and Markdown | UTF-8 text |
| CSV | Row and column text |
| JSON | Searchable field paths and values |
| XML | Searchable element paths, attributes, and values |
| PNG, JPEG, TIFF | Tesseract OCR |

Original files remain in `/data/documents`. Search and chat use processed
SQLite facts, chunks, and vectors rather than reparsing documents per request.
