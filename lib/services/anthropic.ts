import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { EnrichmentField, EnrichmentResult } from '../types';

export class AnthropicService {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string = 'claude-3-5-sonnet-20241022') {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async extractStructuredData(
    content: string,
    fields: EnrichmentField[],
    context: Record<string, string>
  ): Promise<Record<string, EnrichmentResult>> {
    try {
      const fieldDescriptions = fields
        .map(f => `- ${f.name}: ${f.description}`)
        .join('\n');

      const contextInfo = Object.entries(context)
        .map(([key, value]) => {
          if (key === 'targetDomain' && value) {
            return `Company Domain: ${value} (if you see content from this domain, it's likely the target company)`;
          }
          if (key === 'name' || key === '_parsed_name') {
            return `Person Name: ${value}`;
          }
          return `${key}: ${value}`;
        })
        .filter(line => !line.includes('undefined'))
        .join('\n');

      const MAX_CONTENT_CHARS = 180000; // Claude has smaller context window
      
      let trimmedContent = content;
      if (content.length > MAX_CONTENT_CHARS) {
        console.log(`[ANTHROPIC] Content too long (${content.length} chars), trimming to ${MAX_CONTENT_CHARS} chars`);
        trimmedContent = content.substring(0, MAX_CONTENT_CHARS) + '\n\n[Content truncated due to length...]';
      }

      const systemPrompt = `You are an expert data extractor. Extract the requested information from the provided content with high accuracy.

**CRITICAL RULE**: You MUST ONLY extract information that is EXPLICITLY STATED in the provided content. DO NOT make up, guess, or infer any values.

TARGET ENTITY: ${contextInfo}

Fields to extract:
${fieldDescriptions}

Return the results as a JSON object with this exact structure:
{
  "fieldName": {
    "value": "extracted_value_or_null",
    "confidence": 0.95,
    "sources": ["url1", "url2"]
  }
}`;

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4000,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: trimmedContent
          }
        ]
      });

      const messageContent = response.content[0];
      if (messageContent.type !== 'text') {
        throw new Error('Invalid response format from Anthropic');
      }

      // Extract JSON from response
      const jsonMatch = messageContent.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in Anthropic response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Transform to EnrichmentResult format
      const results: Record<string, EnrichmentResult> = {};
      
      fields.forEach(field => {
        const fieldData = parsed[field.name];
        if (fieldData && fieldData.value !== null && fieldData.confidence > 0.3) {
          results[field.name] = {
            field: field.name,
            value: fieldData.value,
            confidence: fieldData.confidence,
            source: Array.isArray(fieldData.sources) ? fieldData.sources.join(', ') : 'anthropic_extraction',
          };
        }
      });

      return results;
    } catch (error) {
      console.error('Anthropic extraction error:', error);
      throw new Error('Failed to extract structured data with Anthropic');
    }
  }

  async generateSearchQueries(
    context: Record<string, string>,
    targetField: string,
    existingQueries: string[] = []
  ): Promise<string[]> {
    try {
      const systemPrompt = `Generate 3-5 targeted search queries to find information about "${targetField}" for the given context. Make queries specific and effective for web search.`;

      const contextInfo = Object.entries(context)
        .filter(([_, value]) => value && !value.includes('undefined'))
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1000,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Context:\n${contextInfo}\n\nTarget field: ${targetField}\n\nExisting queries to avoid duplicating:\n${existingQueries.join('\n')}\n\nGenerate search queries as a JSON array of strings.`
          }
        ]
      });

      const messageContent = response.content[0];
      if (messageContent.type !== 'text') {
        throw new Error('Invalid response format');
      }

      const jsonMatch = messageContent.text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('No JSON array found in response');
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.error('Anthropic query generation error:', error);
      return [];
    }
  }
} 