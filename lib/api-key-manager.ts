/**
 * Centralized API Key Management Utility
 * Handles storage, retrieval, and validation of API keys
 */

export interface ApiKeys {
  firecrawl?: string;
  openai?: string;
  anthropic?: string;
  deepseek?: string;
  grok?: string;
}

export interface ApiKeyStatus {
  firecrawl: boolean;
  openai: boolean;
  anthropic: boolean;
  deepseek: boolean;
  grok: boolean;
}

/**
 * Get all API keys from localStorage
 */
export function getStoredApiKeys(): ApiKeys {
  if (typeof window === 'undefined') return {};
  
  return {
    firecrawl: localStorage.getItem('firecrawl_api_key') || undefined,
    openai: localStorage.getItem('openai_api_key') || undefined,
    anthropic: localStorage.getItem('anthropic_api_key') || undefined,
    deepseek: localStorage.getItem('deepseek_api_key') || undefined,
    grok: localStorage.getItem('grok_api_key') || undefined,
  };
}

/**
 * Save API keys to localStorage
 */
export function saveApiKeys(keys: ApiKeys): void {
  if (typeof window === 'undefined') return;
  
  Object.entries(keys).forEach(([provider, key]) => {
    if (key && key.trim()) {
      localStorage.setItem(`${provider}_api_key`, key.trim());
    }
  });
}

/**
 * Check which API keys are available (either in env or localStorage)
 */
export async function getApiKeyStatus(): Promise<ApiKeyStatus> {
  try {
    // Check environment variables
    const response = await fetch('/api/check-env');
    if (!response.ok) {
      throw new Error('Failed to check environment');
    }
    
    const data = await response.json();
    const envStatus = data.environmentStatus;
    
    // Check localStorage
    const storedKeys = getStoredApiKeys();
    
    return {
      firecrawl: envStatus.FIRECRAWL_API_KEY || !!storedKeys.firecrawl,
      openai: envStatus.OPENAI_API_KEY || !!storedKeys.openai,
      anthropic: envStatus.ANTHROPIC_API_KEY || !!storedKeys.anthropic,
      deepseek: envStatus.DEEPSEEK_API_KEY || !!storedKeys.deepseek,
      grok: envStatus.GROK_API_KEY || !!storedKeys.grok,
    };
  } catch (error) {
    console.error('Error checking API key status:', error);
    // Fallback to localStorage only
    const storedKeys = getStoredApiKeys();
    return {
      firecrawl: !!storedKeys.firecrawl,
      openai: !!storedKeys.openai,
      anthropic: !!storedKeys.anthropic,
      deepseek: !!storedKeys.deepseek,
      grok: !!storedKeys.grok,
    };
  }
}

/**
 * Validate a Firecrawl API key by making a test request
 */
export async function validateFirecrawlApiKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch('/api/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Firecrawl-API-Key': apiKey,
      },
      body: JSON.stringify({ url: 'https://firecrawl.dev' }), // Use a more reliable test URL
    });
    
    return response.ok;
  } catch (error) {
    console.error('Error validating Firecrawl API key:', error);
    return false;
  }
}

/**
 * Get API key headers for requests
 */
export function getApiKeyHeaders(): Record<string, string> {
  const storedKeys = getStoredApiKeys();
  const headers: Record<string, string> = {};
  
  if (storedKeys.firecrawl) {
    headers['X-Firecrawl-API-Key'] = storedKeys.firecrawl;
  }
  if (storedKeys.openai) {
    headers['X-OpenAI-API-Key'] = storedKeys.openai;
  }
  if (storedKeys.anthropic) {
    headers['X-Anthropic-API-Key'] = storedKeys.anthropic;
  }
  if (storedKeys.deepseek) {
    headers['X-DeepSeek-API-Key'] = storedKeys.deepseek;
  }
  if (storedKeys.grok) {
    headers['X-Grok-API-Key'] = storedKeys.grok;
  }
  
  return headers;
}

/**
 * Check if required API keys are available for basic functionality
 */
export async function hasRequiredApiKeys(): Promise<boolean> {
  const status = await getApiKeyStatus();
  return status.firecrawl && status.openai;
}

/**
 * Get missing required API keys
 */
export async function getMissingRequiredKeys(): Promise<string[]> {
  const status = await getApiKeyStatus();
  const missing: string[] = [];
  
  if (!status.firecrawl) missing.push('firecrawl');
  if (!status.openai) missing.push('openai');
  
  return missing;
}

/**
 * Clear all stored API keys
 */
export function clearStoredApiKeys(): void {
  if (typeof window === 'undefined') return;

  const providers = ['firecrawl', 'openai', 'anthropic', 'deepseek', 'grok'];
  providers.forEach(provider => {
    localStorage.removeItem(`${provider}_api_key`);
  });

  // Also clear LLM selection to reset to defaults
  localStorage.removeItem('selected_llm_provider');
  localStorage.removeItem('selected_llm_model');
}

/**
 * Get a summary of stored API keys (for user feedback)
 */
export function getApiKeySummary(): { total: number; providers: string[] } {
  const keys = getStoredApiKeys();
  const providers = Object.entries(keys)
    .filter(([_, key]) => key && key.trim())
    .map(([provider, _]) => provider);

  return {
    total: providers.length,
    providers
  };
}
