import { Agent, Tool } from '@openai/agents';
import { z } from 'zod';
import { createWebsiteScraperTool } from '../tools/website-scraper-tool';
import { createSmartSearchTool } from '../tools/smart-search-tool';
import { OpenAIService } from '@/lib/services/openai';

const MetricsResult = z.object({
  // Note: employeeCount was moved to CompanyProfileAgent. This agent focuses on other metrics.
  revenue: z.string().optional().describe('Annual revenue (e.g., "$10M", "$100M ARR")'),
  growthRate: z.string().optional().describe('Growth rate if available (e.g., "YoY 50%", "Revenue grew by X% last year")'),
  marketShare: z.string().optional().describe('Market share if available (e.g., "10% of X market")'),
  customerCount: z.string().optional().describe('Number of customers (e.g., "1000+ customers", "5 million users")'),
  isEstimate: z.record(z.string(), z.boolean()).describe('Whether each metric is an estimate (true) or confirmed (false)'),
  confidence: z.record(z.string(), z.number()).describe('Confidence scores for each field (0-1)'),
  sources: z.record(z.string(), z.array(z.string().url())).describe('Source URLs for each field'),
});

export function createMetricsAgent(openaiService: OpenAIService) { // Changed firecrawlApiKey to openaiService
  return new Agent({
    name: 'Metrics Agent',
    
    instructions: `You are the Metrics Agent - expert in company performance and financial metrics.
    
    You receive company information from previous agents. Employee size is handled by Company Profile Agent.
    
    YOUR TARGETS:
    1. Revenue - Annual revenue, preferably with currency and type (e.g., "$10M ARR", "¥5B annual revenue").
    2. Growth Rate - Year-over-year (YoY) growth or other relevant growth indicators.
    3. Market Share - If available, the company's share in its primary market.
    4. Customer Count - Number of customers, users, or subscribers.
    
    SEARCH STRATEGIES:
    - Use 'search_metrics' for specific metrics: "{companyName} annual revenue {currentYear}", "{companyName} customer count".
    - Use 'search_news' for announcements: "{companyName} financial results", "{companyName} annual report".
    - Check company website ('process_website_content'), especially "Investor Relations", "About Us", or blog posts for press releases.
    - Look for funding announcements or interviews with executives, as they often mention key metrics.
    - Consult industry reports or reputable business databases if general searches are insufficient.
    
    ESTIMATION GUIDELINES:
    - If exact data is unavailable, provide reasonable estimates if possible, clearly marking them as such in 'isEstimate'.
    - For revenue, try to find if it's Annual Recurring Revenue (ARR) for SaaS businesses.
    - Be cautious with self-reported numbers if they seem unusually high; try to verify from multiple sources if possible.
    
    FORMATTING:
    - Revenue: Include currency symbol and common suffixes (K, M, B). Specify if it's ARR.
    - Growth Rate: Specify the period (e.g., "YoY", "QoQ") if known.
    - Customer Count: Use ranges if exact numbers vary (e.g., "10,000-50,000 customers").
    - For each metric, set 'isEstimate' to true if the number is an estimation, false if it's confirmed or directly reported.

    IMPORTANT: Prioritize recent and verifiable data. Clearly distinguish between estimated and confirmed figures.`,
    
    tools: [
      createWebsiteScraperTool() as unknown as Tool<unknown>, // Removed firecrawlApiKey
      createSmartSearchTool(openaiService, 'metrics') as unknown as Tool<unknown>, // Added openaiService
      createSmartSearchTool(openaiService, 'news') as unknown as Tool<unknown>, // Added news search for financial reports
    ],
    
    outputType: MetricsResult,
  });
}