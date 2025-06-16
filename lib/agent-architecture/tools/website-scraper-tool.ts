import { z } from 'zod';
// import FirecrawlApp from '@mendable/firecrawl-js'; // Removed Firecrawl

interface ScrapeResult {
  success: boolean;
  markdown?: string;
  html?: string;
  metadata?: Record<string, unknown>; // Ensure this can hold { sourceURL: string } or { originalUrl: string }
}

export function createWebsiteScraperTool(onProgress?: (message: string, type: 'info' | 'success' | 'warning' | 'agent') => void) {
  // const firecrawl = new FirecrawlApp({ apiKey: firecrawlApiKey }); // Removed Firecrawl instantiation
  
  return {
    name: 'process_website_content', // Renamed tool to reflect new functionality
    description: 'Process pre-fetched website content for information', // Updated description
    parameters: z.object({
      url: z.string().url().describe('Original URL of the content (for context and metadata)'),
      content: z.string().describe('Pre-fetched content of the website'),
      targetFields: z.array(z.string()).describe('Fields we are looking for'),
      // Selectors might be less relevant if content is pre-processed (e.g. markdown)
      // but kept for potential future use or if HTML content is passed.
      selectors: z.object({
        about: z.array(z.string()).optional(),
        contact: z.array(z.string()).optional(),
        team: z.array(z.string()).optional(),
      }).optional().describe('CSS selectors to focus on specific sections (if HTML is processed)'),
    }),
    
    async execute({ url, content, targetFields, selectors }: { url: string; content: string; targetFields: string[]; selectors?: { about?: string[]; contact?: string[]; team?: string[] } }) {
      try {
        console.log(`📄 Processing content for: ${url}`);
        if (onProgress) {
          onProgress(`Processing content for ${url} (${content.length} chars)`, 'info');
        }

        // Create a mock ScrapeResult object from the input content
        const mockScrapeResult: ScrapeResult = {
          success: true,
          markdown: content, // The new content parameter
          html: '', // HTML might not be available or relevant with pre-fetched markdown
          metadata: { sourceURL: url } // Store the original URL in metadata
        };
        
        // Extract structured data from the content
        const extractedData: Record<string, unknown> = {};
        if (onProgress) {
          onProgress(`Extracting ${targetFields.length} fields from content...`, 'info');
        }
        
        // Try to extract company name from various sources
        if (targetFields.includes('Company Name') || targetFields.includes('companyName')) {
          extractedData.companyName = extractCompanyName(mockScrapeResult);
        }
        
        // Extract description
        if (targetFields.includes('Company Description') || targetFields.includes('description')) {
          extractedData.description = extractDescription(mockScrapeResult);
        }
        
        // Extract location/headquarters
        if (targetFields.includes('Location') || targetFields.includes('headquarters')) {
          extractedData.location = extractLocation(mockScrapeResult);
        }
        
        // Extract industry
        if (targetFields.includes('Industry') || targetFields.includes('industry')) {
          extractedData.industry = extractIndustry(mockScrapeResult);
        }
        
        const extractedCount = Object.keys(extractedData).length;
        if (onProgress && extractedCount > 0) {
          onProgress(`Successfully extracted ${extractedCount} fields from content for ${url}`, 'success');
        } else if (onProgress) {
          onProgress(`No targeted fields found in content for ${url}`, 'info');
        }
        
        return {
          url,
          extractedData,
          rawContent: content.substring(0, 5000), // Use input content for rawContent
          metadata: mockScrapeResult.metadata, // Use metadata from mockScrapeResult
        };
      } catch (error) {
        console.error(`Failed to process content for ${url}:`, error);
        if (onProgress) {
          onProgress(`Failed to process content for ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`, 'warning');
        }
        return {
          url,
          error: error instanceof Error ? error.message : 'Unknown error',
          extractedData: {},
          rawContent: content.substring(0, 200), // Provide a snippet on error too
          metadata: { sourceURL: url }
        };
      }
    },
  };
}

function extractCompanyName(result: ScrapeResult): string | null {
  const markdown = result.markdown || '';
  const metadata = result.metadata || {}; // Contains sourceURL now
  
  // Try metadata.title (if available, not guaranteed by this tool's input)
  // or sourceURL as a fallback for context if needed in future.
  // For now, we primarily rely on markdown content.

  // If 'title' was part of a richer metadata object passed along with content, it could be used.
  // Example: if (metadata.title && typeof metadata.title === 'string') { ... }

  // Look for h1 headers
  const h1Match = markdown.match(/^#\s+([^#\n]+)/m);
  if (h1Match) {
    const h1Text = h1Match[1].trim();
    if (h1Text.length > 2 && h1Text.length < 100) {
      // Avoid returning generic titles like "Blog" or "About Us" if they are the H1
      if (!/^(blog|about us|contact us|terms of service|privacy policy)$/i.test(h1Text)) {
         return h1Text;
      }
    }
  }
  
  // Look for "About [Company]" patterns
  const aboutMatch = markdown.match(/About\s+([A-Z][A-Za-z0-9\s&.'-]+?)(?:\s*[\n|,.])/);
  if (aboutMatch) {
    return aboutMatch[1].trim();
  }

  // Try to get company name from the URL if nothing else is found
  if (metadata.sourceURL && typeof metadata.sourceURL === 'string') {
    try {
      const urlObj = new URL(metadata.sourceURL as string);
      let hostname = urlObj.hostname;
      // Remove www. and common TLDs
      hostname = hostname.replace(/^www\./, '');
      hostname = hostname.substring(0, hostname.lastIndexOf('.')); // Naive TLD removal
      // Capitalize and replace hyphens
      const potentialName = hostname.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
      if (potentialName && potentialName.length > 2 && potentialName.length < 50) {
        return potentialName;
      }
    } catch (e) {
      // Invalid URL, ignore
    }
  }
  
  return null;
}

function extractDescription(result: ScrapeResult): string | null {
  const markdown = result.markdown || '';
  // const metadata = result.metadata || {}; // metadata.description might not be available

  // if (metadata.description && typeof metadata.description === 'string' && metadata.description.length > 20) {
  //   return metadata.description as string;
  // }
  
  // Look for mission/about sections
  const patterns = [
    /(?:Our\s+)?(?:Mission|Vision|About|Who\s+We\s+Are)[\s:]+([^\n]+(?:\n[^\n]+){0,2})/i,
    /We\s+(?:are|help|provide|build|create)\s+([^\n]+(?:\n[^\n]+){0,2})/i,
    /^([A-Z][^.!?]+(?:help|provide|build|create|enable|empower)[^.!?]+[.!?])/m,
  ];
  
  for (const pattern of patterns) {
    const match = markdown.match(pattern);
    if (match) {
      const desc = match[1].trim()
        .replace(/\n+/g, ' ')
        .replace(/\s+/g, ' ');
      
      if (desc.length > 30 && desc.length < 500) {
        return desc;
      }
    }
  }
  
  // Fall back to first substantive paragraph
  const paragraphs = markdown.split(/\n\n+/).filter((p) => p.length > 50);
  if (paragraphs.length > 0) {
    return paragraphs[0].substring(0, 300).trim();
  }
  
  return null;
}

function extractLocation(result: ScrapeResult): string | null {
  const markdown = result.markdown || '';
  
  // Location patterns
  const patterns = [
    /(?:Headquarters|HQ|Based\s+in|Located\s+in)[\s:]+([A-Za-z\s,]+?)(?:\n|$)/i,
    /(?:Address|Office)[\s:]+([A-Za-z0-9\s,.-]+?)(?:\n|$)/i,
    /([A-Z][a-z]+(?:,\s*[A-Z]{2})?)\s*(?:USA|United\s+States|U\.S\.|US)/,
    /([A-Z][a-z]+,\s*[A-Z][a-z]+)/, // City, Country
  ];
  
  for (const pattern of patterns) {
    const match = markdown.match(pattern);
    if (match) {
      const location = match[1].trim();
      // Validate it looks like a location
      if (location.length > 3 && location.length < 100 && /[A-Za-z]/.test(location)) {
        return location;
      }
    }
  }
  
  return null;
}

function extractIndustry(result: ScrapeResult): string | null {
  const markdown = result.markdown || '';
  const content = markdown.toLowerCase();
  
  // Industry keywords mapping
  const industries = {
    'SaaS': ['saas', 'software as a service', 'cloud platform', 'subscription software'],
    'Fintech': ['fintech', 'financial technology', 'payments', 'banking technology'],
    'Healthcare': ['healthcare', 'medical', 'healthtech', 'digital health'],
    'E-commerce': ['ecommerce', 'e-commerce', 'online retail', 'marketplace'],
    'EdTech': ['edtech', 'education technology', 'learning platform', 'online education'],
    'AI/ML': ['artificial intelligence', 'machine learning', 'ai platform', 'ml platform'],
    'Cybersecurity': ['cybersecurity', 'security platform', 'data protection', 'infosec'],
    'MarTech': ['martech', 'marketing technology', 'marketing platform', 'advertising tech'],
    'InsurTech': ['insurtech', 'insurance technology', 'digital insurance'],
    'Real Estate': ['proptech', 'real estate', 'property technology'],
  };
  
  // Count keyword matches
  const matches: Record<string, number> = {};
  
  for (const [industry, keywords] of Object.entries(industries)) {
    let count = 0;
    for (const keyword of keywords) {
      if (content.includes(keyword)) {
        count++;
      }
    }
    if (count > 0) {
      matches[industry] = count;
    }
  }
  
  // Return the industry with most matches
  const sorted = Object.entries(matches).sort((a, b) => b[1] - a[1]);
  if (sorted.length > 0) {
    return sorted[0][0];
  }
  
  // Look for explicit industry mentions
  const industryMatch = markdown.match(/(?:Industry|Sector)[\s:]+([A-Za-z\s&-]+?)(?:\n|,|\.|$)/i);
  if (industryMatch) {
    return industryMatch[1].trim();
  }
  
  return null;
}