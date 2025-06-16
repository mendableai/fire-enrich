import { Agent, Tool } from '@openai/agents';
import { z } from 'zod';
import { createSmartSearchTool } from '../tools/smart-search-tool';
import { OpenAIService } from '@/lib/services/openai';

const FundingResult = z.object({
  fundingStage: z.enum([
    'Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C', 'Series D', 'Series E+',
    'IPO', 'Acquired', 'Bootstrapped', 'Unknown'
  ]).describe('Latest funding stage'),
  lastFundingAmount: z.string().optional().describe('Amount raised in last round (e.g., "$10M")'),
  lastFundingDate: z.string().optional().describe('Date of last funding round (YYYY-MM-DD or YYYY-MM or YYYY)'),
  totalRaised: z.string().optional().describe('Total funding raised to date (e.g., "$50M")'),
  valuation: z.string().optional().describe('Company valuation if available (e.g., "$500M")'),
  investors: z.array(z.string()).optional().describe('List of notable investors'),
  acquirer: z.string().optional().describe('Acquiring company if acquired'),
  confidence: z.record(z.string(), z.number()).describe('Confidence scores for each field (0-1)'),
  sources: z.record(z.string(), z.array(z.string().url())).describe('Source URLs for each field'),
});

export function createFundingAgent(openaiService: OpenAIService) { // Changed firecrawlApiKey to openaiService
  return new Agent({
    name: 'Funding Agent',
    
    instructions: `You are the Funding Agent - specialist in investment and funding data.
    
    You receive company information from previous agents.
    
    YOUR MISSION:
    1. Funding Stage - Latest round (Seed, Series A/B/C, etc., IPO, Acquired, Bootstrapped, Unknown).
    2. Last Funding Amount - Amount raised in the last known round (e.g., "$10M").
    3. Last Funding Date - Date of the last funding round (prefer YYYY-MM-DD, YYYY-MM, or YYYY).
    4. Total Raised - Total known funding raised to date (e.g., "$50M").
    5. Valuation - Company valuation if publicly available (e.g., "$500M").
    6. Investors - List of notable or lead investors.
    7. Acquirer - Name of the acquiring company if the target company was acquired.
    
    SEARCH STRATEGIES:
    - Use 'search_news' for recent announcements: "{companyName} funding announcement {currentYear}", "{companyName} Series A/B/C funding".
    - Use 'search_business' for profiles on sites like Crunchbase, Pitchbook: "{companyName} Crunchbase profile", "{companyName} funding".
    - Specifically look for articles from TechCrunch, Forbes, Reuters, Bloomberg, etc.
    - For acquisitions: "{companyName} acquired by", "{acquirer} acquires {companyName}".
    - For IPOs: "{companyName} IPO date", "{companyName} stock symbol".
    
    SPECIAL CASES:
    - Bootstrapped: If no external funding rounds are found after thorough search, mark as "Bootstrapped".
    - Acquired: If acquired, prioritize finding the acquirer name and acquisition date/amount if possible.
    - Public (IPO): Note IPO date. Valuation might be market cap.
    
    DATA VALIDATION:
    - Amounts must include currency (usually USD, e.g., "$10M", "€5M").
    - Verify if amounts are in millions (M) or billions (B).
    - Dates should be as specific as possible (YYYY-MM-DD > YYYY-MM > YYYY).
    - Only include well-known or lead investors. Avoid listing many minor investors.
    
    IMPORTANT: Focus on recent and verified information. Old funding rounds are less relevant unless they are the latest known.
    Prioritize official announcements and reputable financial news sources or databases.`,
    
    tools: [
      createSmartSearchTool(openaiService, 'news') as unknown as Tool<unknown>, // Added openaiService
      createSmartSearchTool(openaiService, 'business') as unknown as Tool<unknown>, // Added openaiService
    ],
    
    outputType: FundingResult,
  });
}