import { Agent, Tool } from '@openai/agents';
import { z } from 'zod';
import { createWebsiteScraperTool } from '../tools/website-scraper-tool';
import { createSmartSearchTool } from '../tools/smart-search-tool';
import { OpenAIService } from '@/lib/services/openai'; // Added OpenAIService

const ProfileResult = z.object({
  industry: z.string().describe('Primary industry or sector'),
  headquarters: z.string().describe('Headquarters location (City, State/Country)'),
  yearFounded: z.number().min(1800).max(new Date().getFullYear()).describe('Year the company was founded'),
  companyType: z.enum(['Public', 'Private', 'Subsidiary', 'Non-profit', 'Unknown']).describe('Type of company'),
  employeeSize: z.string().optional().describe('Estimated employee size or range (e.g., "50-100", "1000+")'), // Added
  confidence: z.record(z.string(), z.number()).describe('Confidence scores for each field (0-1)'), // Updated description
  sources: z.record(z.string(), z.array(z.string().url())).describe('Source URLs for each field'), // Updated to ensure URLs
});

export function createCompanyProfileAgent(openaiService: OpenAIService) { // Changed firecrawlApiKey to openaiService
  console.log('[AGENT-PROFILE] Creating Company Profile Agent with OpenAI service');
  
  return new Agent({
    name: 'Company Profile Agent',
    
    instructions: `You are the Company Profile Agent - specialist in company background and characteristics.
    
    You receive company name and website from the Discovery Agent.
    
    YOUR MISSION:
    1. Industry/Sector - Use standard categories (e.g., SaaS, Fintech, Healthcare, E-commerce, etc.)
    2. Headquarters - City, State/Country format (e.g., "San Francisco, CA", "London, UK")
    3. Year Founded - Must be a reasonable year (e.g., 1800-current year).
    4. Company Type - Public, Private, Subsidiary, Non-profit, or Unknown.
    5. Employee Size - Estimated number of employees (e.g., "1-10", "50-100", "1000+", "Unknown").
    
    SEARCH STRATEGIES:
    1. Prioritize the company's official website (About Us, Company, Our Team, Careers pages). Use the 'process_website_content' tool.
    2. Use 'search_business' for general company information, headquarters, founding year, and company type. Example query: "{companyName} company profile".
    3. For Employee Size, look for phrases like "X employees", "team of X", "our people". Check LinkedIn profiles via 'search_metrics' (e.g., "{companyName} LinkedIn profile employee count") or business data sites via 'search_business'.
    4. Look for press releases, official announcements, or news articles for all fields.
    
    VALIDATION RULES:
    - Industry: Use properly capitalized, recognized categories.
    - Location: Must be a real place with proper capitalization.
    - Year: Must be between 1800 and the current year.
    - Employee Size: Provide a range or estimate if an exact number isn't available (e.g., "50-200", "5000+"). If completely unknown after thorough search, use "Unknown".
    - Company names: Use official capitalization (e.g., "OneTrust" not "onetrust").
    - Confidence: For each field, provide a confidence score between 0 (very uncertain) and 1 (very certain).
    - Sources: For each field, list the URL(s) where the information was found. Prefer primary sources (company website, official filings) over secondary ones.
    
    IMPORTANT: Build on the Discovery Agent's findings. Focus on extracting and validating these specific profile details.
    Do not hallucinate. If information cannot be found or verified for a field, it's better to indicate lower confidence or leave optional fields blank (like employeeSize if truly unfindable, or use "Unknown").`,
    
    tools: [
      createWebsiteScraperTool() as unknown as Tool<unknown>, // Removed firecrawlApiKey
      createSmartSearchTool(openaiService, 'business') as unknown as Tool<unknown>, // Added openaiService
      createSmartSearchTool(openaiService, 'metrics') as unknown as Tool<unknown>, // Added metrics search for employee size
    ],
    
    outputType: ProfileResult,
  });
}