import { EmailContext, RowEnrichmentResult } from './core/types';
import { EnrichmentResult, SearchResult, EnrichmentField } from '../types'; // SearchResult might need update if it's Firecrawl specific
import { parseEmail } from '../strategies/email-parser';
// import { FirecrawlService } from '../services/firecrawl'; // Removed
import { OpenAIService } from '../services/openai';

// Interface for the expected search result structure from OpenAI (used internally by orchestrator)
interface OrchestratorOpenAISearchResult {
  url: string;
  title: string;
  snippet: string;
}

export class AgentOrchestrator {
  // private firecrawl: FirecrawlService; // Removed
  private openai: OpenAIService;
  
  constructor(
    // private firecrawlApiKey: string, // Removed
    // private openaiApiKey: string // Removed, OpenAIService is now passed directly
    openaiService: OpenAIService
  ) {
    // this.firecrawl = new FirecrawlService(firecrawlApiKey); // Removed
    this.openai = openaiService; // Use the passed instance
  }

  // Helper method to perform OpenAI-based search
  private async searchWithOpenAI(query: string, targetInfo?: string, limit: number = 3): Promise<OrchestratorOpenAISearchResult[]> {
    const prompt = `
System: You are an AI assistant that performs web searches and provides summarized results.
User: Perform a web search for the query: "${query}".
${targetInfo ? `The user is specifically looking for information related to: "${targetInfo}". Please tailor snippets accordingly.` : ''}
Please return the top ${limit} most relevant results.
For each result, provide:
- url (string, full valid URL)
- title (string, concise and relevant)
- snippet (string, 1-3 sentences summarizing relevance to the query ${targetInfo ? `and target info: "${targetInfo}"` : ''})
Format the response as a valid JSON array of objects: [{ "url": "...", "title": "...", "snippet": "..." }, ...].
Ensure URLs are complete and valid. Only include results directly relevant.
If you cannot find relevant results, return an empty array [].
Do not include any explanatory text outside of the JSON array itself.`;

    try {
      const openaiResponse = await this.openai.client.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: 'You perform web searches and return JSON formatted results.' }, { role: 'user', content: prompt }],
        temperature: 0.1,
      });
      const responseContent = openaiResponse.choices[0]?.message?.content;
      if (responseContent) {
        let parsedResults: OrchestratorOpenAISearchResult[] = [];
        const jsonMatch = responseContent.match(/(\[[\s\S]*\])/);
        if (jsonMatch && jsonMatch[1]) {
          parsedResults = JSON.parse(jsonMatch[1]);
        } else {
          parsedResults = JSON.parse(responseContent);
        }
        if (!Array.isArray(parsedResults)) {
          if (typeof parsedResults === 'object' && parsedResults !== null && 'url' in parsedResults) {
            return [parsedResults as OrchestratorOpenAISearchResult];
          }
          return [];
        }
        return parsedResults.filter(r => r.url && r.title && r.snippet);
      }
    } catch (error) {
      console.error(`[Orchestrator] OpenAI Search failed for query "${query}":`, error);
    }
    return [];
  }

  // Helper method to get content from a URL using OpenAI to summarize/extract.
  private async getContentFromUrlWithOpenAI(url: string, targetInfo: string = "key information and summary"): Promise<{ markdown: string | null, metadata: Record<string, any> }> {
    const prompt = `
System: You are an AI assistant that can access and process web page content.
User: Please access the content of the URL: "${url}".
Extract the key information and a concise summary relevant to "${targetInfo}".
Focus on the main textual content of the page. If the page is very long, summarize the most important parts.
If the page cannot be accessed or does not contain relevant textual information, indicate that.
Present the extracted information as a coherent text block (markdown format if appropriate).`;

    try {
      // This assumes the OpenAI model has browsing capabilities.
      const openaiResponse = await this.openai.client.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: 'You access URLs and extract/summarize their content.' }, { role: 'user', content: prompt }],
        temperature: 0.0,
      });
      const content = openaiResponse.choices[0]?.message?.content;
      if (content) {
        return { markdown: content, metadata: { title: `Summary of ${url}`, source: url } };
      }
    } catch (error) {
      console.error(`[Orchestrator] Failed to get/process content from URL "${url}" with OpenAI:`, error);
    }
    return { markdown: null, metadata: { title: `Failed to process ${url}`, source: url } };
  }
  
  async enrichRow(
    row: Record<string, string>,
    fields: EnrichmentField[],
    emailColumn: string,
    onProgress?: (field: string, value: unknown) => void,
    onAgentProgress?: (message: string, type: 'info' | 'success' | 'warning' | 'agent') => void
  ): Promise<RowEnrichmentResult> {
    const email = row[emailColumn];
    console.log(`[Orchestrator] Starting enrichment for email: ${email}`);
    
    interface OrchestrationContext extends Record<string, unknown> {
      email: string;
      emailContext: EmailContext;
      discoveredData: Record<string, unknown>;
      companyName?: string;
    }
    
    if (!email) {
      return {
        rowIndex: 0,
        originalData: row,
        enrichments: {},
        status: 'error',
        error: 'No email found',
      };
    }
    
    try {
      // Step 1: Extract email context
      console.log(`[Orchestrator] Extracting email context from: ${email}`);
      const emailContext = this.extractEmailContext(email);
      console.log(`[Orchestrator] Email context: domain=${emailContext.domain}, company=${emailContext.companyNameGuess || 'unknown'}`);
      
      // Step 2: Categorize fields
      const fieldCategories = this.categorizeFields(fields);
      console.log(`[Orchestrator] Field categories: discovery=${fieldCategories.discovery.length}, profile=${fieldCategories.profile.length}, metrics=${fieldCategories.metrics.length}, funding=${fieldCategories.funding.length}, techStack=${fieldCategories.techStack.length}, other=${fieldCategories.other.length}`);
      
      // Log which "phases" (formerly agents) will be used
      const phasesToRun = [];
      if (fieldCategories.discovery.length > 0) phasesToRun.push('Discovery Phase');
      if (fieldCategories.profile.length > 0) phasesToRun.push('Profile Phase');
      if (fieldCategories.metrics.length > 0) phasesToRun.push('Metrics Phase');
      if (fieldCategories.funding.length > 0) phasesToRun.push('Funding Phase');
      if (fieldCategories.techStack.length > 0) phasesToRun.push('Tech Stack Phase');
      if (fieldCategories.other.length > 0) phasesToRun.push('General Phase');
      
      console.log(`[Orchestrator] Phases to be run: ${phasesToRun.join(', ')}`);
      console.log(`[Orchestrator] Phase execution order: ${phasesToRun.join(' → ')}`);
      
      // Send initial agent progress
      if (onAgentProgress) {
        onAgentProgress(`Planning enrichment strategy for ${emailContext.companyNameGuess || emailContext.domain}`, 'info');
        onAgentProgress(`Enrichment pipeline: ${phasesToRun.map(p => p.replace(' Phase', '')).join(' → ')}`, 'info');
      }
      
      // Step 3: Progressive enrichment
      const enrichments: Record<string, unknown> = {};
      const context: OrchestrationContext = { email, emailContext, discoveredData: {} };
      
      // Discovery phase (company identity)
      if (fieldCategories.discovery.length > 0) {
        console.log(`[Orchestrator] Activating DISCOVERY-AGENT for fields: ${fieldCategories.discovery.map(f => f.name).join(', ')}`);
        if (onAgentProgress) {
          onAgentProgress(`Discovery Agent: Identifying company from ${emailContext.domain}`, 'agent');
          onAgentProgress(`Target fields: ${fieldCategories.discovery.map(f => f.name).join(', ')}`, 'info');
        }
        const discoveryResults = await this.runDiscoveryPhase(
          context,
          fieldCategories.discovery,
          onAgentProgress
        );
        console.log(`[Orchestrator] DISCOVERY-AGENT completed, found ${Object.keys(discoveryResults).length} values`);
        if (onAgentProgress && Object.keys(discoveryResults).length > 0) {
          onAgentProgress(`Discovery complete: Found ${Object.keys(discoveryResults).length} fields`, 'success');
        }
        Object.assign(enrichments, discoveryResults);
        Object.assign(context.discoveredData, discoveryResults);
        
        // If we found a company name, update the context
        const companyNameField = Object.keys(discoveryResults).find(key => 
          key.toLowerCase().includes('company') && key.toLowerCase().includes('name')
        );
        if (companyNameField && discoveryResults[companyNameField]) {
          // Extract the value from the EnrichmentResult object
          const companyNameResult = discoveryResults[companyNameField] as { value?: unknown } | unknown;
          const companyNameValue = (companyNameResult && typeof companyNameResult === 'object' && 'value' in companyNameResult) ? companyNameResult.value : companyNameResult;
          (context as OrchestrationContext).companyName = companyNameValue as string;
          console.log(`[Orchestrator] Updated context with company name: ${(context as OrchestrationContext).companyName}`);
        }
        
        // Report progress
        for (const [field, value] of Object.entries(discoveryResults)) {
          if (value && onProgress) {
            onProgress(field, value);
          }
        }
      }
      
      // Profile phase (industry, location, etc)
      if (fieldCategories.profile.length > 0) {
        console.log(`[Orchestrator] Activating COMPANY-PROFILE-AGENT for fields: ${fieldCategories.profile.map(f => f.name).join(', ')}`);
        if (onAgentProgress) {
          onAgentProgress(`Profile Agent: Gathering company details`, 'agent');
          onAgentProgress(`Target fields: ${fieldCategories.profile.map(f => f.name).join(', ')}`, 'info');
        }
        const profileResults = await this.runProfilePhase(
          context,
          fieldCategories.profile,
          onAgentProgress
        );
        console.log(`[Orchestrator] COMPANY-PROFILE-AGENT completed, found ${Object.keys(profileResults).length} values`);
        if (onAgentProgress && Object.keys(profileResults).length > 0) {
          onAgentProgress(`Profile complete: Found ${Object.keys(profileResults).length} fields`, 'success');
        }
        Object.assign(enrichments, profileResults);
        
        for (const [field, value] of Object.entries(profileResults)) {
          if (value && onProgress) {
            onProgress(field, value);
          }
        }
      }
      
      // Metrics phase (employee count, revenue)
      if (fieldCategories.metrics.length > 0) {
        console.log(`[Orchestrator] Activating METRICS-AGENT for fields: ${fieldCategories.metrics.map(f => f.name).join(', ')}`);
        if (onAgentProgress) {
          onAgentProgress(`Metrics Agent: Analyzing company metrics`, 'agent');
          onAgentProgress(`Target fields: ${fieldCategories.metrics.map(f => f.name).join(', ')}`, 'info');
        }
        const metricsResults = await this.runMetricsPhase(
          context,
          fieldCategories.metrics,
          onAgentProgress
        );
        console.log(`[Orchestrator] METRICS-AGENT completed, found ${Object.keys(metricsResults).length} values`);
        if (onAgentProgress && Object.keys(metricsResults).length > 0) {
          onAgentProgress(`Metrics complete: Found ${Object.keys(metricsResults).length} fields`, 'success');
        }
        Object.assign(enrichments, metricsResults);
        
        for (const [field, value] of Object.entries(metricsResults)) {
          if (value && onProgress) {
            onProgress(field, value);
          }
        }
      }
      
      // Funding phase
      if (fieldCategories.funding.length > 0) {
        console.log(`[Orchestrator] Activating FUNDING-AGENT for fields: ${fieldCategories.funding.map(f => f.name).join(', ')}`);
        if (onAgentProgress) {
          onAgentProgress(`Funding Agent: Researching investment data`, 'agent');
          onAgentProgress(`Target fields: ${fieldCategories.funding.map(f => f.name).join(', ')}`, 'info');
        }
        const fundingResults = await this.runFundingPhase(
          context,
          fieldCategories.funding,
          onAgentProgress
        );
        console.log(`[Orchestrator] FUNDING-AGENT completed, found ${Object.keys(fundingResults).length} values`);
        if (onAgentProgress && Object.keys(fundingResults).length > 0) {
          onAgentProgress(`Funding complete: Found ${Object.keys(fundingResults).length} fields`, 'success');
        }
        Object.assign(enrichments, fundingResults);
        
        for (const [field, value] of Object.entries(fundingResults)) {
          if (value && onProgress) {
            onProgress(field, value);
          }
        }
      }
      
      // Tech Stack phase
      if (fieldCategories.techStack.length > 0) {
        console.log(`[Orchestrator] Activating TECH-STACK-AGENT for fields: ${fieldCategories.techStack.map(f => f.name).join(', ')}`);
        if (onAgentProgress) {
          onAgentProgress(`Tech Stack Agent: Detecting technologies`, 'agent');
          onAgentProgress(`Target fields: ${fieldCategories.techStack.map(f => f.name).join(', ')}`, 'info');
        }
        const techStackResults = await this.runTechStackPhase(
          context,
          fieldCategories.techStack,
          onAgentProgress
        );
        console.log(`[Orchestrator] TECH-STACK-AGENT completed, found ${Object.keys(techStackResults).length} values`);
        if (onAgentProgress && Object.keys(techStackResults).length > 0) {
          onAgentProgress(`Tech Stack complete: Found ${Object.keys(techStackResults).length} fields`, 'success');
        }
        Object.assign(enrichments, techStackResults);
        
        for (const [field, value] of Object.entries(techStackResults)) {
          if (value && onProgress) {
            onProgress(field, value);
          }
        }
      }
      
      // General phase (CEO names, custom fields, etc)
      if (fieldCategories.other.length > 0) {
        console.log(`[Orchestrator] Activating GENERAL-AGENT for fields: ${fieldCategories.other.map(f => f.name).join(', ')}`);
        if (onAgentProgress) {
          onAgentProgress(`General Agent: Extracting custom information`, 'agent');
          onAgentProgress(`Target fields: ${fieldCategories.other.map(f => f.name).join(', ')}`, 'info');
        }
        const generalResults = await this.runGeneralPhase(
          context,
          fieldCategories.other,
          onAgentProgress
        );
        console.log(`[ORCHESTRATOR] GENERAL-AGENT completed, found ${Object.keys(generalResults).length} values`);
        if (onAgentProgress && Object.keys(generalResults).length > 0) {
          onAgentProgress(`General complete: Found ${Object.keys(generalResults).length} fields`, 'success');
        }
        Object.assign(enrichments, generalResults);
        
        for (const [field, value] of Object.entries(generalResults)) {
          if (value && onProgress) {
            onProgress(field, value);
          }
        }
      }
      
      // Convert to enrichment result format
      const enrichmentResults = this.formatEnrichmentResults(enrichments, fields);
      
      // Log final enrichment summary
      const enrichedFields = Object.entries(enrichmentResults).filter(([, r]) => r.value).map(([name]) => name);
      const missingFields = fields.filter(f => !enrichmentResults[f.name]?.value).map(f => f.name);
      
      console.log(`[Orchestrator] ====== ENRICHMENT SUMMARY ======`);
      console.log(`[Orchestrator] Email: ${email}`);
      console.log(`[Orchestrator] Successfully enriched: ${enrichedFields.length}/${fields.length} fields`);
      if (enrichedFields.length > 0) {
        console.log(`[Orchestrator] Enriched fields: ${enrichedFields.join(', ')}`);
      }
      if (missingFields.length > 0) {
        console.log(`[Orchestrator] Missing fields: ${missingFields.join(', ')}`);
      }
      console.log(`[Orchestrator] ================================`);
      
      return {
        rowIndex: 0,
        originalData: row,
        enrichments: enrichmentResults,
        status: 'completed',
      };
    } catch (error) {
      console.error('Orchestrator error:', error);
      return {
        rowIndex: 0,
        originalData: row,
        enrichments: {},
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
  
  private extractEmailContext(email: string): EmailContext {
    const parsed = parseEmail(email);
    const [, domain] = email.split('@');
    
    const personalDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'];
    const isPersonalEmail = personalDomains.includes(domain.toLowerCase());
    
    return {
      email,
      domain,
      companyDomain: isPersonalEmail ? undefined : domain,
      personalName: parsed?.firstName && parsed?.lastName 
        ? `${parsed.firstName} ${parsed.lastName}` 
        : undefined,
      companyNameGuess: parsed?.companyName,
      isPersonalEmail,
    };
  }
  
  private categorizeFields(fields: EnrichmentField[]) {
    console.log(`[Orchestrator] Categorizing ${fields.length} fields for agent assignment...`);
    
    const categories = {
      discovery: [] as EnrichmentField[],
      profile: [] as EnrichmentField[],
      metrics: [] as EnrichmentField[],
      funding: [] as EnrichmentField[],
      techStack: [] as EnrichmentField[],
      other: [] as EnrichmentField[],
    };
    
    for (const field of fields) {
      const name = field.name.toLowerCase();
      const desc = field.description.toLowerCase();
      
      if (name.includes('company') && name.includes('name') || 
          name.includes('website') || 
          name.includes('description') && name.includes('company') ||
          desc.includes('company name') ||
          desc.includes('company description')) {
        categories.discovery.push(field);
      } else if (name.includes('industry') || 
                 name.includes('location') || 
                 name.includes('headquarter') ||
                 name.includes('founded')) {
        categories.profile.push(field);
      } else if (name.includes('employee') || 
                 name.includes('revenue') || 
                 name.includes('size')) {
        categories.metrics.push(field);
      } else if (name.includes('fund') || 
                 name.includes('invest') || 
                 name.includes('valuation')) {
        categories.funding.push(field);
      } else if (name.includes('tech') && name.includes('stack') || 
                 name.includes('technolog') || 
                 name.includes('framework') ||
                 name.includes('language') ||
                 name.includes('github') ||
                 desc.includes('tech stack') ||
                 desc.includes('programming') ||
                 desc.includes('technology')) {
        categories.techStack.push(field);
      } else {
        categories.other.push(field);
      }
    }
    
    return categories;
  }
  
  private async runDiscoveryPhase(
    context: Record<string, unknown>,
    fields: EnrichmentField[],
    onAgentProgress?: (message: string, type: 'info' | 'success' | 'warning' | 'agent') => void
  ): Promise<Record<string, unknown>> {
    console.log('[AGENT-DISCOVERY] Starting Discovery Phase');
    const ctxEmail = context['email'] as string;
    const ctxEmailContext = context['emailContext'] as EmailContext;
    console.log(`[AGENT-DISCOVERY] Email: ${ctxEmail}`);
    console.log(`[AGENT-DISCOVERY] Domain: ${ctxEmailContext.domain}`);
    console.log(`[AGENT-DISCOVERY] Fields to discover: ${fields.map(f => f.name).join(', ')}`);
    
    const results: Record<string, unknown> = {};
    
    // Try direct website access first
    if (ctxEmailContext.companyDomain) {
      const websiteUrl = `https://${ctxEmailContext.companyDomain}`;
      console.log(`[AGENT-DISCOVERY] Attempting direct website content retrieval: ${websiteUrl}`);
      if (onAgentProgress) {
        onAgentProgress(`Attempting to access ${ctxEmailContext.companyDomain} directly...`, 'info');
      }
      try {
        // Use new helper to get content via OpenAI
        const scraped = await this.getContentFromUrlWithOpenAI(websiteUrl, `company name, website URL, and description for ${ctxEmailContext.companyDomain}`);
        
        if (scraped.markdown && this.isValidCompanyWebsite({ markdown: scraped.markdown, metadata: scraped.metadata as Record<string, unknown> })) {
          console.log(`[AGENT-DISCOVERY] Website content retrieval successful, length: ${scraped.markdown?.length || 0}`);
          if (onAgentProgress) {
            onAgentProgress(`Successfully retrieved company website content (${scraped.markdown?.length || 0} chars)`, 'success');
            onAgentProgress(`Extracting data from website content...`, 'info');
          }
          
          // Extract company name
          const companyNameField = fields.find(f => 
            f.name.toLowerCase().includes('company') && f.name.toLowerCase().includes('name')
          );
          if (companyNameField) {
            // extractCompanyName might need to be adapted if it relies heavily on specific markdown,
            // or we can use OpenAI to extract this from the `scraped.markdown`
            const companyName = this.extractCompanyName({ markdown: scraped.markdown, metadata: scraped.metadata as Record<string, unknown>, url: websiteUrl });
            if (companyName) {
              console.log(`[AGENT-DISCOVERY] Found company name: ${String(companyName)}`);
              if (onAgentProgress) {
                onAgentProgress(`Extracted company name: ${String(companyName)}`, 'success');
              }
              results[companyNameField.name] = {
                field: companyNameField.name,
                value: companyName,
                confidence: 0.9, // High confidence if directly from (processed) company site
                source: websiteUrl,
                sourceContext: [{
                  url: websiteUrl,
                  snippet: `Found on company website (content processed by AI)`
                }]
              };
            }
          }
          
          // Extract website
          const websiteField = fields.find(f => f.name.toLowerCase().includes('website'));
          if (websiteField) {
            results[websiteField.name] = {
              field: websiteField.name,
              value: websiteUrl,
              confidence: 1.0,
              source: websiteUrl,
              sourceContext: [{
                url: websiteUrl,
                snippet: `Primary domain from direct access`
              }]
            };
          }
          
          // Extract description
          const descField = fields.find(f => 
            f.name.toLowerCase().includes('description') || 
            f.description.toLowerCase().includes('description')
          );
          if (descField) {
            const description = this.extractDescription({ markdown: scraped.markdown, metadata: scraped.metadata as Record<string, unknown> });
            if (description) {
              if (onAgentProgress) {
                onAgentProgress(`Extracted company description (${description.length} chars)`, 'success');
              }
              results[descField.name] = {
                field: descField.name,
                value: description,
                confidence: 0.85, // Good confidence if from (processed) company site
                source: websiteUrl,
                sourceContext: [{
                  url: websiteUrl,
                  snippet: description.substring(0, 200) + (description.length > 200 ? '...' : '')
                }]
              };
            }
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`[AGENT-DISCOVERY] Direct website content retrieval failed: ${errorMessage}`);
        console.log('[AGENT-DISCOVERY] Activating fallback strategy...');
        if (onAgentProgress) {
          onAgentProgress(`Direct website content retrieval failed: ${errorMessage.substring(0, 100)}`, 'warning');
          onAgentProgress(`Activating search fallback strategy...`, 'info');
        }
      }
    } else {
      console.log('[AGENT-DISCOVERY] No company domain available, skipping direct scrape');
    }
    
    // If we still need fields, use search
    const missingFields = fields.filter(f => !results[f.name]);
    if (missingFields.length > 0) {
      console.log(`[AGENT-DISCOVERY] Missing fields after direct scrape: ${missingFields.map(f => f.name).join(', ')}`);
      console.log('[AGENT-DISCOVERY] Initiating search phase...');
      
      // Build search queries in order of priority
      const searchQueriesToTry = []; // Renamed to avoid conflict with outer scope if any
      
      // 1. Try domain-based search first
      if (ctxEmailContext.companyDomain) {
        searchQueriesToTry.push(`"${ctxEmailContext.companyDomain}" company official website`);
        searchQueriesToTry.push(`site:${ctxEmailContext.companyDomain} about`);
      }
      
      // 2. Try company name guess from email
      if (ctxEmailContext.companyNameGuess) {
        searchQueriesToTry.push(`"${ctxEmailContext.companyNameGuess}" company official website`);
      }
      
      // 3. Try domain without TLD as company name
      if (ctxEmailContext.companyDomain) {
        const domainPart = ctxEmailContext.companyDomain.split('.')[0];
        searchQueriesToTry.push(`"${domainPart}" company website about`);
      }
      
      // 4. General search with email domain
      if (ctxEmailContext.domain) {
        searchQueriesToTry.push(`email domain ${ctxEmailContext.domain} company information`);
      }
      
      console.log(`[AGENT-DISCOVERY] Search queries to try: ${searchQueriesToTry.length}`);
      if (onAgentProgress) {
        onAgentProgress(`Prepared ${searchQueriesToTry.length} search queries for fallback`, 'info');
      }
      
      let allSearchResults: OrchestratorOpenAISearchResult[] = []; // Changed type
      for (const query of searchQueriesToTry) { // Use renamed variable
        if (allSearchResults.length >= 5) break; // Limit total results
        
        try {
          console.log(`[AGENT-DISCOVERY] Searching with OpenAI: ${query}`);
          if (onAgentProgress) {
            onAgentProgress(`Search ${searchQueriesToTry.indexOf(query) + 1}/${searchQueriesToTry.length} with OpenAI: ${query.substring(0, 60)}...`, 'info');
          }
          // Use the new OpenAI search helper
          const currentQueryResults = await this.searchWithOpenAI(query, "general company information for discovery phase", 3);
          
          if (currentQueryResults && currentQueryResults.length > 0) {
            console.log(`[AGENT-DISCOVERY] Found ${currentQueryResults.length} results for query via OpenAI`);
            if (onAgentProgress) {
              onAgentProgress(`Found ${currentQueryResults.length} search results via OpenAI`, 'success');
            }
            allSearchResults = allSearchResults.concat(currentQueryResults);
          }
        } catch (searchError) {
          console.log(`[AGENT-DISCOVERY] OpenAI Search failed for query "${query}": ${searchError}`);
        }
      }
      
      // Deduplicate results by URL
      const uniqueOpenAISearchResults = Array.from( // Changed variable name
        new Map(allSearchResults.map(r => [r.url, r])).values()
      );
      
      // Adapt OrchestratorOpenAISearchResult to the structure expected by downstream processing (if any relies on markdown/content field names)
      const adaptedUniqueResults = uniqueOpenAISearchResults.map(r => ({
        url: r.url,
        title: r.title,
        markdown: r.snippet, // Use snippet as markdown
        content: r.snippet   // Use snippet as content
      }));

      console.log(`[AGENT-DISCOVERY] Total unique search results: ${adaptedUniqueResults.length}`);
      if (onAgentProgress && adaptedUniqueResults.length > 0) {
        onAgentProgress(`Processing ${adaptedUniqueResults.length} unique search results...`, 'info');
      }
      
      if (adaptedUniqueResults.length > 0) {
        // Filter out invalid results (e.g. very short snippets)
        const validResults = adaptedUniqueResults.filter(result => {
          if (!result.markdown || result.markdown.length < 30) return false; // Snippets are shorter, adjust threshold
          
          // Check for domain parking indicators in search results (less likely with good LLM search prompts)
          const lowerContent = (result.markdown || '').toLowerCase(); // Snippet content
          const lowerTitle = (result.title || '').toLowerCase();
          
          const parkingIndicators = [
            'domain for sale',
            'buy this domain',
            'make an offer',
            'domain parking',
            'checkout the full domain details'
          ];
          
          for (const indicator of parkingIndicators) {
            if (lowerContent.includes(indicator) || lowerTitle.includes(indicator)) {
              console.log(`[AGENT-DISCOVERY] Filtering out domain parking result: ${result.url}`);
              return false;
            }
          }
          
          return true;
        });
        
        console.log(`[AGENT-DISCOVERY] Valid search results after filtering: ${validResults.length}`);
        if (onAgentProgress) {
          onAgentProgress(`Filtered to ${validResults.length} valid results`, validResults.length > 0 ? 'success' : 'warning');
        }
        
        if (validResults.length > 0) {
          if (onAgentProgress) {
            onAgentProgress(`Extracting data from search results...`, 'info');
          }
          // Process search results to extract missing fields
          const extractedData = await this.extractFromSearchResults(
            validResults,
            missingFields,
            context,
            onAgentProgress
          );
          
          Object.assign(results, extractedData);
          if (onAgentProgress && Object.keys(extractedData).length > 0) {
            onAgentProgress(`Extracted ${Object.keys(extractedData).length} fields from search results`, 'success');
          }
        } else {
          console.log('[AGENT-DISCOVERY] No valid search results after filtering');
          if (onAgentProgress) {
            onAgentProgress(`No valid search results found`, 'warning');
          }
        }
      } else {
        console.log('[AGENT-DISCOVERY] No search results found, using domain-based fallback');
        if (onAgentProgress) {
          onAgentProgress(`No search results found, using domain-based inference`, 'warning');
        }
        // Last resort: use domain-based inference
        const fallbackData = this.inferFromDomain(ctxEmailContext, missingFields);
        Object.assign(results, fallbackData);
        if (onAgentProgress && Object.keys(fallbackData).length > 0) {
          onAgentProgress(`Inferred ${Object.keys(fallbackData).length} fields from domain`, 'info');
        }
      }
    }
    
    return results;
  }
  
  private async runProfilePhase(
    context: Record<string, unknown>,
    fields: EnrichmentField[],
    onAgentProgress?: (message: string, type: 'info' | 'success' | 'warning' | 'agent') => void
  ): Promise<Record<string, unknown>> {
    console.log('[AGENT-PROFILE] Starting Profile Phase');
    // Look for company name in discovered data or context
    const ctxDiscoveredData = context['discoveredData'] as Record<string, unknown>;
    const companyNameField = Object.keys(ctxDiscoveredData).find(key => 
      key.toLowerCase().includes('company') && key.toLowerCase().includes('name')
    );
    const ctxCompanyName = context['companyName'] as string | undefined;
    const ctxEmailContext = context['emailContext'] as EmailContext;
    const fieldValue = ctxDiscoveredData[companyNameField || ''] as { value?: unknown } | unknown;
    const companyName = ctxCompanyName || 
                       (companyNameField && fieldValue ? 
                         ((fieldValue && typeof fieldValue === 'object' && 'value' in fieldValue) ? fieldValue.value : fieldValue) : null) ||
                       ctxEmailContext?.companyNameGuess;
    
    console.log(`[AGENT-PROFILE] Company name: ${companyName || 'Not found'}`);
    console.log(`[AGENT-PROFILE] Fields to enrich: ${fields.map(f => f.name).join(', ')}`);
    if (onAgentProgress) {
      onAgentProgress(`Using company name: ${companyName || 'Unknown'}`, 'info');
    }
    
    if (!companyName) {
      console.log('[AGENT-PROFILE] No company name available, skipping profile phase');
      return {};
    }
    
    // Search for profile information
    // Prioritize company's own domain if available
    const domainQuery = ctxEmailContext?.companyDomain 
      ? `site:${ctxEmailContext.companyDomain} OR ` 
      : '';
    const searchQuery = `${domainQuery}"${String(companyName)}" headquarters industry "founded in" "year founded" location "based in" about`;
    console.log(`[AGENT-PROFILE] Search query for OpenAI: ${searchQuery}`);
    
    if (onAgentProgress) {
      onAgentProgress(`Search query for OpenAI: ${searchQuery.substring(0, 100)}...`, 'info');
      onAgentProgress(`Searching for profile information...`, 'info');
    }
    
    // Use new OpenAI search helper
    const openAISearchResults = await this.searchWithOpenAI(searchQuery, `company profile information for ${String(companyName)}`, 5);
    const adaptedSearchResults = openAISearchResults.map(r => ({ url: r.url, title: r.title, markdown: r.snippet, content: r.snippet }));

    console.log(`[AGENT-PROFILE] Found ${adaptedSearchResults.length} search results via OpenAI`);
    
    if (onAgentProgress) {
      if (adaptedSearchResults.length > 0) {
        onAgentProgress(`Found ${adaptedSearchResults.length} sources with profile data via OpenAI`, 'success');
        onAgentProgress(`Starting corroborated extraction for fields: ${fields.map(f => f.name).join(', ')}`, 'info');
      } else {
        onAgentProgress(`No search results found for profile data via OpenAI`, 'warning');
      }
    }
    
    // Use OpenAI to extract structured data from snippets
    const targetCompanyNotice = `\n\n[IMPORTANT: You are looking for information about "${String(companyName)}" ONLY. Ignore information about other companies.]\n\n`;
    const searchSnippetsForExtraction = adaptedSearchResults.map(r => `URL: ${r.url}\nTitle: ${r.title}\nSnippet:\n${r.markdown}`);
    const combinedContent = targetCompanyNotice + this.trimContentArray(searchSnippetsForExtraction, 250000);
    
    // Use corroboration method if available, otherwise fallback
    // Include domain info to help with company matching
    const enrichmentContext: Record<string, string> = {};
    if (companyName && typeof companyName === 'string') enrichmentContext.companyName = companyName;
    if (ctxEmailContext?.companyDomain) enrichmentContext.targetDomain = ctxEmailContext.companyDomain;
    
    const enrichmentResults = typeof this.openai.extractStructuredDataWithCorroboration === 'function'
      ? await this.openai.extractStructuredDataWithCorroboration(
          combinedContent, // This is now combined snippets
          fields,
          enrichmentContext
        )
      : await this.openai.extractStructuredDataOriginal(
          combinedContent, // This is now combined snippets
          fields,
          enrichmentContext
        );
    
    // Add source URLs to each result (only if not already present from corroboration)
    const blockedDomains = ['linkedin.com', 'facebook.com', 'twitter.com', 'instagram.com'];
    for (const [fieldName, enrichment] of Object.entries(enrichmentResults)) {
      if (enrichment && enrichment.value) {
        // Filter out blocked domains from adaptedSearchResults
        const filteredResults = adaptedSearchResults.filter(r => {
          try {
            const domain = new URL(r.url).hostname.toLowerCase();
            return !blockedDomains.some(blocked => domain.includes(blocked));
          } catch {
            return true;
          }
        });
        
        // Only add source if not already present
        if (!enrichment.source) {
          enrichment.source = filteredResults.slice(0, 2).map(r => r.url).join(', ');
        }
        // Update sourceContext with actual URLs
        if (enrichment.sourceContext && enrichment.sourceContext.length > 0) {
          // If we have source quotes from the LLM, keep them as-is if they have valid URLs
          const hasValidUrls = enrichment.sourceContext.some(ctx => ctx.url && ctx.url !== 'extracted');
          if (!hasValidUrls) {
            // Try to match the quote to actual sources
            const existingQuote = enrichment.sourceContext[0].snippet; // This snippet is from LLM extraction
            if (existingQuote) {
              // Find which source's snippet (from OpenAI search) contains this quote
              const matchingSource = filteredResults.find(r => {
                const searchSnippet = (r.markdown || '').toLowerCase(); // r.markdown is the snippet from OpenAI search
                return searchSnippet.includes(existingQuote.toLowerCase().substring(0, 50));
              });
              
              if (matchingSource) {
                enrichment.sourceContext = [{
                  url: matchingSource.url,
                  snippet: existingQuote // Keep the LLM's extracted snippet for context
                }];
              } else {
                // If we can't match, show the first valid source with the quote
                enrichment.sourceContext = filteredResults.slice(0, 1).map(r => ({
                  url: r.url,
                  snippet: existingQuote // Keep LLM's extracted snippet
                }));
              }
            }
          }
        } else {
          // Fallback to finding snippets if LLM didn't provide them
          const { findRelevantSnippet } = await import('../utils/source-context');
          console.log(`[SOURCE-CONTEXT] Using fallback snippet extraction for ${fieldName}`);
          
          enrichment.sourceContext = filteredResults.map(r => {
            // r.markdown here is the snippet from OpenAI search results
            const snippetFromSearch = r.markdown || '';
            
            // We need to find if the enrichment.value is present in snippetFromSearch
            // findRelevantSnippet was designed for longer markdown, might need adjustment for short snippets
            // For now, if enrichment.value is a string, we check its presence.
            let relevantSnippetForContext = snippetFromSearch;
            if (typeof enrichment.value === 'string' && !snippetFromSearch.toLowerCase().includes(enrichment.value.toLowerCase().substring(0,50))) {
                 // If the extracted value isn't directly in the search snippet, the LLM might have synthesized it.
                 // In this case, the search snippet itself is the best context we have.
            } else if (typeof enrichment.value !== 'string') {
                // If value is not string, just use the search snippet.
            }


            if (!relevantSnippetForContext) {
              console.log(`[SOURCE-CONTEXT] No direct snippet match for ${fieldName} value "${enrichment.value}" in ${r.url}, using search snippet.`);
              relevantSnippetForContext = snippetFromSearch; // fallback to search snippet
            }
            
            return {
              url: r.url,
              snippet: relevantSnippetForContext
            };
          }).filter(ctx => {
            const hasSnippet = ctx.snippet && ctx.snippet.length > 0;
            if (!hasSnippet) {
              console.log(`[SOURCE-CONTEXT] Filtering out empty snippet for ${fieldName} from ${ctx.url}`);
            }
            return hasSnippet;
          }).slice(0, 5); // Limit to 5 source contexts
          
          console.log(`[SOURCE-CONTEXT] Final source context for ${fieldName}: ${enrichment.sourceContext.length} sources`);
        }
      }
    }
    
    return enrichmentResults;
  }
  
  private async runMetricsPhase(
    context: Record<string, unknown>,
    fields: EnrichmentField[],
    onAgentProgress?: (message: string, type: 'info' | 'success' | 'warning' | 'agent') => void
  ): Promise<Record<string, unknown>> {
    console.log('[AGENT-METRICS] Starting Metrics Phase');
    // Look for company name in discovered data or context
    const ctxDiscoveredData = context['discoveredData'] as Record<string, unknown>;
    const companyNameField = Object.keys(ctxDiscoveredData).find(key => 
      key.toLowerCase().includes('company') && key.toLowerCase().includes('name')
    );
    const ctxCompanyName = context['companyName'] as string | undefined;
    const ctxEmailContext = context['emailContext'] as EmailContext;
    const fieldValue = ctxDiscoveredData[companyNameField || ''] as { value?: unknown } | unknown;
    const companyName = ctxCompanyName || 
                       (companyNameField && fieldValue ? 
                         ((fieldValue && typeof fieldValue === 'object' && 'value' in fieldValue) ? fieldValue.value : fieldValue) : null) ||
                       ctxEmailContext?.companyNameGuess;
    
    console.log(`[AGENT-METRICS] Company name: ${companyName || 'Not found'}`);
    console.log(`[AGENT-METRICS] Fields to enrich: ${fields.map(f => f.name).join(', ')}`);
    
    if (!companyName) {
      console.log('[AGENT-METRICS] No company name available, skipping metrics phase');
      return {};
    }
    
    // Search for metrics
    const year = new Date().getFullYear();
    // Prioritize company's own domain if available
    const domainQuery = ctxEmailContext?.companyDomain 
      ? `site:${ctxEmailContext.companyDomain} OR ` 
      : '';
    // Use multiple search strategies for better coverage
    const searchQuery = `${domainQuery}"${String(companyName)}" employees "team size" revenue "annual revenue" ARR MRR ${year} ${year-1}`;
    console.log(`[AGENT-METRICS] Search query for OpenAI: ${searchQuery}`);
    
    if (onAgentProgress) {
      onAgentProgress(`Searching for metrics data...`, 'info');
      onAgentProgress(`Query for OpenAI: ${searchQuery.substring(0, 100)}...`, 'info');
    }
    
    const openAISearchResults = await this.searchWithOpenAI(searchQuery, `company metrics for ${String(companyName)}`, 5);
    const adaptedSearchResults = openAISearchResults.map(r => ({ url: r.url, title: r.title, markdown: r.snippet, content: r.snippet }));
    
    console.log(`[AGENT-METRICS] Found ${adaptedSearchResults.length} search results via OpenAI`);
    if (onAgentProgress) {
      onAgentProgress(`Found ${adaptedSearchResults.length} sources with metrics data via OpenAI`, adaptedSearchResults.length > 0 ? 'success' : 'warning');
    }
    
    // Extract metrics from OpenAI search snippets
    const searchSnippetsForExtraction = adaptedSearchResults.map(r => `URL: ${r.url}\nTitle: ${r.title}\nSnippet:\n${r.markdown}`);
    const combinedContent = this.trimContentArray(searchSnippetsForExtraction, 250000);
    
    if (onAgentProgress && adaptedSearchResults.length > 0) {
      onAgentProgress(`Extracting metrics from ${adaptedSearchResults.length} sources...`, 'info');
    }
    
    // Use corroboration method if available, otherwise fallback
    // Include domain info to help with company matching
    const enrichmentContext: Record<string, string> = {};
    if (companyName && typeof companyName === 'string') enrichmentContext.companyName = companyName;
    if (ctxEmailContext?.companyDomain) enrichmentContext.targetDomain = ctxEmailContext.companyDomain;
    
    const enrichmentResults = typeof this.openai.extractStructuredDataWithCorroboration === 'function'
      ? await this.openai.extractStructuredDataWithCorroboration(
          combinedContent, // Combined snippets
          fields,
          enrichmentContext
        )
      : await this.openai.extractStructuredDataOriginal(
          combinedContent, // Combined snippets
          fields,
          enrichmentContext
        );
    
    // Add source URLs to each result (only if not already present from corroboration)
    const blockedDomains = ['linkedin.com', 'facebook.com', 'twitter.com', 'instagram.com'];
    for (const [fieldName, enrichment] of Object.entries(enrichmentResults)) {
      if (enrichment && enrichment.value) {
        // Filter out blocked domains from adaptedSearchResults
        const filteredResults = adaptedSearchResults.filter(r => {
          try {
            const domain = new URL(r.url).hostname.toLowerCase();
            return !blockedDomains.some(blocked => domain.includes(blocked));
          } catch {
            return true;
          }
        });
        
        // Only add source if not already present
        if (!enrichment.source) {
          enrichment.source = filteredResults.slice(0, 2).map(r => r.url).join(', ');
        }
        // Update sourceContext with actual URLs
        if (enrichment.sourceContext && enrichment.sourceContext.length > 0) {
          // If we have source quotes from the LLM, keep them as-is if they have valid URLs
          const hasValidUrls = enrichment.sourceContext.some(ctx => ctx.url && ctx.url !== 'extracted');
          if (!hasValidUrls) {
            // Try to match the quote to actual sources
            const existingQuote = enrichment.sourceContext[0].snippet;
            if (existingQuote) {
              // Find which source's snippet contains this quote
              const matchingSource = filteredResults.find(r => {
                const searchSnippet = (r.markdown || '').toLowerCase(); // r.markdown is snippet from OpenAI search
                return searchSnippet.includes(existingQuote.toLowerCase().substring(0, 50));
              });
              
              if (matchingSource) {
                enrichment.sourceContext = [{
                  url: matchingSource.url,
                  snippet: existingQuote
                }];
              } else {
                // If we can't match, show the first valid source with the quote
                enrichment.sourceContext = filteredResults.slice(0, 1).map(r => ({
                  url: r.url,
                  snippet: existingQuote
                }));
              }
            }
          }
        } else {
          // Fallback to finding snippets if LLM didn't provide them
          const { findRelevantSnippet } = await import('../utils/source-context');
          console.log(`[SOURCE-CONTEXT] Using fallback snippet extraction for ${fieldName}`);
          
          enrichment.sourceContext = filteredResults.map(r => {
            const snippetFromSearch = r.markdown || ''; // Snippet from OpenAI search
            // Similar logic as in profile phase for snippet context
            return {
              url: r.url,
              snippet: snippetFromSearch // For metrics, the search snippet itself is good context
            };
          }).filter(ctx => {
            const hasSnippet = ctx.snippet && ctx.snippet.length > 0;
            if (!hasSnippet) {
              console.log(`[SOURCE-CONTEXT] Filtering out empty snippet for ${fieldName} from ${ctx.url}`);
            }
            return hasSnippet;
          }).slice(0, 5);
          
          console.log(`[SOURCE-CONTEXT] Final source context for ${fieldName}: ${enrichment.sourceContext.length} sources`);
        }
      }
    }
    
    return enrichmentResults;
  }
  
  private async runFundingPhase(
    context: Record<string, unknown>,
    fields: EnrichmentField[],
    onAgentProgress?: (message: string, type: 'info' | 'success' | 'warning' | 'agent') => void
  ): Promise<Record<string, unknown>> {
    console.log('[AGENT-FUNDING] Starting Funding Phase');
    // Look for company name in discovered data or context
    const ctxDiscoveredData = context['discoveredData'] as Record<string, unknown>;
    const companyNameField = Object.keys(ctxDiscoveredData).find(key => 
      key.toLowerCase().includes('company') && key.toLowerCase().includes('name')
    );
    const ctxCompanyName = context['companyName'] as string | undefined;
    const ctxEmailContext = context['emailContext'] as EmailContext;
    const fieldValue = ctxDiscoveredData[companyNameField || ''] as { value?: unknown } | unknown;
    const companyName = ctxCompanyName || 
                       (companyNameField && fieldValue ? 
                         ((fieldValue && typeof fieldValue === 'object' && 'value' in fieldValue) ? fieldValue.value : fieldValue) : null) ||
                       ctxEmailContext?.companyNameGuess;
    
    console.log(`[AGENT-FUNDING] Company name: ${companyName || 'Not found'}`);
    console.log(`[AGENT-FUNDING] Fields to enrich: ${fields.map(f => f.name).join(', ')}`);
    
    if (!companyName) {
      console.log('[AGENT-FUNDING] No company name available, skipping funding phase');
      return {};
    }
    
    // Search for funding information
    // Prioritize company's own domain if available
    const domainQuery = ctxEmailContext?.companyDomain 
      ? `site:${ctxEmailContext.companyDomain} OR ` 
      : '';
    const searchQuery = `${domainQuery}"${String(companyName)}" funding "raised" "series" investment "total funding" valuation investors`;
    console.log(`[AGENT-FUNDING] Search query for OpenAI: ${searchQuery}`);
    
    if (onAgentProgress) {
      onAgentProgress(`Searching for funding information...`, 'info');
      onAgentProgress(`Query for OpenAI: ${searchQuery.substring(0, 100)}...`, 'info');
    }
    
    const openAISearchResults = await this.searchWithOpenAI(searchQuery, `funding information for ${String(companyName)}`, 5);
    const adaptedSearchResults = openAISearchResults.map(r => ({ url: r.url, title: r.title, markdown: r.snippet, content: r.snippet }));

    console.log(`[AGENT-FUNDING] Found ${adaptedSearchResults.length} search results via OpenAI`);
    if (onAgentProgress) {
      onAgentProgress(`Found ${adaptedSearchResults.length} sources with funding data via OpenAI`, adaptedSearchResults.length > 0 ? 'success' : 'warning');
    }
    
    // Extract funding data from OpenAI search snippets
    const searchSnippetsForExtraction = adaptedSearchResults.map(r => `URL: ${r.url}\nTitle: ${r.title}\nSnippet:\n${r.markdown}`);
    const combinedContent = this.trimContentArray(searchSnippetsForExtraction, 250000);
    
    if (onAgentProgress && adaptedSearchResults.length > 0) {
      onAgentProgress(`Extracting funding data from sources...`, 'info');
    }
    
    // Use corroboration method if available, otherwise fallback
    // Include domain info to help with company matching
    const enrichmentContext: Record<string, string> = {};
    if (companyName && typeof companyName === 'string') enrichmentContext.companyName = companyName;
    if (ctxEmailContext?.companyDomain) enrichmentContext.targetDomain = ctxEmailContext.companyDomain;
    
    const enrichmentResults = typeof this.openai.extractStructuredDataWithCorroboration === 'function'
      ? await this.openai.extractStructuredDataWithCorroboration(
          combinedContent, // Combined snippets
          fields,
          enrichmentContext
        )
      : await this.openai.extractStructuredDataOriginal(
          combinedContent, // Combined snippets
          fields,
          enrichmentContext
        );
    
    // Add source URLs to each result (only if not already present from corroboration)
    const blockedDomains = ['linkedin.com', 'facebook.com', 'twitter.com', 'instagram.com'];
    for (const [fieldName, enrichment] of Object.entries(enrichmentResults)) {
      if (enrichment && enrichment.value) {
        // Filter out blocked domains from adaptedSearchResults
        const filteredResults = adaptedSearchResults.filter(r => {
          try {
            const domain = new URL(r.url).hostname.toLowerCase();
            return !blockedDomains.some(blocked => domain.includes(blocked));
          } catch {
            return true;
          }
        });
        
        // Only add source if not already present
        if (!enrichment.source) {
          enrichment.source = filteredResults.slice(0, 2).map(r => r.url).join(', ');
        }
        // Update sourceContext with actual URLs
        if (enrichment.sourceContext && enrichment.sourceContext.length > 0) {
          // If we have source quotes from the LLM, keep them as-is if they have valid URLs
          const hasValidUrls = enrichment.sourceContext.some(ctx => ctx.url && ctx.url !== 'extracted');
          if (!hasValidUrls) {
            // Try to match the quote to actual sources
            const existingQuote = enrichment.sourceContext[0].snippet;
            if (existingQuote) {
              // Find which source's snippet contains this quote
              const matchingSource = filteredResults.find(r => {
                const searchSnippet = (r.markdown || '').toLowerCase(); // r.markdown is snippet from OpenAI search
                return searchSnippet.includes(existingQuote.toLowerCase().substring(0, 50));
              });
              
              if (matchingSource) {
                enrichment.sourceContext = [{
                  url: matchingSource.url,
                  snippet: existingQuote
                }];
              } else {
                // If we can't match, show the first valid source with the quote
                enrichment.sourceContext = filteredResults.slice(0, 1).map(r => ({
                  url: r.url,
                  snippet: existingQuote
                }));
              }
            }
          }
        } else {
          // Fallback to finding snippets if LLM didn't provide them
          const { findRelevantSnippet } = await import('../utils/source-context');
          console.log(`[SOURCE-CONTEXT] Using fallback snippet extraction for ${fieldName}`);
          
          enrichment.sourceContext = filteredResults.map(r => {
            const snippetFromSearch = r.markdown || ''; // Snippet from OpenAI search
            return {
              url: r.url,
              snippet: snippetFromSearch // For funding, the search snippet itself is good context
            };
          }).filter(ctx => {
            const hasSnippet = ctx.snippet && ctx.snippet.length > 0;
            if (!hasSnippet) {
              console.log(`[SOURCE-CONTEXT] Filtering out empty snippet for ${fieldName} from ${ctx.url}`);
            }
            return hasSnippet;
          }).slice(0, 5);
          
          console.log(`[SOURCE-CONTEXT] Final source context for ${fieldName}: ${enrichment.sourceContext.length} sources`);
        }
      }
    }
    
    return enrichmentResults;
  }
  
  private async runTechStackPhase(
    context: Record<string, unknown>,
    fields: EnrichmentField[],
    onAgentProgress?: (message: string, type: 'info' | 'success' | 'warning' | 'agent') => void
  ): Promise<Record<string, unknown>> {
    console.log('[AGENT-TECH-STACK] Starting Tech Stack Phase');
    // Look for company name in discovered data or context
    const ctxDiscoveredData = context['discoveredData'] as Record<string, unknown>;
    const companyNameField = Object.keys(ctxDiscoveredData).find(key => 
      key.toLowerCase().includes('company') && key.toLowerCase().includes('name')
    );
    const ctxCompanyName = context['companyName'] as string | undefined;
    const ctxEmailContext = context['emailContext'] as EmailContext;
    const fieldValue = ctxDiscoveredData[companyNameField || ''] as { value?: unknown } | unknown;
    const companyName = ctxCompanyName || 
                       (companyNameField && fieldValue ? 
                         ((fieldValue && typeof fieldValue === 'object' && 'value' in fieldValue) ? fieldValue.value : fieldValue) : null) ||
                       ctxEmailContext?.companyNameGuess;
    
    const companyDomain = ctxEmailContext?.companyDomain;
    
    console.log(`[AGENT-TECH-STACK] Company name: ${companyName || 'Not found'}`);
    console.log(`[AGENT-TECH-STACK] Company domain: ${companyDomain || 'Not found'}`);
    console.log(`[AGENT-TECH-STACK] Fields to enrich: ${fields.map(f => f.name).join(', ')}`);
    
    if (onAgentProgress) {
      onAgentProgress(`Using company: ${companyName || companyDomain || 'Unknown'}`, 'info');
    }
    
    if (!companyName && !companyDomain) {
      console.log('[AGENT-TECH-STACK] No company name or domain available, skipping tech stack phase');
      return {};
    }
    
    // Search for GitHub repositories
    const githubQuery = companyName && typeof companyName === 'string'
      ? `site:github.com "${companyName}" OR "${companyName.toLowerCase().replace(/\s+/g, '-')}"`
      : `site:github.com "${companyDomain?.replace('.com', '').replace('.io', '').replace('.ai', '')}"`;
    
    console.log(`[AGENT-TECH-STACK] GitHub search query: ${githubQuery}`);
    
    if (onAgentProgress) {
      onAgentProgress(`Searching GitHub for repositories...`, 'info');
      onAgentProgress(`Query: ${githubQuery.substring(0, 80)}...`, 'info');
    }
    
    let githubOpenAISearchResults: OrchestratorOpenAISearchResult[] = []; // Renamed
    try {
      // Use OpenAI search for GitHub
      githubOpenAISearchResults = await this.searchWithOpenAI(githubQuery, `GitHub repositories for ${companyName || companyDomain}`, 3);
      
      // Validate that these are actual GitHub URLs from snippets if possible (though LLM should be good at this)
      githubOpenAISearchResults = githubOpenAISearchResults.filter(result => result.url.includes('github.com'));
      
      console.log(`[AGENT-TECH-STACK] Found ${githubOpenAISearchResults.length} valid GitHub results via OpenAI`);
      if (githubOpenAISearchResults.length > 0) {
        console.log(`[AGENT-TECH-STACK] GitHub URLs: ${githubOpenAISearchResults.map(r => r.url).join(', ')}`);
      }
    } catch (error) {
      console.log(`[AGENT-TECH-STACK] GitHub search via OpenAI failed: ${error}`);
      githubOpenAISearchResults = [];
    }
    
    // Analyze HTML from company website for tech stack detection - This part is tricky without direct scraping.
    // We'll use the getContentFromUrlWithOpenAI helper and rely on its ability to extract tech details.
    let websiteHtmlSummary = '';
    // let detectedTechnologies: string[] = []; // analyzeTechStackFromHtml is removed
    
    if (companyDomain) {
      try {
        console.log(`[AGENT-TECH-STACK] Getting HTML summary from company website for analysis: https://${companyDomain}`);
        const websiteData = await this.getContentFromUrlWithOpenAI(`https://${companyDomain}`, "technologies used, like JavaScript frameworks, server-side languages, analytics tools, CMS, etc.");
        if (websiteData.markdown) {
          websiteHtmlSummary = websiteData.markdown;
          console.log(`[AGENT-TECH-STACK] HTML summary fetched, length: ${websiteHtmlSummary.length}`);
          // The analyzeTechStackFromHtml method is removed. We will rely on OpenAI to extract from this summary.
        }
      } catch (error) {
        console.log(`[AGENT-TECH-STACK] Failed to fetch HTML summary: ${error}`);
      }
    }
    
    // Search for tech stack mentions
    const techSearchQuery = `"${companyName || companyDomain}" "tech stack" "built with" "powered by" technologies framework`;
    console.log(`[AGENT-TECH-STACK] Tech stack search query for OpenAI: ${techSearchQuery}`);
    
    if (onAgentProgress) {
      onAgentProgress(`Searching for technology stack information...`, 'info');
    }
    
    const techOpenAISearchResults = await this.searchWithOpenAI(techSearchQuery, `technology stack for ${companyName || companyDomain}`, 3); // Renamed
    console.log(`[AGENT-TECH-STACK] Found ${techOpenAISearchResults.length} tech stack results via OpenAI`);
    
    if (onAgentProgress) {
      onAgentProgress(`Found ${techOpenAISearchResults.length} sources with tech stack data via OpenAI`, techOpenAISearchResults.length > 0 ? 'success' : 'info');
    }
    
    // Combine all search results (snippets)
    const allSearchSnippets = [
        ...githubOpenAISearchResults.map(r => `Source URL: ${r.url}\nTitle: ${r.title}\nSnippet:\n${r.snippet}`),
        ...techOpenAISearchResults.map(r => `Source URL: ${r.url}\nTitle: ${r.title}\nSnippet:\n${r.snippet}`)
    ];
    
    // Create combined content including website summary
    let combinedContent = this.trimContentArray(allSearchSnippets, 150000); // Adjusted limit for snippets

    if (websiteHtmlSummary) {
      combinedContent = `COMPANY WEBSITE SUMMARY (for tech stack clues):\n${websiteHtmlSummary}\n\n---\n\n` + combinedContent;
    }
    
    // Validate we have actual content before extraction
    const hasValidGithubContent = githubOpenAISearchResults.length > 0 &&
      githubOpenAISearchResults.some(r => r.snippet && r.snippet.length > 10);
    
    const hasValidTechContent = techOpenAISearchResults.length > 0 &&
      techOpenAISearchResults.some(r => r.snippet && r.snippet.length > 10);
    
    if (!hasValidGithubContent && !hasValidTechContent && !websiteHtmlSummary) {
      console.log('[AGENT-TECH-STACK] No valid tech stack information found, returning empty results');
      return {};
    }
    
    // Extract structured data
    const enrichmentContext: Record<string, string> = {};
    if (companyName && typeof companyName === 'string') enrichmentContext.companyName = companyName;
    if (companyDomain) {
      enrichmentContext.companyDomain = companyDomain;
      enrichmentContext.targetDomain = companyDomain;
    }
    enrichmentContext.instruction = `CRITICAL: Only extract technology information that is EXPLICITLY mentioned in the provided content (search snippets or website summary).
      
      DO NOT hallucinate or infer technologies.
      DO NOT make up GitHub URLs - only use URLs that actually appear in the search result snippets.
      
      For tech stack fields:
      - Only include technologies that are explicitly mentioned.
      - If the website summary mentions technologies, you can include those.
      - Do not guess based on company type or industry.
      - If no tech stack information is found, return null.
      
      Valid GitHub URLs found (if any): ${githubOpenAISearchResults.map(r => r.url).join(', ') || 'None'}`;
    // Note: detectedTechnologies from direct HTML parsing is removed as we use summary now.
    if (githubOpenAISearchResults.length > 0) {
      enrichmentContext.validGithubUrls = githubOpenAISearchResults.map(r => r.url).join(', ');
    }
    
    const enrichmentResults = typeof this.openai.extractStructuredDataWithCorroboration === 'function'
      ? await this.openai.extractStructuredDataWithCorroboration(
          combinedContent,
          fields,
          enrichmentContext
        )
      : await this.openai.extractStructuredDataOriginal(
          combinedContent,
          fields,
          enrichmentContext
        );
    
    
    // Add source URLs to results and validate GitHub sources
    const blockedDomains = ['linkedin.com', 'facebook.com', 'twitter.com', 'instagram.com'];
    const allSourceSnippetsForContext = [...githubOpenAISearchResults, ...techOpenAISearchResults];

    for (const [fieldName, enrichment] of Object.entries(enrichmentResults)) {
      if (enrichment && enrichment.value) {
        // Filter out blocked domains
        const filteredResults = allSourceSnippetsForContext.filter(r => {
          try {
            const domain = new URL(r.url).hostname.toLowerCase();
            return !blockedDomains.some(blocked => domain.includes(blocked));
          } catch {
            return true;
          }
        });
        
        // Validate GitHub sources in the enrichment
        if (enrichment.sourceContext && Array.isArray(enrichment.sourceContext)) {
          enrichment.sourceContext = enrichment.sourceContext.filter(ctx => {
            if (!ctx.url) return false;
            
            // If it claims to be a GitHub URL, verify it was in our OpenAI search results for GitHub
            if (ctx.url.includes('github.com')) {
              const isValidGithub = githubOpenAISearchResults.some(r => r.url === ctx.url);
              if (!isValidGithub) {
                console.log(`[AGENT-TECH-STACK] Removing potentially hallucinated GitHub URL not found in initial search: ${ctx.url}`);
                return false;
              }
            }
            return true;
          });
        }
        
        // Only add source if not already present
        if (!enrichment.source) {
          enrichment.source = filteredResults.slice(0, 2).map(r => r.url).join(', ');
        }
         if (!enrichment.sourceContext || enrichment.sourceContext.length === 0) { // Provide source context from snippets
            enrichment.sourceContext = filteredResults.slice(0,2).map(r => ({ url: r.url, snippet: r.snippet}));
        }
        
        // Additional validation for tech stack values
        const field = fields.find(f => f.name === fieldName);
        if (field && field.type === 'array' && Array.isArray(enrichment.value)) {
          // Remove generic or unlikely technologies
          const genericTechs = ['website', 'web', 'internet', 'computer', 'software', 'technology', 'platform'];
          enrichment.value = enrichment.value.filter(tech => {
            const techLower = String(tech).toLowerCase();
            return !genericTechs.includes(techLower) && techLower.length > 1;
          });
          
          // If no valid technologies remain, keep empty array
          // (enrichment.value is already an empty array at this point)
        }
      }
    }
    
    return enrichmentResults;
  }
  
  private async runGeneralPhase(
    context: Record<string, unknown>,
    fields: EnrichmentField[],
    onAgentProgress?: (message: string, type: 'info' | 'success' | 'warning' | 'agent') => void
  ): Promise<Record<string, unknown>> {
    console.log('[AGENT-GENERAL] Starting General Information Phase');
    // Look for company name in discovered data or context
    const ctxDiscoveredData = context['discoveredData'] as Record<string, unknown>;
    const companyNameField = Object.keys(ctxDiscoveredData).find(key => 
      key.toLowerCase().includes('company') && key.toLowerCase().includes('name')
    );
    const ctxCompanyName = context['companyName'] as string | undefined;
    const ctxEmailContext = context['emailContext'] as EmailContext;
    const fieldValue = ctxDiscoveredData[companyNameField || ''] as { value?: unknown } | unknown;
    const companyName = ctxCompanyName || 
                       (companyNameField && fieldValue ? 
                         ((fieldValue && typeof fieldValue === 'object' && 'value' in fieldValue) ? fieldValue.value : fieldValue) : null) ||
                       ctxEmailContext?.companyNameGuess;
    
    const companyDomain = ctxEmailContext?.companyDomain;
    
    console.log(`[AGENT-GENERAL] Company name: ${companyName || 'Not found'}`);
    console.log(`[AGENT-GENERAL] Company domain: ${companyDomain || 'Not found'}`);
    console.log(`[AGENT-GENERAL] Fields to enrich: ${fields.map(f => f.name).join(', ')}`);
    
    if (onAgentProgress) {
      onAgentProgress(`Using company: ${companyName || companyDomain || 'Unknown'}`, 'info');
    }
    
    if (!companyName && !companyDomain) {
      console.log('[AGENT-GENERAL] No company name or domain available, skipping general phase');
      return {};
    }
    
    // Build targeted search queries for the requested fields
    const searchQueries = this.buildGeneralSearchQueries(fields, typeof companyName === 'string' ? companyName : undefined, companyDomain);
    
    if (onAgentProgress && searchQueries.length > 0) {
      onAgentProgress(`Prepared ${searchQueries.length} search queries for custom fields`, 'info');
    }
    
    let allOpenAISearchResults: OrchestratorOpenAISearchResult[] = [];
    
    for (let i = 0; i < searchQueries.length; i++) {
      const query = searchQueries[i];
      try {
        console.log(`[AGENT-GENERAL] Searching with OpenAI: ${query}`);
        if (onAgentProgress) {
          onAgentProgress(`Search ${i + 1}/${searchQueries.length} with OpenAI: ${query.substring(0, 60)}...`, 'info');
        }
        // For general phase, targetInfo can be a concatenation of field descriptions
        const targetInfoForQuery = fields.map(f => f.description).join('; ');
        const currentQueryResults = await this.searchWithOpenAI(query, targetInfoForQuery, 3);
        
        if (currentQueryResults && currentQueryResults.length > 0) {
          console.log(`[AGENT-GENERAL] Found ${currentQueryResults.length} results via OpenAI`);
          if (onAgentProgress) {
            onAgentProgress(`Found ${currentQueryResults.length} results via OpenAI`, 'success');
          }
          allOpenAISearchResults = allOpenAISearchResults.concat(currentQueryResults);
        }
      } catch (error) {
        console.log(`[AGENT-GENERAL] OpenAI Search failed: ${error}`);
      }
    }
    
    // Also try to retrieve content from specific pages for executive info using OpenAI
    if (companyDomain && this.hasExecutiveFields(fields)) {
      if (onAgentProgress) {
        onAgentProgress(`Checking company website for executive information (using OpenAI content retrieval)...`, 'info');
      }
      const executiveUrls = [
        `https://${companyDomain}/about`, `https://${companyDomain}/team`,
        `https://${companyDomain}/leadership`, `https://${companyDomain}/about-us`, `https://${companyDomain}/our-team`
      ];
      for (const url of executiveUrls) { // Changed loop variable for clarity
        try {
          if (onAgentProgress) { onAgentProgress(`Checking ${url.split('/').pop()} page...`, 'info'); }
          const pageContent = await this.getContentFromUrlWithOpenAI(url, "executive team members, leadership roles, CEO, CTO, CFO information");
          if (pageContent.markdown) {
            // Add this retrieved content as if it were a search result's snippet/markdown
            allOpenAISearchResults.push({
              url: url,
              title: pageContent.metadata.title || 'Company Leadership Page', // Use title from metadata or default
              snippet: pageContent.markdown
            });
            console.log(`[AGENT-GENERAL] Successfully retrieved content from ${url} using OpenAI`);
            if (onAgentProgress) { onAgentProgress(`Retrieved executive information from ${url.split('/').pop()} page`, 'success');}
            break;
          }
        } catch (e) { console.log(`[AGENT-GENERAL] Failed to retrieve content from ${url} using OpenAI`, e); }
      }
    }
    
    // Deduplicate by URL
    const uniqueOpenAISearchResults = Array.from( // Renamed for clarity
      new Map(allOpenAISearchResults.map(r => [r.url, r])).values()
    );
    // Adapt to the structure expected by trimContentArray and extraction if necessary
    const adaptedUniqueResults = uniqueOpenAISearchResults.map(r => ({ url: r.url, title: r.title, markdown: r.snippet, content: r.snippet }));
    
    console.log(`[AGENT-GENERAL] Total unique results: ${adaptedUniqueResults.length}`);
    
    if (adaptedUniqueResults.length === 0) {
      console.log('[AGENT-GENERAL] No search results found');
      return {};
    }
    
    // Use trimmed content (snippets) for extraction
    const searchSnippetsForExtraction = adaptedUniqueResults.map(r => `URL: ${r.url}\nTitle: ${r.title}\nSnippet:\n${r.markdown}`);
    const combinedContent = this.trimContentArray(searchSnippetsForExtraction, 200000);
    
    // Extract structured data
    const enrichmentContext: Record<string, string> = {};
    if (companyName && typeof companyName === 'string') enrichmentContext.companyName = companyName;
    if (companyDomain) {
      enrichmentContext.companyDomain = companyDomain;
      enrichmentContext.targetDomain = companyDomain;
    }
    enrichmentContext.instruction = `Extract the requested information about ${companyName || companyDomain} from the provided text snippets.
      
      For executive names (CEO, CTO, CFO, etc.):
      - Look for mentions like "CEO", "Chief Executive Officer", "founder and CEO", etc.
      - Extract the person's full name.
      - Be careful to match the title exactly as requested.
      
      For other custom fields:
      - Extract exactly what is asked for based on the field descriptions.
      - Only include information that is explicitly stated in the snippets.
      - Do not make assumptions or inferences beyond the provided text.`;
    
    const enrichmentResults = typeof this.openai.extractStructuredDataWithCorroboration === 'function'
      ? await this.openai.extractStructuredDataWithCorroboration(
          combinedContent, // Combined snippets
          fields,
          enrichmentContext
        )
      : await this.openai.extractStructuredDataOriginal(
          combinedContent, // Combined snippets
          fields,
          enrichmentContext
        );
    
    const foundFields = Object.keys(enrichmentResults).filter(k => enrichmentResults[k]?.value);
    if (onAgentProgress && foundFields.length > 0) {
      onAgentProgress(`Successfully extracted ${foundFields.length} custom fields`, 'success');
    }
    
    // Add source URLs to results
    const blockedDomains = ['linkedin.com', 'facebook.com', 'twitter.com', 'instagram.com'];
    for (const [, enrichment] of Object.entries(enrichmentResults)) {
      if (enrichment && enrichment.value) {
        // Filter out blocked domains from adaptedUniqueResults
        const filteredResults = adaptedUniqueResults.filter(r => {
          try {
            const domain = new URL(r.url).hostname.toLowerCase();
            return !blockedDomains.some(blocked => domain.includes(blocked));
          } catch {
            return true;
          }
        });
        
        // Only add source if not already present
        if (!enrichment.source) {
          enrichment.source = filteredResults.slice(0, 2).map(r => r.url).join(', ');
        }
        // Populate sourceContext using the snippets from adaptedUniqueResults
        if (!enrichment.sourceContext || enrichment.sourceContext.length === 0) {
            enrichment.sourceContext = filteredResults.slice(0,2).map(r => ({ url: r.url, snippet: r.markdown || '' }));
        }
      }
    }
    
    return enrichmentResults;
  }
  
  private buildGeneralSearchQueries(fields: EnrichmentField[], companyName?: string, companyDomain?: string): string[] {
    const queries: string[] = [];
    
    // Group fields by type
    const executiveFields = fields.filter(f => this.isExecutiveField(f));
    const otherFields = fields.filter(f => !this.isExecutiveField(f));
    
    // Build queries for executive fields
    if (executiveFields.length > 0) {
      const titles = executiveFields.map(f => this.extractTitle(f)).filter(Boolean);
      
      if (companyName) {
        queries.push(`"${String(companyName)}" leadership team executives ${titles.join(' ')}`);
        queries.push(`"${String(companyName)}" CEO CTO CFO founders management`);
      }
      
      if (companyDomain) {
        queries.push(`site:${companyDomain} team leadership about executives`);
      }
    }
    
    // Build queries for other fields
    for (const field of otherFields) {
      const fieldTerms = this.getSearchTermsForField(field);
      
      if (companyName) {
        queries.push(`"${String(companyName)}" ${fieldTerms}`);
      }
      
      if (companyDomain) {
        queries.push(`site:${companyDomain} ${fieldTerms}`);
      }
    }
    
    return queries;
  }
  
  private hasExecutiveFields(fields: EnrichmentField[]): boolean {
    return fields.some(f => this.isExecutiveField(f));
  }
  
  private isExecutiveField(field: EnrichmentField): boolean {
    const name = field.name.toLowerCase();
    const desc = field.description.toLowerCase();
    
    const executiveTitles = ['ceo', 'cto', 'cfo', 'coo', 'cmo', 'cpo', 'chief', 'founder', 'president', 'director'];
    
    return executiveTitles.some(title => name.includes(title) || desc.includes(title));
  }
  
  private extractTitle(field: EnrichmentField): string {
    const name = field.name.toLowerCase();
    const desc = field.description.toLowerCase();
    
    // Map common variations to standard titles
    if (name.includes('ceo') || desc.includes('chief executive')) return 'CEO';
    if (name.includes('cto') || desc.includes('chief technology')) return 'CTO';
    if (name.includes('cfo') || desc.includes('chief financial')) return 'CFO';
    if (name.includes('coo') || desc.includes('chief operating')) return 'COO';
    if (name.includes('cmo') || desc.includes('chief marketing')) return 'CMO';
    if (name.includes('cpo') || desc.includes('chief product')) return 'CPO';
    if (name.includes('founder')) return 'founder';
    if (name.includes('president')) return 'president';
    
    return field.name;
  }
  
  private getSearchTermsForField(field: EnrichmentField): string {
    // Generate search terms based on field name and description
    const terms = [field.name];
    
    // Add related terms from description
    if (field.description) {
      // Extract key phrases from description
      const keyPhrases = field.description
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 3 && !['this', 'that', 'what', 'when', 'where', 'which'].includes(word));
      
      terms.push(...keyPhrases.slice(0, 3)); // Add top 3 key words
    }
    
    return terms.join(' ');
  }
  
  private analyzeTechStackFromHtml(html: string): string[] {
    const technologies: Set<string> = new Set();
    
    // Meta tag patterns
    const metaPatterns = [
      // Generator meta tags
      /<meta\s+name=["']generator["']\s+content=["']([^"']+)["']/gi,
      /<meta\s+content=["']([^"']+)["']\s+name=["']generator["']/gi,
      
      // Application name
      /<meta\s+name=["']application-name["']\s+content=["']([^"']+)["']/gi,
      /<meta\s+content=["']([^"']+)["']\s+name=["']application-name["']/gi,
    ];
    
    // Script source patterns that indicate technologies
    const scriptPatterns = [
      // React
      /react(?:\.min)?\.js/i,
      /react-dom(?:\.min)?\.js/i,
      
      // Angular
      /angular(?:\.min)?\.js/i,
      /zone\.js/i,
      
      // Vue
      /vue(?:\.min)?\.js/i,
      
      // jQuery
      /jquery(?:-\d+\.\d+\.\d+)?(?:\.min)?\.js/i,
      
      // Analytics
      /google-analytics\.com|googletagmanager\.com/i,
      /segment\.com|segment\.io/i,
      /hotjar\.com/i,
      /mixpanel\.com/i,
      
      // CDNs and frameworks
      /bootstrap(?:\.min)?\.(?:js|css)/i,
      /tailwind(?:css)?/i,
      /material(?:ize)?(?:\.min)?\.(?:js|css)/i,
      
      // Webpack/bundlers
      /webpack/i,
      /bundle\.\w+\.js/i,
      
      // Next.js
      /_next\/static/i,
      
      // Gatsby
      /gatsby/i,
    ];
    
    // Check meta tags
    for (const pattern of metaPatterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        if (match[1]) {
          technologies.add(match[1]);
        }
      }
    }
    
    // Check for framework-specific patterns in HTML
    if (html.includes('ng-app') || html.includes('ng-controller')) {
      technologies.add('AngularJS');
    }
    if (html.includes('v-for') || html.includes('v-if') || html.includes('v-model')) {
      technologies.add('Vue.js');
    }
    if (html.includes('data-react') || html.includes('__NEXT_DATA__')) {
      technologies.add('React');
    }
    if (html.includes('__NEXT_DATA__')) {
      technologies.add('Next.js');
    }
    if (html.includes('__NUXT__')) {
      technologies.add('Nuxt.js');
    }
    if (html.includes('gatsby-')) {
      technologies.add('Gatsby');
    }
    
    // Check script sources
    const scriptSrcMatches = html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi);
    for (const match of scriptSrcMatches) {
      const src = match[1];
      
      // Check against patterns
      for (const pattern of scriptPatterns) {
        if (pattern.test(src)) {
          // Extract technology name from pattern
          const techName = pattern.source
            .replace(/[\\^$.*+?()[\]{}|]/g, '')
            .replace(/\(\?:-?\d\+\\\.\d\+\\\.\d\+\)/g, '')
            .replace(/\(\?:\\.min\)/g, '')
            .replace(/\\\./g, '.')
            .replace(/\//g, '')
            .split(/[.-]/)[0];
          
          if (techName && techName.length > 2) {
            technologies.add(techName.charAt(0).toUpperCase() + techName.slice(1));
          }
        }
      }
      
      // Specific technology detection
      if (src.includes('react')) technologies.add('React');
      if (src.includes('angular')) technologies.add('Angular');
      if (src.includes('vue')) technologies.add('Vue.js');
      if (src.includes('jquery')) technologies.add('jQuery');
      if (src.includes('bootstrap')) technologies.add('Bootstrap');
      if (src.includes('tailwind')) technologies.add('Tailwind CSS');
      if (src.includes('wordpress')) technologies.add('WordPress');
      if (src.includes('shopify')) technologies.add('Shopify');
      if (src.includes('squarespace')) technologies.add('Squarespace');
      if (src.includes('wix')) technologies.add('Wix');
      if (src.includes('webflow')) technologies.add('Webflow');
      if (src.includes('stripe')) technologies.add('Stripe');
      if (src.includes('cloudflare')) technologies.add('Cloudflare');
      if (src.includes('cdn.jsdelivr.net')) technologies.add('jsDelivr CDN');
      if (src.includes('unpkg.com')) technologies.add('unpkg CDN');
      if (src.includes('cdnjs.cloudflare.com')) technologies.add('cdnjs');
    }
    
    // Check for CSS frameworks in link tags
    const linkMatches = html.matchAll(/<link[^>]+href=["']([^"']+)["']/gi);
    for (const match of linkMatches) {
      const href = match[1];
      if (href.includes('bootstrap')) technologies.add('Bootstrap');
      if (href.includes('tailwind')) technologies.add('Tailwind CSS');
      if (href.includes('material')) technologies.add('Material Design');
      if (href.includes('bulma')) technologies.add('Bulma');
      if (href.includes('foundation')) technologies.add('Foundation');
      if (href.includes('semantic')) technologies.add('Semantic UI');
    }
    
    // Check for specific technology indicators in HTML comments
    const commentRegex = /<!--\s*([\s\S]+?)\s*-->/g;
    let commentMatch;
    while ((commentMatch = commentRegex.exec(html)) !== null) {
      const comment = commentMatch[1].toLowerCase();
      if (comment.includes('wordpress')) technologies.add('WordPress');
      if (comment.includes('drupal')) technologies.add('Drupal');
      if (comment.includes('joomla')) technologies.add('Joomla');
      if (comment.includes('magento')) technologies.add('Magento');
      if (comment.includes('shopify')) technologies.add('Shopify');
    }
    
    // Check for framework-specific CSS classes
    if (html.match(/class=["'][^"']*\bmui-[^"'\s]+/)) technologies.add('Material-UI');
    if (html.match(/class=["'][^"']*\bant-[^"'\s]+/)) technologies.add('Ant Design');
    if (html.match(/class=["'][^"']*\bchakra-[^"'\s]+/)) technologies.add('Chakra UI');
    
    // Check for specific meta properties
    if (html.includes('property="og:')) technologies.add('Open Graph Protocol');
    if (html.includes('name="twitter:')) technologies.add('Twitter Cards');
    
    // Check for PWA indicators
    if (html.includes('manifest.json') || html.includes('service-worker')) {
      technologies.add('Progressive Web App (PWA)');
    }
    
    // Remove duplicates and return as array
    return Array.from(technologies).filter(tech => tech && tech.length > 0);
  }
  
  private formatEnrichmentResults(
    enrichments: Record<string, unknown>,
    fields: EnrichmentField[]
  ): Record<string, EnrichmentResult> {
    const formatted: Record<string, EnrichmentResult> = {};
    
    for (const field of fields) {
      const enrichment = enrichments[field.name];
      
      // If we have a full EnrichmentResult object, use it
      if (enrichment && typeof enrichment === 'object' && 'value' in enrichment && 'confidence' in enrichment) {
        formatted[field.name] = enrichment as EnrichmentResult;
      } 
      // If we only have a raw value (shouldn't happen anymore, but keep as safety)
      else if (enrichment !== undefined && enrichment !== null) {
        console.warn(`[ORCHESTRATOR] Raw value found for field ${field.name}, this shouldn't happen`);
        // Ensure the value is of a valid type
        let value: string | number | boolean | string[];
        if (typeof enrichment === 'string' || typeof enrichment === 'number' || typeof enrichment === 'boolean') {
          value = enrichment;
        } else if (Array.isArray(enrichment)) {
          value = enrichment.map(item => String(item));
        } else {
          value = String(enrichment);
        }
        formatted[field.name] = {
          field: field.name,
          value,
          confidence: 0.5,
          source: 'Unknown source',
          sourceContext: []
        };
      }
      // If no data found, don't include in results
      else {
        // Don't add null results - let the UI handle missing fields
      }
    }
    
    return formatted;
  }
  
  private isValidCompanyWebsite(scraped: { markdown?: string; metadata?: { title?: string } }): boolean {
    const markdown = (scraped.markdown || '').toLowerCase();
    const title = (scraped.metadata?.title || '').toLowerCase();
    
    // Check for domain sale/parking indicators
    const invalidIndicators = [
      'domain for sale',
      'domain is for sale',
      'buy this domain',
      'purchase this domain',
      'make an offer',
      'domain parking',
      'parked domain',
      'under construction',
      'coming soon',
      'website is under construction',
      'this site is currently unavailable',
      'account suspended',
      'default web page',
      'test page',
      'apache2 ubuntu default',
      'welcome to nginx',
      'it works!',
      'index of /',
      'domain name registration',
      'get your domain',
      'register domain',
      'godaddy',
      'namecheap',
      'domain.com',
      '404 not found',
      '403 forbidden',
      'access denied'
    ];
    
    for (const indicator of invalidIndicators) {
      if (markdown.includes(indicator) || title.includes(indicator)) {
        console.log(`[ORCHESTRATOR] Detected invalid website indicator: "${indicator}"`);
        return false;
      }
    }
    
    // Check if content is too short (likely a placeholder)
    if (markdown.length < 200) {
      console.log(`[ORCHESTRATOR] Content too short (${markdown.length} chars), likely placeholder`);
      return false;
    }
    
    // Check for minimum legitimate content indicators
    const hasLegitimateContent = 
      markdown.includes('about') ||
      markdown.includes('product') ||
      markdown.includes('service') ||
      markdown.includes('contact') ||
      markdown.includes('team') ||
      markdown.includes('company') ||
      markdown.includes('we ') ||
      markdown.includes('our ');
    
    if (!hasLegitimateContent) {
      console.log(`[ORCHESTRATOR] No legitimate company content indicators found`);
      return false;
    }
    
    return true;
  }

  private extractCompanyName(scraped: { markdown?: string; metadata?: Record<string, unknown>; url?: string }): string | null {
    // First check if this is a valid company website
    if (!this.isValidCompanyWebsite(scraped)) {
      console.log('[ORCHESTRATOR] Invalid company website detected, skipping extraction');
      return null;
    }
    
    const metadata = scraped.metadata || {};
    const markdown = scraped.markdown || '';
    const url = scraped.url || '';
    
    // Extract domain from URL for validation
    const urlDomain = url.replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
    const baseDomain = urlDomain.replace(/^www\./, '').split('.')[0];
    
    console.log(`[ORCHESTRATOR] Extracting company name for domain: ${urlDomain}`);
    
    // Known company mappings for proper capitalization
    const knownCompanies: Record<string, string> = {
      'onetrust': 'OneTrust',
      'sideguide': 'Sideguide',
      'frontapp': 'Front',
      'shippo': 'Shippo',
      'lattice': 'Lattice',
      'pilot': 'Pilot',
      'fundera': 'Fundera',
      'flexport': 'Flexport',
      'triplebyte': 'Triplebyte',
      'zola': 'Zola',
      'pinterest': 'Pinterest',
      'brex': 'Brex',
      'deel': 'Deel',
      'scale': 'Scale AI',
      'wiz': 'Wiz',
      'firecrawl': 'Firecrawl',
    };
    
    // Check if it's a known company first
    if (knownCompanies[baseDomain]) {
      console.log(`[ORCHESTRATOR] Found known company: ${knownCompanies[baseDomain]}`);
      return knownCompanies[baseDomain];
    }
    
    // Look for og:site_name meta tag first (most reliable)
    const ogSiteNameMatch = markdown.match(/property="og:site_name"\s+content="([^"]+)"/i);
    if (ogSiteNameMatch && ogSiteNameMatch[1]) {
      const siteName = ogSiteNameMatch[1].trim();
      if (siteName && siteName.length > 2) {
        console.log(`[ORCHESTRATOR] Found company name in og:site_name: ${siteName}`);
        return siteName;
      }
    }
    
    // Look for company name patterns in the content
    const companyPatterns = [
      /(?:Welcome to|About)\s+([A-Z][A-Za-z0-9\s&.]+?)(?:\s*[\||-]|\s*$)/i,
      /^([A-Z][A-Za-z0-9\s&.]+?)\s*(?:is|offers|provides|builds)/im,
      /©\s*\d{4}\s+([A-Z][A-Za-z0-9\s&.]+?)(?:\s|$)/i,
    ];
    
    for (const pattern of companyPatterns) {
      const match = markdown.match(pattern);
      if (match && match[1]) {
        const name = match[1].trim();
        // Validate the name against the domain
        const nameLower = name.toLowerCase().replace(/\s+/g, '');
        if (nameLower.includes(baseDomain) || baseDomain.includes(nameLower.substring(0, 4))) {
          console.log(`[ORCHESTRATOR] Found company name via pattern: ${name}`);
          return name;
        }
      }
    }
    
    // Try metadata title but validate against domain
    if (metadata.title && typeof metadata.title === 'string') {
      const cleaned = metadata.title
        .replace(/\s*[\||-]\s*(?:Official\s*)?(?:Website|Site|Home|Page)?\s*$/gi, '')
        .replace(/\s*[\||-]\s*[^|]+$/i, '')
        .replace(/\s*:\s*[^:]+$/i, '')
        .replace(/\s*-\s*[^-]+$/i, '')
        .replace(/\.com.*$/i, '')
        .replace(/is for sale.*$/i, '')
        .trim();
      
      if (cleaned && cleaned.length > 2) {
        const cleanedLower = cleaned.toLowerCase().replace(/\s+/g, '');
        // Validate against domain
        if (cleanedLower.includes(baseDomain) || baseDomain.includes(cleanedLower.substring(0, 4))) {
          console.log(`[ORCHESTRATOR] Found company name in title: ${cleaned}`);
          return cleaned;
        }
      }
    }
    
    // Last resort: use the domain name with proper capitalization
    const words = baseDomain.split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    );
    const fallbackName = words.join(' ');
    console.log(`[ORCHESTRATOR] Using domain-based fallback: ${fallbackName}`);
    
    return fallbackName;
  }
  
  private extractDescription(scraped: { markdown?: string; metadata?: { description?: string; title?: string } }): string | null {
    // First check if this is a valid company website
    if (!this.isValidCompanyWebsite(scraped)) {
      console.log('[ORCHESTRATOR] Invalid company website detected, skipping description extraction');
      return null;
    }
    
    const metadata = scraped.metadata || {};
    const markdown = scraped.markdown || '';
    
    // Try meta description
    if (metadata.description && typeof metadata.description === 'string' && metadata.description.length > 20) {
      return metadata.description;
    }
    
    // Look for about sections
    const aboutMatch = markdown.match(
      /(?:About|Mission|What\s+We\s+Do)[\s:]+([^\n]+(?:\n[^\n]+){0,2})/i
    );
    if (aboutMatch) {
      return aboutMatch[1].trim().replace(/\n+/g, ' ');
    }
    
    return null;
  }
  
  private async extractFromSearchResults(
    searchResults: Array<{ url: string; title?: string; markdown?: string }>,
    fields: EnrichmentField[],
    context: Record<string, unknown>,
    onAgentProgress?: (message: string, type: 'info' | 'success' | 'warning' | 'agent') => void
  ): Promise<Record<string, unknown>> {
    console.log('[AGENT-DISCOVERY] Extracting from search results...');
    
    if (searchResults.length === 0) {
      return {};
    }
    
    if (onAgentProgress) {
      onAgentProgress(`Analyzing content from ${searchResults.length} sources...`, 'info');
    }
    
    // Combine search result snippets for LLM extraction
    // searchResults here are already adapted: { url, title, markdown: snippet, content: snippet }
    const combinedSnippets = this.trimContentArray( // Using trimContentArray
        searchResults.slice(0, 5).map(r => `URL: ${r.url}\nTitle: ${r.title || 'N/A'}\nSnippet:\n${r.markdown || ''}`),
        100000 // Max chars for combined snippets
    );
    
    // Include context to help LLM understand what we're looking for
    const emailContext = context.emailContext as EmailContext;
    const extractionPrompt = `
Context for the company search:
- Email domain: ${emailContext.domain}
- Possible company domain: ${emailContext.companyDomain || 'Unknown'}
- Possible company name: ${emailContext.companyNameGuess || 'Unknown'}

Based ONLY on the provided search result snippets below, extract the following information for this specific company:
${fields.map(f => `- ${f.displayName || f.name}: ${f.description}`).join('\n')}

IMPORTANT: Only extract information that is clearly and explicitly stated in the provided snippets and is about the company associated with the email domain ${emailContext.domain}. Do not infer or use external knowledge.
If information for a field is not present in the snippets, do not include that field in your output.
    `.trim();
    
    const fullContentForExtraction = extractionPrompt + '\n\n--- SEARCH SNIPPETS START ---\n\n' + combinedSnippets + '\n\n--- SEARCH SNIPPETS END ---';
    
    try {
      if (onAgentProgress) {
        onAgentProgress(`Using AI to extract ${fields.map(f => f.name).join(', ')} from search snippets...`, 'info');
      }
      
      // Use OpenAI to extract structured data
      const stringContextForOpenAI: Record<string, string> = { // Ensure context for OpenAI is string-based
          emailDomain: emailContext.domain,
          companyDomainGuess: emailContext.companyDomain || "Unknown",
          companyNameGuess: emailContext.companyNameGuess || "Unknown",
      };
      
      const enrichmentResults = await this.openai.extractStructuredDataOriginal(
        fullContentForExtraction, // Use the content with the new prompt
        fields,
        stringContextForOpenAI
      );
      
      const foundFields = Object.keys(enrichmentResults).filter(k => enrichmentResults[k]?.value);
      if (onAgentProgress && foundFields.length > 0) {
        onAgentProgress(`Successfully extracted ${foundFields.length} fields from search snippets`, 'success');
      }
      
      // Add sources from the searchResults (which are adapted from OpenAI search)
      for (const [, enrichment] of Object.entries(enrichmentResults)) {
        if (enrichment && enrichment.value) {
          enrichment.source = searchResults.slice(0, 2).map(r => r.url).join(', ');
          enrichment.sourceContext = searchResults.slice(0, 2).map(r => ({
            url: r.url,
            snippet: r.markdown || r.title || '' // Use snippet (markdown) or title from search result
          }));
        }
      }
      
      return enrichmentResults;
    } catch (error) {
      console.error('[AGENT-DISCOVERY] Failed to extract from search results:', error);
      return {};
    }
  }
  
  private inferFromDomain(
    emailContext: EmailContext,
    fields: EnrichmentField[]
  ): Record<string, unknown> {
    console.log('[AGENT-DISCOVERY] Using domain-based inference as last resort');
    const results: Record<string, unknown> = {};
    
    if (!emailContext.companyDomain) {
      return results;
    }
    
    // Extract domain parts
    const domainParts = emailContext.companyDomain.split('.');
    const primaryDomain = domainParts[0].toLowerCase();
    
    // Known company mappings
    const knownCompanies: Record<string, string> = {
      'onetrust': 'OneTrust',
      'sideguide': 'Sideguide',
      'frontapp': 'Front',
      'shippo': 'Shippo',
      'lattice': 'Lattice',
      'pilot': 'Pilot',
      'fundera': 'Fundera',
      'flexport': 'Flexport',
      'triplebyte': 'Triplebyte',
      'zola': 'Zola',
      'pinterest': 'Pinterest',
      'brex': 'Brex',
      'deel': 'Deel',
      'scale': 'Scale AI',
      'wiz': 'Wiz',
      'firecrawl': 'Firecrawl',
    };
    
    // Get proper company name
    const cleanedName = knownCompanies[primaryDomain] || 
      primaryDomain
        .replace(/-/g, ' ')
        .replace(/_/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    
    // Try to infer fields based on domain
    for (const field of fields) {
      const fieldName = field.name.toLowerCase();
      
      if (fieldName.includes('company') && fieldName.includes('name')) {
        // Use cleaned domain name as company name
        results[field.name] = {
          field: field.name,
          value: cleanedName,
          confidence: 0.3, // Low confidence
          source: 'Inferred from domain',
          sourceContext: [{
            url: `https://${emailContext.companyDomain}`,
            snippet: `Inferred from email domain: ${emailContext.companyDomain}`
          }]
        };
      } else if (fieldName.includes('website')) {
        // Use domain as website
        results[field.name] = {
          field: field.name,
          value: `https://${emailContext.companyDomain}`,
          confidence: 0.7, // Higher confidence for website
          source: 'Inferred from domain',
          sourceContext: [{
            url: `https://${emailContext.companyDomain}`,
            snippet: `Primary domain from email address`
          }]
        };
      } else if (fieldName.includes('description')) {
        // Generic description based on domain
        results[field.name] = {
          field: field.name,
          value: `${cleanedName} is a company that operates the ${emailContext.companyDomain} domain.`,
          confidence: 0.2, // Very low confidence
          source: 'Inferred from domain',
          sourceContext: [{
            url: `https://${emailContext.companyDomain}`,
            snippet: `No company description found - generic inference from domain`
          }]
        };
      }
    }
    
    console.log(`[AGENT-DISCOVERY] Inferred ${Object.keys(results).length} fields from domain`);
    return results;
  }
  
  // Renamed from trimSearchResultsContent to be more generic for string arrays
  private trimContentArray(
    contentArray: string[],
    maxTotalChars: number = 300000
  ): string {
    // First, calculate total content size
    let totalSize = contentArray.reduce((sum, str) => sum + str.length, 0);
    
    // If under limit, return as is
    if (totalSize <= maxTotalChars) {
      return contentArray.join('\n\n---\n\n');
    }
    
    // Otherwise, trim proportionally
    console.log(`[ORCHESTRATOR] Content array size ${totalSize} exceeds limit ${maxTotalChars}, trimming...`);
    
    // Ensure positive length for division, default to a safe value if array is empty
    const numItems = contentArray.length > 0 ? contentArray.length : 1;
    const charsPerResult = Math.max(500, Math.floor(maxTotalChars / numItems)); // Snippets are shorter
    
    return contentArray
      .map((content) => {
        return content.length > charsPerResult
          ? content.substring(0, charsPerResult) + '\n[... content trimmed ...]'
          : content;
      })
      .join('\n\n---\n\n');
  }
}