# Testing Strategy for Refactored Enrichment Process

This document outlines the testing strategy and defines test cases for the refactored enrichment process, which now uses OpenAI for search and content processing instead of Firecrawl.

**Testing Strategy**

1.  **Unit Tests (Conceptual - for developer execution)**:
    *   Although not executed by the AI agent, developers should implement unit tests for critical new and modified components:
        *   **`AgentOrchestrator` Helper Methods**:
            *   `searchWithOpenAI`: Test with various query types. Verify handling of successful OpenAI responses (valid JSON array, empty array), error responses from OpenAI, and malformed JSON responses. Mock `openaiService.client.chat.completions.create`.
            *   `getContentFromUrlWithOpenAI`: Test with URLs that should return content and URLs that might be inaccessible. Verify handling of successful OpenAI responses and error/empty responses. Mock `openaiService.client.chat.completions.create`.
        *   **Logic within `run...Phase` methods in `AgentOrchestrator`**: Test the logic that processes the results from `searchWithOpenAI` and `getContentFromUrlWithOpenAI` before passing data to `extractStructuredData...` methods.
        *   **Data Extraction Logic**: If complex parsing or data transformation logic exists outside of direct LLM extraction calls (e.g., in `extractCompanyName`, `extractDescription` in `AgentOrchestrator`), these should be unit tested with various input strings.
        *   **Schema Validation**: Test Zod schemas for agent outputs (e.g., `ProfileResult` in `company-profile-agent.ts`'s original context, or the dynamic schemas in `specialized-agents.ts`) to ensure they correctly parse expected valid and invalid data structures.

2.  **Integration Tests (Conceptual - for developer execution)**:
    *   Test the interaction between key components:
        *   `AgentEnrichmentStrategy` -> `AgentOrchestrator` (from `lib/agent-architecture/orchestrator.ts`).
        *   `AgentOrchestrator` -> its internal phase methods (`runDiscoveryPhase`, `runProfilePhase`, etc.).
        *   The interaction between search/content retrieval helpers and the data extraction calls (`this.openai.extractStructuredDataOriginal` or `this.openai.extractStructuredDataWithCorroboration`).
    *   **Mocking**: Mock `OpenAIService` calls at the boundaries (e.g., what `searchWithOpenAI` returns, what `extractStructuredData...` returns) to isolate the logic being tested and ensure predictable inputs.
    *   **Focus**:
        *   Verify that data flows correctly through the components.
        *   Ensure that context (like `companyName`, `emailContext`) is passed and utilized appropriately.
        *   Test the data transformation and merging logic within `AgentOrchestrator`'s `enrichRow` and `formatEnrichmentResults`.

3.  **End-to-End (E2E) Tests (Primary focus for this output)**:
    *   These tests simulate actual API requests to the `/api/enrich` endpoint.
    *   They verify the complete flow, from request reception to the streamed response, including the new OpenAI-driven search, content processing, and data extraction by the `AgentOrchestrator`'s phase logic.
    *   **Pre-requisites**: A running application instance with a valid `OPENAI_API_KEY` configured in its environment. Internet access for OpenAI API calls.

**E2E Test Cases**

For each test case, the following are specified:
*   **Test Case ID**
*   **Description**
*   **Input Data** (JSON body for `/api/enrich` POST request)
    *   `rows`: Array of objects. Each object represents a row to be enriched.
    *   `fields`: Array of `EnrichmentField` objects (e.g., `{ name: "industry", description: "Primary industry", type: "string", required: false }`). Key fields for this refactor are "industry" and "employeeSize" (or similar, based on the schemas in `specialized-agents.ts` which `AgentOrchestrator` seems to align with, e.g., `companyName`, `industry`, `headquarters`, `employeeCount`, `yearFounded`, `description`).
    *   `emailColumn`: The key in the row objects that contains the domain or email for research.
    *   `nameColumn` (optional): The key for a human-readable company name if available.
*   **Expected Outcome**:
    *   Successful HTTP response (200 OK) with `Content-Type: text/event-stream`.
    *   The response stream should contain `session` event, multiple `processing` and `agent_progress` events, `result` events for each row, and finally a `complete` event.
    *   For each row, the `enrichments` object in the `result` event should:
        *   Contain plausible values for the requested fields (especially those targeted by the refactor like `industry`, `employeeCount` as per `createCompanyAgent` in `specialized-agents.ts`).
        *   Have reasonable `confidence` scores (e.g., as defined in `_agent_confidence_scores`).
        *   Include `sourceContext` (or similar in `_agent_source_urls`) that reflects the new OpenAI search/processing (URLs might be varied, snippets should be present if the schema supports it).
    *   No errors related to Firecrawl should appear in logs or responses.

---

**Test Case Examples:**

**Test Case ID:** E2E_001
*   **Description:** Test with a well-known large tech company using its domain.
*   **Input Data:**
    ```json
    {
      "rows": [{ "company_email_domain": "google.com" }],
      "fields": [
        { "name": "companyName", "description": "Official company name", "type": "string", "required": true },
        { "name": "industry", "description": "Primary industry", "type": "string", "required": false },
        { "name": "employeeCount", "description": "Estimated number of employees", "type": "number", "required": false },
        { "name": "headquarters", "description": "Company headquarters location", "type": "string", "required": false },
        { "name": "yearFounded", "description": "Year company was founded", "type": "number", "required": false }
      ],
      "emailColumn": "company_email_domain"
    }
    ```
*   **Expected Outcome:**
    *   `companyName`: "Google" or "Alphabet Inc."
    *   `industry`: e.g., "Technology", "Software", "Internet".
    *   `employeeCount`: A large number (e.g., > 100000).
    *   `headquarters`, `yearFounded` should be accurately populated.
    *   Confidence scores should be relatively high (e.g., > 0.8).
    *   Source URLs should point to relevant web pages.

---

**Test Case ID:** E2E_002
*   **Description:** Test with a mid-sized, known SaaS company using its domain.
*   **Input Data:**
    ```json
    {
      "rows": [{ "website_domain": "asana.com" }],
      "fields": [
        { "name": "companyName", "description": "Official company name", "type": "string", "required": false },
        { "name": "industry", "description": "Primary industry", "type": "string", "required": false },
        { "name": "employeeCount", "description": "Estimated number of employees", "type": "number", "required": false }
      ],
      "emailColumn": "website_domain"
    }
    ```
*   **Expected Outcome:**
    *   `companyName`: "Asana" or "Asana, Inc."
    *   `industry`: e.g., "Software", "SaaS", "Project Management".
    *   `employeeCount`: A range appropriate for Asana (e.g., 1000-5000).

---

**Test Case ID:** E2E_003
*   **Description:** Test with a smaller, potentially less publicly indexed company, providing a name hint.
*   **Input Data:**
    ```json
    {
      "rows": [{ "domain": "getsideguide.com", "name": "Sideguide" }],
      "fields": [
        { "name": "industry", "description": "Primary industry", "type": "string", "required": false },
        { "name": "employeeCount", "description": "Estimated number of employees", "type": "number", "required": false },
        { "name": "yearFounded", "description": "Year company was founded", "type": "number", "required": false }
      ],
      "emailColumn": "domain",
      "nameColumn": "name"
    }
    ```
*   **Expected Outcome:**
    *   Results might be less precise or have lower confidence scores compared to larger companies.
    *   The system should attempt to find information and provide plausible (even if estimated) data.
    *   This tests the system's ability to find info on less prominent entities, especially when a name hint is provided.

---

**Test Case ID:** E2E_004
*   **Description:** Test with a domain that is unlikely to have real company information.
*   **Input Data:**
    ```json
    {
      "rows": [{ "company_domain": "nonexistentcompanydomain12345xyz.com" }],
      "fields": [
        { "name": "industry", "description": "Primary industry", "type": "string", "required": false },
        { "name": "employeeCount", "description": "Estimated number of employees", "type": "number", "required": false }
      ],
      "emailColumn": "company_domain"
    }
    ```
*   **Expected Outcome:**
    *   Requested fields should likely have null values or the enrichment for the row should indicate data not found.
    *   Confidence scores should be very low (e.g., 0 or close to 0).
    *   The system should not error out but gracefully handle the lack of information, returning a 'completed' status for the row with empty/low-confidence enrichments.

---

**Test Case ID:** E2E_005
*   **Description:** Test with multiple rows to ensure batch processing and streaming work as expected.
*   **Input Data:**
    ```json
    {
      "rows": [
        { "company_website": "openai.com" },
        { "company_website": "anthropic.com" }
      ],
      "fields": [
        { "name": "industry", "description": "Primary industry", "type": "string", "required": false },
        { "name": "employeeCount", "description": "Estimated number of employees", "type": "number", "required": false },
        { "name": "description", "description": "Company description", "type": "string", "required": false }
      ],
      "emailColumn": "company_website"
    }
    ```
*   **Expected Outcome:**
    *   Both rows should be processed.
    *   Streamed results should arrive for each row, containing plausible data for OpenAI and Anthropic respectively.

---

**Test Case ID:** E2E_006
*   **Description:** Test other specialized agent capabilities like funding, using appropriate fields.
*   **Input Data:**
    ```json
    {
      "rows": [
        { "company_domain": "klaviyo.com", "company_name_hint": "Klaviyo" }
      ],
      "fields": [
        { "name": "lastFundingStage", "description": "Latest funding stage", "type": "string", "required": false },
        { "name": "totalRaised", "description": "Total funding raised", "type": "string", "required": false },
        { "name": "leadInvestors", "description": "List of lead investors", "type": "array", "required": false }
      ],
      "emailColumn": "company_domain",
      "nameColumn": "company_name_hint"
    }
    ```
*   **Expected Outcome:**
    *   Funding-related fields for Klaviyo (a known public company that had funding rounds) should be populated with plausible data.
    *   This tests if the `runFundingPhase` (or equivalent logic in `AgentOrchestrator` and `createFundraisingAgent` in `specialized-agents.ts`) is triggered and works correctly with the new OpenAI search.

---

**Test Case ID:** E2E_007
*   **Description:** Test with a row that should be skipped based on the skip list.
*   **Input Data:**
    ```json
    {
      "rows": [{ "email_address": "test@gmail.com" }], // Assuming gmail.com is in the skip list
      "fields": [
        { "name": "industry", "description": "Primary industry", "type": "string", "required": false }
      ],
      "emailColumn": "email_address"
    }
    ```
*   **Expected Outcome:**
    *   The row result should have a `status: "skipped"` and an appropriate `error` message indicating the reason for skipping (e.g., "Personal email domain").

---

**Data Validation Points for E2E Tests:**

*   **Accuracy & Plausibility:** Are the returned values for requested fields correct or believable for the given company/domain?
*   **Confidence Scores:** Do the `_agent_confidence_scores` (or similar field in the output) generally reflect the likely availability and clarity of the information?
*   **Source URLs:** Does the `_agent_source_urls` (or similar) provide meaningful URLs? Snippets associated with these URLs (if part of the schema) should be relevant.
*   **Absence of Firecrawl Artifacts:** Ensure no logs, error messages, or source information directly mention or imply Firecrawl usage.
*   **Performance (Qualitative):** Is the enrichment process reasonably timely? Multiple OpenAI calls per phase per row can introduce latency. Monitor overall processing time.
*   **Stream Integrity:** Ensure the event stream delivers all expected event types (`session`, `processing`, `agent_progress`, `result`, `complete`) without premature closing or errors.
*   **Error Handling:** For invalid inputs or unrecoverable errors during processing, the system should respond gracefully (e.g., appropriate HTTP error code or a `result` event with `status: "error"`).

**Post-Testing Steps:**

*   Analyze all E2E test results, paying close attention to the accuracy of extracted data, confidence scores, and provided sources.
*   If discrepancies, inaccuracies, or errors are found:
    *   Begin debugging by examining application logs.
    *   Log the intermediate data passed between phases in `AgentOrchestrator`.
    *   Log the exact prompts sent to OpenAI models and the raw JSON responses received from them to identify issues in prompt engineering or response parsing.
*   Iteratively adjust OpenAI prompts within `AgentOrchestrator`'s helper methods (`searchWithOpenAI`, `getContentFromUrlWithOpenAI`) or data extraction calls (`extractStructuredDataOriginal`, `extractStructuredDataWithCorroboration`) if results are unsatisfactory.
*   Re-run tests after fixes or adjustments until the system achieves the desired accuracy and reliability.

This testing strategy document should guide the verification process for the refactored enrichment system.
