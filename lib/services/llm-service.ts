import { OpenAIService } from './openai';
import { AnthropicService } from './anthropic';
import { DeepSeekService } from './deepseek';
import { GrokService } from './grok';
import type { EnrichmentField, EnrichmentResult } from '../types';

export type LLMProvider = 'openai' | 'anthropic' | 'deepseek' | 'grok';

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model?: string; // Optional model override
}

export class LLMService {
  private openaiService?: OpenAIService;
  private anthropicService?: AnthropicService;
  private deepseekService?: DeepSeekService;
  private grokService?: GrokService;
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
    
    switch (config.provider) {
      case 'openai':
        this.openaiService = new OpenAIService(config.apiKey, config.model);
        break;
      case 'anthropic':
        this.anthropicService = new AnthropicService(config.apiKey, config.model);
        break;
      case 'deepseek':
        this.deepseekService = new DeepSeekService(config.apiKey, config.model);
        break;
      case 'grok':
        this.grokService = new GrokService(config.apiKey, config.model);
        break;
      default:
        throw new Error(`Unsupported LLM provider: ${config.provider}`);
    }
  }

  async extractStructuredData(
    content: string,
    fields: EnrichmentField[],
    context: Record<string, string>
  ): Promise<Record<string, EnrichmentResult>> {
    switch (this.config.provider) {
      case 'openai':
        if (!this.openaiService) throw new Error('OpenAI service not initialized');
        return this.openaiService.extractStructuredDataWithCorroboration(content, fields, context);
      
      case 'anthropic':
        if (!this.anthropicService) throw new Error('Anthropic service not initialized');
        return this.anthropicService.extractStructuredData(content, fields, context);
      
      case 'deepseek':
        if (!this.deepseekService) throw new Error('DeepSeek service not initialized');
        return this.deepseekService.extractStructuredData(content, fields, context);
      
      case 'grok':
        if (!this.grokService) throw new Error('Grok service not initialized');
        return this.grokService.extractStructuredData(content, fields, context);
      
      default:
        throw new Error(`Unsupported provider: ${this.config.provider}`);
    }
  }

  async generateSearchQueries(
    context: Record<string, string>,
    targetField: string,
    existingQueries: string[] = []
  ): Promise<string[]> {
    switch (this.config.provider) {
      case 'openai':
        if (!this.openaiService) throw new Error('OpenAI service not initialized');
        return this.openaiService.generateSearchQueries(context, targetField, existingQueries);
      
      case 'anthropic':
        if (!this.anthropicService) throw new Error('Anthropic service not initialized');
        return this.anthropicService.generateSearchQueries(context, targetField, existingQueries);
      
      case 'deepseek':
        if (!this.deepseekService) throw new Error('DeepSeek service not initialized');
        return this.deepseekService.generateSearchQueries(context, targetField, existingQueries);
      
      case 'grok':
        if (!this.grokService) throw new Error('Grok service not initialized');
        return this.grokService.generateSearchQueries(context, targetField, existingQueries);
      
      default:
        throw new Error(`Unsupported provider: ${this.config.provider}`);
    }
  }

  getProviderInfo(): { provider: LLMProvider; model?: string } {
    return {
      provider: this.config.provider,
      model: this.config.model
    };
  }
}

// Factory function for easy instantiation
export function createLLMService(options: {
  openaiApiKey?: string;
  anthropicApiKey?: string;
  deepseekApiKey?: string;
  grokApiKey?: string;
  preferredProvider?: LLMProvider;
  model?: string;
}): LLMService {
  const { 
    openaiApiKey, 
    anthropicApiKey, 
    deepseekApiKey, 
    grokApiKey, 
    preferredProvider = 'openai', 
    model 
  } = options;

  // Auto-detect provider based on available keys and preference
  let provider: LLMProvider;
  let apiKey: string;

  if (preferredProvider === 'deepseek' && deepseekApiKey) {
    provider = 'deepseek';
    apiKey = deepseekApiKey;
  } else if (preferredProvider === 'grok' && grokApiKey) {
    provider = 'grok';
    apiKey = grokApiKey;
  } else if (preferredProvider === 'anthropic' && anthropicApiKey) {
    provider = 'anthropic';
    apiKey = anthropicApiKey;
  } else if (preferredProvider === 'openai' && openaiApiKey) {
    provider = 'openai';
    apiKey = openaiApiKey;
  } else if (openaiApiKey) {
    provider = 'openai';
    apiKey = openaiApiKey;
  } else if (anthropicApiKey) {
    provider = 'anthropic';
    apiKey = anthropicApiKey;
  } else if (deepseekApiKey) {
    provider = 'deepseek';
    apiKey = deepseekApiKey;
  } else if (grokApiKey) {
    provider = 'grok';
    apiKey = grokApiKey;
  } else {
    throw new Error('No valid API key provided for any LLM provider');
  }

  return new LLMService({ provider, apiKey, model });
} 