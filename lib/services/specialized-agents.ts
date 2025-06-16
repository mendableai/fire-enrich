import { Agent, tool } from '@openai/agents';
import { z } from 'zod';
// import FirecrawlApp from '@mendable/firecrawl-js'; // Removed
import { OpenAIService } from './openai'; // Added
import type { EnrichmentField } from '../types';

// Interface for the expected search result structure from OpenAI
interface OpenAISearchResult {
  url: string;
  title: string;
  snippet: string; // This will replace 'content' from Firecrawl
}

// Specialized search tool that each agent will use, now with OpenAIService
const createSpecializedSearchTool = (openaiService: OpenAIService) => tool({
  name: 'openai_search', // Renamed to reflect the change
  description: 'Search with domain-specific queries using OpenAI',
  parameters: z.object({
    queries: z.array(z.string()).describe('Multiple search queries to try'),
    // scrapeContent is no longer directly applicable as OpenAI returns snippets.
    // If full page content is needed, a separate scrape/process tool would be required.
    // We can ask OpenAI for more detailed snippets if needed via the prompt.
    targetInfo: z.string().optional().describe('Brief description of the target information to help focus the search snippets.'),
  }),
  async execute({ queries, targetInfo }) {
    const allResults: OpenAISearchResult[] = [];
    const searchLimit = 3; // How many results per query

    for (const query of queries) {
      try {
        const prompt = `
System: You are an AI assistant that performs web searches and provides summarized results.
User: Perform a web search for the query: "${query}".
${targetInfo ? `The user is specifically looking for information related to: "${targetInfo}". Please tailor snippets accordingly.` : ''}
Please return the top ${searchLimit} most relevant results.
For each result, provide:
- url (string, full valid URL)
- title (string, concise and relevant)
- snippet (string, 1-3 sentences summarizing relevance to the query ${targetInfo ? `and target info: "${targetInfo}"` : ''})
Format the response as a valid JSON array of objects: [{ "url": "...", "title": "...", "snippet": "..." }, ...].
Ensure URLs are complete and valid. Only include results directly relevant.
If you cannot find relevant results, return an empty array [].
Do not include any explanatory text outside of the JSON array itself.`;

        const openaiResponse = await openaiService.client.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'system', content: 'You perform web searches and return JSON formatted results.' },{ role: 'user', content: prompt }],
          temperature: 0.1,
        });

        const responseContent = openaiResponse.choices[0]?.message?.content;
        if (responseContent) {
          let parsedQueryResults: OpenAISearchResult[] = [];
          try {
            const jsonMatch = responseContent.match(/(\[[\s\S]*\])/);
            if (jsonMatch && jsonMatch[1]) {
              parsedQueryResults = JSON.parse(jsonMatch[1]);
            } else {
              parsedQueryResults = JSON.parse(responseContent);
            }
             if (!Array.isArray(parsedQueryResults)) {
                if (typeof parsedQueryResults === 'object' && parsedQueryResults !== null && 'url' in parsedQueryResults) {
                    parsedQueryResults = [parsedQueryResults as OpenAISearchResult];
                } else {
                    parsedQueryResults = [];
                }
            }
            allResults.push(...parsedQueryResults.filter(r => r.url && r.title && r.snippet));
          } catch (e) {
            console.error(`JSON parsing failed for query "${query}":`, e, "\nResponse:", responseContent);
          }
        }
      } catch (error) {
        console.error(`OpenAI Search failed for query "${query}":`, error);
      }
    }
    
    // Deduplicate by URL
    const uniqueResults = Array.from(
      new Map(allResults.map(r => [r.url, r])).values()
    );
    
    // Adapt to the expected output format for agents (title, url, content)
    return uniqueResults.map(item => ({
      title: item.title || '',
      url: item.url,
      content: item.snippet, // Use snippet as the main content
    }));
  },
});

// Company Information Agent
export function createCompanyAgent(openaiService: OpenAIService) { // Changed firecrawl to openaiService
  return new Agent({
    name: 'Company Research Specialist',
    instructions: `You are an expert at finding company information. You know:
    
    1. How to construct effective search queries for company data
    2. Common patterns in company information (headquarters, employee counts, industries)
    3. How to validate company data for accuracy
    
    When searching for a company:
    - Try multiple query variations using the 'openai_search' tool.
    - Look for official company pages, LinkedIn, Crunchbase, by interpreting search result snippets.
    - Validate employee counts (startups usually < 1000, only large corps > 10000)
    - Normalize industry names to standard categories with their niche
    
    Output structured data with confidence scores for each field. Sources should be URLs from search results.`,
    tools: [createSpecializedSearchTool(openaiService)], // Pass openaiService
    outputType: z.object({
      companyName: z.string().optional().describe("Official company name"),
      website: z.string().url().optional().describe("Primary company website URL"),
      industry: z.string().optional().describe("Primary industry or sector"),
      headquarters: z.string().optional().describe("Headquarters location (City, State/Country)"),
      employeeCount: z.number().int().positive().optional().describe("Estimated number of employees"),
      yearFounded: z.number().min(1800).max(new Date().getFullYear()).optional().describe("Year company was founded"),
      description: z.string().optional().describe("Brief company description"),
      confidence: z.record(z.string(), z.number().min(0).max(1)).describe("Confidence score for each field (0-1)"),
      sources: z.array(z.string().url()).describe("List of source URLs"),
    }),
  });
}

// Fundraising Intelligence Agent
export function createFundraisingAgent(openaiService: OpenAIService) { // Changed firecrawl to openaiService
  return new Agent({
    name: 'Fundraising Intelligence Specialist',
    instructions: `You are an expert at finding funding and investment information. You know:
    
    1. Funding stage progression: Pre-seed → Seed → Series A → B → C → D → E+ → IPO
    2. How to find funding announcements, investor information, valuations
    3. Common funding data sources (Crunchbase, TechCrunch, company announcements)
    
    When searching for funding information using 'openai_search':
    - Search for "[company] funding", "[company] series", "[company] investment"
    - Look for recent funding rounds and total raised from search snippets.
    - Identify lead investors and valuation if available.
    - Normalize funding stages to standard terms.
    
    Be careful with amounts - verify if it's in millions or billions from the snippets.`,
    tools: [createSpecializedSearchTool(openaiService)], // Pass openaiService
    outputType: z.object({
      lastFundingStage: z.enum(['Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C', 'Series D', 'Series E+', 'IPO', 'Unknown']).optional(),
      lastFundingAmount: z.string().optional().describe("Amount of last funding round, e.g., '$10M'"),
      lastFundingDate: z.string().optional().describe("Date of last funding round, e.g., 'YYYY-MM-DD'"),
      totalRaised: z.string().optional().describe("Total funding raised, e.g., '$50M'"),
      valuation: z.string().optional().describe("Company valuation, e.g., '$100M'"),
      leadInvestors: z.array(z.string()).optional().describe("List of lead investors"),
      allInvestors: z.array(z.string()).optional().describe("List of all investors"),
      confidence: z.record(z.string(), z.number().min(0).max(1)).describe("Confidence score for each field (0-1)"),
      sources: z.array(z.string().url()).describe("List of source URLs"),
    }),
  });
}

// People & Leadership Agent
export function createPeopleAgent(openaiService: OpenAIService) { // Changed firecrawl to openaiService
  return new Agent({
    name: 'Executive & People Research Specialist',
    instructions: `You are an expert at finding information about company leadership and key people. You know:
    
    1. Common executive titles (CEO, CTO, CFO, COO, VP, Director)
    2. How to find leadership information (company about pages, LinkedIn, press releases) by analyzing search results.
    3. How to identify founders vs. hired executives.
    
    When searching for people using 'openai_search':
    - Search for "[company] CEO", "[company] leadership team", "[company] founders"
    - Look for LinkedIn profiles when available in search results.
    - Identify both current and founding team members.
    - Extract previous company experience if mentioned in snippets.`,
    tools: [createSpecializedSearchTool(openaiService)], // Pass openaiService
    outputType: z.object({
      ceo: z.object({
        name: z.string(),
        linkedin: z.string().url().optional(),
        previousCompany: z.string().optional(),
      }).optional(),
      founders: z.array(z.object({
        name: z.string(),
        role: z.string().optional(),
        linkedin: z.string().url().optional(),
      })).optional(),
      keyExecutives: z.array(z.object({
        name: z.string(),
        title: z.string(),
        linkedin: z.string().url().optional(),
      })).optional(),
      boardMembers: z.array(z.string()).optional(),
      employeeCount: z.number().int().positive().optional().describe("Estimated number of employees, if found"), // employeeCount is also in CompanyAgent, ensure consistency or decide primary source
      confidence: z.record(z.string(), z.number().min(0).max(1)).describe("Confidence score for each field (0-1)"),
      sources: z.array(z.string().url()).describe("List of source URLs"),
    }),
  });
}

// Product & Technology Agent
export function createProductAgent(openaiService: OpenAIService) { // Changed firecrawl to openaiService
  return new Agent({
    name: 'Product & Technology Research Specialist',
    instructions: `You are an expert at finding product and technology information. You know:
    
    1. How to identify main products and services.
    2. Technology stacks and platforms from search result snippets (e.g., job postings, tech blogs).
    3. Competitive landscape and market positioning.
    
    When searching for product info using 'openai_search':
    - Search for "[company] products", "[company] platform", "[company] technology"
    - Look for product pages, technical blogs, job postings (for tech stack hints in snippets).
    - Identify both B2B and B2C offerings.
    - Find main competitors and differentiators.`,
    tools: [createSpecializedSearchTool(openaiService)], // Pass openaiService
    outputType: z.object({
      mainProducts: z.array(z.string()).optional().describe("List of main products/services"),
      targetMarket: z.enum(['B2B', 'B2C', 'B2B2C', 'Both']).optional().describe("Target market of the company"),
      techStack: z.array(z.string()).optional().describe("Key technologies, languages, frameworks used"),
      competitors: z.array(z.string()).optional().describe("List of main competitors"),
      uniqueSellingPoints: z.array(z.string()).optional().describe("Company's unique selling points"),
      pricingModel: z.string().optional().describe("Brief description of pricing model (e.g., Subscription, Freemium)"),
      confidence: z.record(z.string(), z.number().min(0).max(1)).describe("Confidence score for each field (0-1)"),
      sources: z.array(z.string().url()).describe("List of source URLs"),
    }),
  });
}

// Contact & Social Media Agent
export function createContactAgent(openaiService: OpenAIService) { // Changed firecrawl to openaiService
  return new Agent({
    name: 'Contact Information Specialist',
    instructions: `You are an expert at finding contact and social media information. You know:
    
    1. Where to find official contact information from search snippets.
    2. Social media platform patterns.
    3. How to identify official vs. fan accounts.
    
    When searching for contacts using 'openai_search':
    - Look for official website contact pages or contact details in search snippets.
    - Find verified social media accounts.
    - Extract email patterns if visible in snippets.
    - Get physical addresses for headquarters.`,
    tools: [createSpecializedSearchTool(openaiService)], // Pass openaiService
    outputType: z.object({
      emails: z.array(z.string().email()).optional().describe("List of contact email addresses"),
      phones: z.array(z.string()).optional().describe("List of contact phone numbers"),
      address: z.string().optional().describe("Physical address of headquarters"),
      socialMedia: z.object({
        linkedin: z.string().url().optional().describe("LinkedIn profile URL"),
        twitter: z.string().url().optional().describe("Twitter profile URL"),
        facebook: z.string().url().optional().describe("Facebook page URL"),
        instagram: z.string().url().optional().describe("Instagram profile URL"),
        youtube: z.string().url().optional().describe("YouTube channel URL"),
      }).optional().describe("Links to social media profiles"),
      confidence: z.record(z.string(), z.number().min(0).max(1)).describe("Confidence score for each field (0-1)"),
      sources: z.array(z.string().url()).describe("List of source URLs"),
    }),
  });
}

// Master Enrichment Coordinator that uses specialized agents
export function createEnrichmentCoordinator(
  openaiService: OpenAIService, // Changed firecrawl to openaiService
  fields: EnrichmentField[]
) {
  // Determine which specialized agents to use based on requested fields
  const agents = [];
  const fieldNames = fields.map(f => f.name.toLowerCase());
  const fieldDescriptions = fields.map(f => f.description.toLowerCase()).join(' ');
  
  // Add agents based on requested fields
  if (fieldNames.some(n => n.includes('company') || n.includes('industry') || n.includes('employee')) ||
      fieldDescriptions.includes('company') || fieldDescriptions.includes('industry')) {
    agents.push(createCompanyAgent(openaiService)); // Pass openaiService
  }
  
  if (fieldNames.some(n => n.includes('fund') || n.includes('invest') || n.includes('valuation')) ||
      fieldDescriptions.includes('funding') || fieldDescriptions.includes('investment')) {
    agents.push(createFundraisingAgent(openaiService)); // Pass openaiService
  }
  
  if (fieldNames.some(n => n.includes('ceo') || n.includes('founder') || n.includes('executive')) ||
      fieldDescriptions.includes('leadership') || fieldDescriptions.includes('founder')) {
    agents.push(createPeopleAgent(openaiService)); // Pass openaiService
  }
  
  if (fieldNames.some(n => n.includes('product') || n.includes('service') || n.includes('tech')) ||
      fieldDescriptions.includes('product') || fieldDescriptions.includes('technology')) {
    agents.push(createProductAgent(openaiService)); // Pass openaiService
  }
  
  if (fieldNames.some(n => n.includes('email') || n.includes('phone') || n.includes('social')) ||
      fieldDescriptions.includes('contact') || fieldDescriptions.includes('social')) {
    agents.push(createContactAgent(openaiService)); // Pass openaiService
  }
  
  // If no specific agents matched, use company agent as default
  if (agents.length === 0) {
    agents.push(createCompanyAgent(openaiService)); // Pass openaiService
  }

  return Agent.create({
    name: 'Enrichment Coordinator',
    instructions: `You coordinate specialized agents to gather information based on the requested fields.
    Each agent uses the 'openai_search' tool to find information.
    Requested fields:
    ${fields.map(f => `- ${f.name}: ${f.description}`).join('\n')}
    
    Process:
    1. Parse the provided context (email, company name, etc.)
    2. Delegate to specialized agents based on the requested fields. Each agent will use its search tool.
    3. Compile results from all agents.
    4. Map the agent results to the requested field names.
    5. Return consolidated data with confidence scores and source URLs.
    
    Important: Map the data from agents to match the exact field names requested. Ensure source URLs are included.`,
    handoffs: agents,
    outputType: createDynamicOutputSchema(fields),
  });
}

// Helper function to create dynamic output schema based on requested fields
function createDynamicOutputSchema(fields: EnrichmentField[]) {
  const schemaFields: Record<string, z.ZodTypeAny> = {};
  
  fields.forEach(field => {
    let fieldSchema: z.ZodTypeAny;
    
    switch (field.type) {
      case 'string':
        fieldSchema = z.string();
        break;
      case 'number':
        fieldSchema = z.number();
        break;
      case 'boolean':
        fieldSchema = z.boolean();
        break;
      case 'array':
        fieldSchema = z.array(z.string()); // Assuming array of strings, adjust if other types needed
        break;
      default:
        fieldSchema = z.string(); // Default to string
    }
    
    // Ensure field names are valid for Zod objects (e.g., no spaces, special chars)
    // This might need more robust sanitization if field.name can be arbitrary.
    const safeFieldName = field.name.replace(/[^a-zA-Z0-9_]/g, '_');
    schemaFields[safeFieldName] = field.required ? fieldSchema : fieldSchema.optional();
  });
  
  // Add metadata fields
  // Using fixed names for metadata to avoid collision with dynamic field names.
  schemaFields["_agent_confidence_scores"] = z.record(z.string(), z.number().min(0).max(1)).optional().describe("Confidence scores for each successfully populated field.");
  schemaFields["_agent_source_urls"] = z.record(z.string(), z.array(z.string().url())).optional().describe("Source URLs for the information of each field.");
  
  return z.object(schemaFields);
}

// Service class to use the specialized agents
export class SpecializedAgentService {
  // private firecrawl: FirecrawlApp; // Removed
  // private apiKey: string; // This was presumably OpenAI API key, now handled by OpenAIService
  private openaiService: OpenAIService;

  constructor(openaiService: OpenAIService) { // Changed constructor
    // this.apiKey = apiKey; // Removed
    this.openaiService = openaiService;
    // this.firecrawl = new FirecrawlApp({ apiKey: firecrawlApiKey }); // Removed
  }

  async enrichWithSpecializedAgents(
    context: Record<string, string>, // This context is passed to agent.run as input
    fields: EnrichmentField[]
  ): Promise<Record<string, { value: unknown; confidence: number; sources: string[] }>> {
    // For now, use individual agents based on field patterns
    // TODO: In the future, use coordinator agent with proper handoffs for more complex scenarios.
    // The EnrichmentCoordinator defined above is one way, but direct agent calls are simpler for now.
    const enrichmentResults: Record<string, { value: unknown; confidence: number; sources: string[] }> = {};
    const allAgentOutputs: Record<string, any>[] = []; // Store outputs from all triggered agents

    // Determine which agents to run based on fields
    // This logic is simplified; a more robust mapping might be needed.
    const agentsToRun: Agent[] = [];
    const fieldNamesLower = fields.map(f => f.name.toLowerCase());
    const fieldDescLower = fields.map(f => f.description.toLowerCase()).join(' ');

    if (fieldNamesLower.some(n => n.includes('company') || n.includes('industry') || n.includes('employee') || n.includes('description') || n.includes('website') || n.includes('headquarter') || n.includes('year'))) {
      agentsToRun.push(this.getCompanyAgent());
    }
    if (fieldNamesLower.some(n => n.includes('fund') || n.includes('invest') || n.includes('valuation'))) {
      agentsToRun.push(this.getFundraisingAgent());
    }
    if (fieldNamesLower.some(n => n.includes('ceo') || n.includes('founder') || n.includes('executive') || n.includes('people') || n.includes('board'))) {
      agentsToRun.push(this.getPeopleAgent());
    }
    if (fieldNamesLower.some(n => n.includes('product') || n.includes('service') || n.includes('tech') || n.includes('competitor') || n.includes('pricing'))) {
      agentsToRun.push(this.getProductAgent());
    }
    if (fieldNamesLower.some(n => n.includes('email') || n.includes('phone') || n.includes('social') || n.includes('address'))) {
      agentsToRun.push(this.getContactAgent());
    }
     if (agentsToRun.length === 0 && fields.length > 0) { // If specific fields requested but no agent matched, run CompanyAgent
        agentsToRun.push(this.getCompanyAgent());
    }


    for (const agent of agentsToRun) {
        try {
            console.log(`Running agent: ${agent.name} for context: ${JSON.stringify(context)}`);
            // Construct a prompt for the agent based on the fields it might be ableto provide
            // This is a generic prompt; specific agents might benefit from more tailored prompts if their instruction sets are less dynamic.
            const relevantFieldsForAgent = fields.filter(f => {
                // Simple heuristic: if field name contains common terms related to agent's expertise
                const agentFocus = agent.name.split(' ')[0].toLowerCase(); // e.g., "company", "fundraising"
                return f.name.toLowerCase().includes(agentFocus) || f.description.toLowerCase().includes(agentFocus);
            });
            const fieldDescriptions = relevantFieldsForAgent.map(f => `- ${f.name}: ${f.description}`).join('\n');
            const prompt = `For the company identified by context: ${JSON.stringify(context)}, find the following information:\n${fieldDescriptions}\nIf you cannot find some information, omit it from your response.`;

            const result = await agent.run(prompt, {
              // apiKey: this.apiKey, // apiKey for agent.run is for OpenAI, OpenAIService already has it.
                                     // The @openai/agents library might use an implicit global API key or expect it set in env.
                                     // If OpenAIService's client is used by the tools, this might not be needed here.
                                     // For safety, ensure OPENAI_API_KEY is available in the environment.
            });

            if (result.finalOutput) {
                 allAgentOutputs.push(result.finalOutput as Record<string, unknown>);
            }
        } catch (error) {
            console.error(`Error running agent ${agent.name}:`, error);
        }
    }

    // Consolidate results from all agents
    // This simple merge prefers the last agent's data for overlapping fields.
    // A more sophisticated merge might be needed.
    const consolidatedOutput: Record<string, any> = {};
    for (const output of allAgentOutputs) {
        for (const key in output) {
            if (key !== 'confidence' && key !== 'sources' && output[key] !== undefined && output[key] !== null) {
                consolidatedOutput[key] = output[key];
            }
        }
    }
    // Merge confidence and sources separately
    consolidatedOutput.confidence = {};
    consolidatedOutput.sources = {};
    for (const output of allAgentOutputs) {
        if (output.confidence && typeof output.confidence === 'object') {
            Object.assign(consolidatedOutput.confidence, output.confidence);
        }
        if (output.sources && typeof output.sources === 'object') { // Assuming sources might be objects in raw output
             for(const srcKey in output.sources) {
                if (!consolidatedOutput.sources[srcKey]) consolidatedOutput.sources[srcKey] = [];
                consolidatedOutput.sources[srcKey].push(...(Array.isArray(output.sources[srcKey]) ? output.sources[srcKey] : [output.sources[srcKey]]));
                // Deduplicate sources
                consolidatedOutput.sources[srcKey] = [...new Set(consolidatedOutput.sources[srcKey])];
             }
        } else if (Array.isArray(output.sources)) { // if sources is just an array (less ideal)
            // This case is less ideal as we lose field-specific sources.
            // It's better if agent output schema nests sources under field names or has a structured sources record.
            // For now, let's assume this won't happen with the current agent schemas.
        }
    }
    
    return this.transformAgentResult(consolidatedOutput, fields);
  }

  private transformAgentResult(agentOutput: Record<string, unknown>, fields: EnrichmentField[]) {
    const enrichmentResults: Record<string, { value: unknown; confidence: number; sources: string[] }> = {};
    const outputConfidence = agentOutput.confidence as Record<string, number> || {};
    const outputSources = agentOutput.sources as Record<string, string[]> || {};
    
    fields.forEach(field => {
      // Try to match field.name directly, or with common variations (e.g. companyName vs company_name)
      const potentialKeys = [
        field.name,
        field.name.toLowerCase(),
        field.name.replace(/\s+/g, '').toLowerCase(),
        field.name.replace(/\s+/g, '_').toLowerCase(),
      ];
      let foundValue: any = undefined;
      let foundKey: string | undefined = undefined;

      for (const key of potentialKeys) {
        if (agentOutput[key] !== undefined) {
          foundValue = agentOutput[key];
          foundKey = key; // The key as it exists in agentOutput
          break;
        }
      }
      // Also check if the agent returned a more generic "data" or specific common names for fields
      // This part is heuristic and depends on how consistently agents name their output fields.
      if (foundValue === undefined) {
        if (field.name.toLowerCase().includes('name') && agentOutput.companyName) {
            foundValue = agentOutput.companyName; foundKey = 'companyName';
        } else if (field.name.toLowerCase().includes('employee') && agentOutput.employeeCount) {
            foundValue = agentOutput.employeeCount; foundKey = 'employeeCount';
        } // Add more common mappings if needed
      }


      if (foundValue !== undefined && foundValue !== null) {
        enrichmentResults[field.name] = {
          value: foundValue,
          // Try to get confidence & sources for the specific key found, or the original field name
          confidence: outputConfidence[foundKey || field.name] || outputConfidence[field.name] || 0.7,
          sources: outputSources[foundKey || field.name] || outputSources[field.name] || [],
        };
      } else {
         // If field not found, provide a null value with zero confidence
         enrichmentResults[field.name] = {
          value: null,
          confidence: 0,
          sources: []
        };
      }
    });
    
    return enrichmentResults;
  }

  // Get a specific specialized agent for direct use
  getCompanyAgent() {
    return createCompanyAgent(this.openaiService); // Pass openaiService
  }

  getFundraisingAgent() {
    return createFundraisingAgent(this.openaiService); // Pass openaiService
  }

  getPeopleAgent() {
    return createPeopleAgent(this.openaiService); // Pass openaiService
  }

  getProductAgent() {
    return createProductAgent(this.openaiService); // Pass openaiService
  }

  getContactAgent() {
    return createContactAgent(this.openaiService); // Pass openaiService
  }
}
