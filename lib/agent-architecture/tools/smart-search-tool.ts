import { z } from 'zod';
// import FirecrawlApp from '@mendable/firecrawl-js'; // Removed Firecrawl
import { OpenAIService } from '@/lib/services/openai'; // Added OpenAIService

export type SearchType = 'discovery' | 'business' | 'news' | 'technical' | 'metrics';

interface SearchContext {
  companyName?: string;
  companyDomain?: string;
  industry?: string;
  location?: string;
}

// Interface for the raw result from OpenAI
interface OpenAIResult {
  url: string;
  title: string;
  snippet: string;
}

// Interface for processed results, adapted from the old SearchResult/ProcessedResult
interface ProcessedResult {
  url: string;
  title?: string;
  snippet?: string; // Changed from markdown/content
  relevance: number;
  domain: string;
}

export function createSmartSearchTool(
  openaiService: OpenAIService, // Added OpenAIService
  searchType: SearchType,
  onProgress?: (message: string, type: 'info' | 'success' | 'warning' | 'agent') => void
) {
  // const firecrawl = new FirecrawlApp({ apiKey: firecrawlApiKey }); // Removed Firecrawl instantiation
  
  return {
    name: `search_${searchType}`, // Name can remain, implementation changes
    description: `Smart search for ${searchType} information using OpenAI to find relevant web pages and snippets.`,
    parameters: z.object({
      queries: z.array(z.string()).describe('Search queries to try (usually 1-2 is sufficient)'),
      targetField: z.string().describe('The specific information or field we are trying to find/enrich'),
      context: z.object({
        companyName: z.string().optional(),
        companyDomain: z.string().optional(),
        industry: z.string().optional(),
        location: z.string().optional(),
      }).optional().describe('Context to enhance search queries and relevance scoring'),
    }),
    
    async execute({ queries, targetField, context }: { queries: string[]; targetField: string; context?: SearchContext }) {
      const allResults: ProcessedResult[] = [];
      const searchLimit = searchType === 'discovery' ? 3 : 5;

      for (const query of queries) {
        try {
          const enhancedQuery = enhanceQuery(query, searchType, context);
          
          console.log(`🤖 Querying OpenAI for search: "${enhancedQuery}" (Target: ${targetField})`);
          if (onProgress) {
            onProgress(`Querying OpenAI for: ${enhancedQuery.substring(0, 60)}... (Target: ${targetField})`, 'info');
          }

          const prompt = `
System: You are an AI assistant that performs web searches and provides summarized results.
User: Perform a web search for the query: "${enhancedQuery}".
I am trying to find information about "${targetField}".
Context: ${JSON.stringify(context || {})}.
Please return the top ${searchLimit} most relevant results.
For each result, provide:
- url (string, full valid URL, ensure it's not a Google search results page or similar)
- title (string, concise and relevant to the content)
- snippet (string, 1-3 sentences summarizing the content's relevance to the query and context, tailored to "${targetField}")
Format the response as a valid JSON array of objects: [{ "url": "...", "title": "...", "snippet": "..." }, ...].
Ensure URLs are complete and valid (e.g., "https://example.com/page").
Only include results directly relevant to the query, context, and specifically "${targetField}".
If you cannot find relevant results, return an empty array [].
Do not include any explanatory text outside of the JSON array itself.
`;
          const openaiResponse = await openaiService.client.chat.completions.create({
            model: 'gpt-4o', // Or another capable model
            messages: [{ role: 'system', content: 'You are an AI assistant that performs web searches and provides summarized results formatted as JSON.' },{ role: 'user', content: prompt }],
            // response_format: { type: 'json_object' }, // Not directly an array, so parse manually
            temperature: 0.2, // Lower temperature for more factual/deterministic output
          });

          const responseContent = openaiResponse.choices[0]?.message?.content;

          if (!responseContent) {
            throw new Error('OpenAI returned an empty response.');
          }
          
          // Extract JSON array from the response content
          let parsedResults: OpenAIResult[] = [];
          try {
            // Attempt to find JSON array within potentially larger string
            const jsonMatch = responseContent.match(/(\[[\s\S]*\])/);
            if (jsonMatch && jsonMatch[1]) {
              parsedResults = JSON.parse(jsonMatch[1]);
            } else {
              // Fallback if no array brackets, try parsing the whole thing (less robust)
              parsedResults = JSON.parse(responseContent);
            }
            if (!Array.isArray(parsedResults)) {
                // If it parsed but isn't an array, wrap it in an array if it's a single object result
                if (typeof parsedResults === 'object' && parsedResults !== null && 'url' in parsedResults) {
                    parsedResults = [parsedResults as OpenAIResult];
                } else {
                    console.warn('OpenAI response was not a JSON array as expected:', parsedResults);
                    parsedResults = []; // Default to empty if not an array
                }
            }
          } catch (e) {
            console.error('Failed to parse OpenAI search results as JSON:', e, '\nResponse was:\n', responseContent);
            if (onProgress) {
              onProgress(`Error parsing OpenAI response for query: ${enhancedQuery}`, 'warning');
            }
            continue; // Skip to next query
          }

          if (onProgress) {
            onProgress(`Processing ${parsedResults.length} results from OpenAI for query: ${enhancedQuery}`, 'info');
          }

          for (const result of parsedResults) {
            if (!result || !result.url || typeof result.url !== 'string' || !result.url.startsWith('http')) {
                console.warn('Skipping invalid result from OpenAI:', result);
                continue;
            }

            const relevance = calculateRelevance({
              url: result.url,
              title: result.title,
              snippet: result.snippet
            }, targetField, context, searchType);

            allResults.push({
              url: result.url,
              title: result.title || 'No title provided',
              snippet: result.snippet || 'No snippet provided',
              relevance,
              domain: new URL(result.url).hostname.replace(/^www\./, ''),
            });
          }
        } catch (error) {
          console.error(`OpenAI search failed for query: "${query}" (Enhanced: "${enhanceQuery(query, searchType, context)}")`, error);
          if (onProgress) {
            onProgress(`OpenAI search failed for query "${query.substring(0,60)}...": ${error instanceof Error ? error.message : String(error)}`, 'warning');
          }
        }
      }
      
      // Sort by relevance, deduplicate by domain, and limit results
      const uniqueResults = deduplicateByDomain(allResults) // Deduplicate first
        .sort((a, b) => b.relevance - a.relevance) // Then sort
        .slice(0, 10); // Then slice
      
      if (onProgress) {
        onProgress(`Ranked and deduplicated ${uniqueResults.length} results. Top result: ${uniqueResults[0]?.url || 'None'} (Relevance: ${uniqueResults[0]?.relevance.toFixed(2) || 'N/A'})`, 'success');
      }
      
      return uniqueResults;
    },
  };
}

function enhanceQuery(query: string, searchType: SearchType, context?: SearchContext): string {
  let enhanced = query;
  
  // Add year for time-sensitive searches
  if (searchType === 'metrics' || searchType === 'news') {
    const year = new Date().getFullYear();
    if (!query.includes(year.toString())) {
      enhanced += ` ${year}`;
    }
  }
  
  // Add location context if available and relevant
  if (context?.location && (searchType === 'business' || searchType === 'discovery')) {
    enhanced += ` ${context.location}`;
  }
  
  // Add industry context for technical or business searches
  if (context?.industry && (searchType === 'technical' || searchType === 'business')) {
    enhanced += ` ${context.industry}`;
  }
  
  if (context?.companyName && !enhanced.toLowerCase().includes(context.companyName.toLowerCase())) {
    enhanced = `${context.companyName} ${enhanced}`;
  }

  return enhanced.trim();
}

// Updated calculateRelevance to use snippet
function calculateRelevance(
  result: { url: string; title?: string; snippet?: string },
  targetField: string,
  context: SearchContext | undefined,
  searchType: SearchType
): number {
  let score = 0.5; // Base score for any result returned by OpenAI (implies some initial relevance)
  
  const url = result.url.toLowerCase();
  const domain = new URL(result.url).hostname.toLowerCase().replace(/^www\./, '');
  const snippetText = (result.title + ' ' + (result.snippet || '')).toLowerCase();
  
  // Boost for company's own domain (if context is provided)
  if (context?.companyDomain && domain.includes(context.companyDomain.toLowerCase().replace(/^www\./, ''))) {
    score += 0.3;
  }

  // Boost if targetField keywords are in snippet or title
  const targetKeywords = targetField.toLowerCase().split(/\s+/).filter(kw => kw.length > 2);
  if (targetKeywords.some(kw => snippetText.includes(kw))) {
    score += 0.15;
  }
  
  // Boost for trusted sources based on search type
  const trustedSources: Partial<Record<SearchType, string[]>> = {
    discovery: ['about', 'company', 'who-we-are', 'team', 'mission'], // For company's own site
    business: ['crunchbase.com', 'pitchbook.com', 'zoominfo.com', 'dnb.com', 'owler.com', 'apollo.io'],
    news: ['techcrunch.com', 'forbes.com', 'reuters.com', 'bloomberg.com', 'wsj.com', 'nytimes.com', 'businessinsider.com', 'venturebeat.com'],
    technical: ['github.com', 'stackoverflow.com', 'producthunt.com', 'g2.com', 'capterra.com', 'docs.', 'developer.'], // Also check for subdomains
    metrics: ['linkedin.com/company', 'glassdoor.com', 'comparably.com', 'indeed.com', 'builtin.com', 'owler.com/company'],
  };
  
  const relevantSources = trustedSources[searchType] || [];
  if (relevantSources.some(source => domain.includes(source) || url.includes(source))) {
    score += 0.15;
  }
  
  // Boost for recent content (check if snippet or title contains recent year)
  // This is more relevant for news/metrics
  if (searchType === 'news' || searchType === 'metrics') {
    const currentYear = new Date().getFullYear();
    const recentYears = [currentYear, currentYear - 1, currentYear - 2]; // Look back 2 years
    if (recentYears.some(year => snippetText.includes(year.toString()))) {
      score += 0.1;
    }
  }
  
  // Penalty for certain generic domains if not explicitly a trusted source type for them
  const genericDomains = ['wikipedia.org', 'youtube.com', 'facebook.com', 'twitter.com', 'instagram.com', 'reddit.com'];
  if (genericDomains.some(gd => domain.includes(gd) && !relevantSources.some(rs => gd.includes(rs)) ) ) {
    score -= 0.2;
  }

  // Penalty if URL is very long (often indicative of spam or overly specific, less authoritative pages)
  if (result.url.length > 150) {
    score -= 0.05;
  }
  
  // Ensure score is within bounds [0, 1]
  return Math.max(0.01, Math.min(1, score)); // Ensure a minimal score if OpenAI returned it.
}

function deduplicateByDomain(results: ProcessedResult[]): ProcessedResult[] {
  const seen = new Map<string, ProcessedResult>();
  results.forEach(result => {
    const domain = result.domain; // Already www. stripped
    const existing = seen.get(domain);
    if (!existing || result.relevance > existing.relevance) {
      seen.set(domain, result);
    }
  });
  return Array.from(seen.values());
}