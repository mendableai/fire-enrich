/**
 * LLM Provider and Model Management
 */

export interface LLMProvider {
  id: string;
  name: string;
  models: LLMModel[];
  requiresApiKey: boolean;
}

export interface LLMModel {
  id: string;
  name: string;
  description?: string;
}

export const LLM_PROVIDERS: LLMProvider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    requiresApiKey: true,
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Most capable model' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast and efficient' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'High performance' },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    requiresApiKey: true,
    models: [
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'Most capable Claude model' },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', description: 'Fast and efficient' },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    requiresApiKey: true,
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat', description: 'General purpose model' },
      { id: 'deepseek-coder', name: 'DeepSeek Coder', description: 'Optimized for coding' },
    ],
  },
  {
    id: 'grok',
    name: 'Grok (xAI)',
    requiresApiKey: true,
    models: [
      { id: 'grok-3-mini', name: 'Grok 3 Mini', description: 'Fast and efficient' },
      { id: 'grok-beta', name: 'Grok Beta', description: 'Latest experimental model' },
    ],
  },
];

export interface LLMSelection {
  provider: string;
  model: string;
}

/**
 * Get the current LLM selection from localStorage
 */
export function getCurrentLLMSelection(): LLMSelection {
  if (typeof window === 'undefined') {
    return { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' };
  }

  return {
    provider: localStorage.getItem('selected_llm_provider') || 'anthropic',
    model: localStorage.getItem('selected_llm_model') || 'claude-3-5-sonnet-20241022',
  };
}

/**
 * Save LLM selection to localStorage
 */
export function saveLLMSelection(provider: string, model: string): void {
  if (typeof window === 'undefined') return;
  
  localStorage.setItem('selected_llm_provider', provider);
  localStorage.setItem('selected_llm_model', model);
}

/**
 * Get available LLM providers based on available API keys
 */
export function getAvailableProviders(apiKeyStatus: Record<string, boolean>): LLMProvider[] {
  return LLM_PROVIDERS.filter(provider => {
    if (!provider.requiresApiKey) return true;
    return apiKeyStatus[provider.id] === true;
  });
}

/**
 * Get a specific provider by ID
 */
export function getProviderById(id: string): LLMProvider | undefined {
  return LLM_PROVIDERS.find(provider => provider.id === id);
}

/**
 * Get a specific model by provider and model ID
 */
export function getModelById(providerId: string, modelId: string): LLMModel | undefined {
  const provider = getProviderById(providerId);
  return provider?.models.find(model => model.id === modelId);
}

/**
 * Validate if a provider/model combination is valid
 */
export function isValidLLMSelection(provider: string, model: string): boolean {
  const providerObj = getProviderById(provider);
  if (!providerObj) return false;
  
  return providerObj.models.some(m => m.id === model);
}

/**
 * Get the default LLM selection
 */
export function getDefaultLLMSelection(): LLMSelection {
  return { provider: 'grok', model: 'grok-3-mini' };
}

/**
 * Get LLM selection with fallback to default if current selection is invalid
 */
export function getValidLLMSelection(apiKeyStatus: Record<string, boolean>): LLMSelection {
  const current = getCurrentLLMSelection();
  
  // Check if current selection is valid and has API key
  if (isValidLLMSelection(current.provider, current.model) && 
      apiKeyStatus[current.provider]) {
    return current;
  }
  
  // Find first available provider with API key
  const availableProviders = getAvailableProviders(apiKeyStatus);
  if (availableProviders.length > 0) {
    const provider = availableProviders[0];
    const model = provider.models[0];
    return { provider: provider.id, model: model.id };
  }
  
  // Fallback to default
  return getDefaultLLMSelection();
}
