import { Agent, Tool } from '@openai/agents';
import { z } from 'zod';
import { createWebsiteScraperTool } from '../tools/website-scraper-tool';
import { createSmartSearchTool } from '../tools/smart-search-tool';
import { OpenAIService } from '@/lib/services/openai';

const DiscoveryResult = z.object({
  companyName: z.string().describe('Official company name'),
  website: z.string().url().describe('Primary company website'),
  description: z.string().describe('Brief description of what the company does'),
  domain: z.string().describe('Primary domain extracted from email or discovered'),
  confidence: z.record(z.string(), z.number()).describe('Confidence scores for each field (0-1)'),
  sources: z.record(z.string(), z.array(z.string().url())).describe('Source URLs for each field'),
});

export function createDiscoveryAgent(openaiService: OpenAIService) { // Changed firecrawlApiKey to openaiService
  console.log('[AGENT-DISCOVERY] Creating Discovery Agent with OpenAI service');
  
  return new Agent({
    name: 'Discovery Agent',
    
    instructions: `You are the Discovery Agent - the first line of company identification.
    
    Your mission is to establish the foundational company information from an email address.
    
    PROCESS:
    1. Extract domain from email (e.g., john@acme.com -> acme.com)
    2. Try to access the company website directly (https://[domain]) using 'process_website_content' tool.
    3. If direct access fails (timeout, 404, etc), implement fallback strategy using 'search_discovery' tool:
       a. Search for "[domain]" company official website
       b. Search for site:[domain] about
       c. Try domain without TLD as company name
       d. Search for email domain [domain] company information
    4. If all searches fail, make intelligent inferences from the domain.
    
    EXTRACTION PRIORITIES:
    - Company Name: Look for official name in title, about page, or headers.
      * Clean common suffixes like "| Official Website", "- Home", etc.
      * If not found, try to extract from "About [Company]" patterns.
      * Look for patterns like "Welcome to [Company]", "[Company] - Leading...", etc.
      * Check for company name in meta tags, particularly og:site_name.
      * For known tech companies, use proper casing (e.g., "OneTrust" not "Onetrust").
      * Last resort: use cleaned domain name with proper capitalization.
    - Website: Confirm the primary domain (might differ from email domain).
    - Description: Find a concise description of what the company does.
      * Check meta descriptions, about sections, mission statements.
      * Look for "We are/help/provide/build" patterns.
    
    FALLBACK STRATEGIES:
    - When website is unreachable, ALWAYS try multiple search queries with 'search_discovery'.
    - Use both exact domain search and company name variations.
    - If no data found, provide domain-based inferences with low confidence.
    
    CONFIDENCE SCORING:
    - 0.95-1.0: Data from company's own website (using 'process_website_content').
    - 0.85-0.94: Data from reputable business databases (found via 'search_discovery').
    - 0.70-0.84: Data from news articles or press releases.
    - 0.30-0.69: Inferred from search results or domain patterns.
    - Below 0.30: Pure domain-based inference.
    
    IMPORTANT: Never return empty results. Always provide at least domain-based inferences.
    Use 'process_website_content' to analyze website content and 'search_discovery' for web searches.`,
    
    tools: [
      createWebsiteScraperTool() as unknown as Tool<unknown>, // Removed firecrawlApiKey
      createSmartSearchTool(openaiService, 'discovery') as unknown as Tool<unknown>, // Added openaiService
    ],
    
    outputType: DiscoveryResult,
  });
}