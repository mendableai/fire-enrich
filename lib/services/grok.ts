import OpenAI from 'openai';
import { z } from 'zod';
import type { EnrichmentField, EnrichmentResult } from '../types';

export class GrokService {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = 'grok-3-mini') {
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.x.ai/v1',
    });
    this.model = model;
  }

  createEnrichmentSchema(fields: EnrichmentField[]) {
    const schemaProperties: Record<string, z.ZodTypeAny> = {};

    fields.forEach(field => {
      let fieldSchema: z.ZodTypeAny;
      
      switch (field.type) {
        case 'string':
          fieldSchema = z.string();
          break;
        case 'number':
          fieldSchema = z.number();
          break;
        case 'boolean':
          fieldSchema = z.boolean();
          break;
        case 'array':
          fieldSchema = z.array(z.string());
          break;
        default:
          fieldSchema = z.string();
      }

      if (!field.required) {
        fieldSchema = fieldSchema.nullable();
      }

      schemaProperties[field.name] = fieldSchema;
    });

    // Add confidence scores and source evidence for each field
    const confidenceProperties: Record<string, z.ZodTypeAny> = {};
    const sourceEvidenceProperties: Record<string, z.ZodTypeAny> = {};
    fields.forEach(field => {
      confidenceProperties[`${field.name}_confidence`] = z.number().min(0).max(1);
      sourceEvidenceProperties[`${field.name}_sources`] = z.array(z.object({
        url: z.string(),
        quote: z.string()
      })).nullable();
    });

    return z.object({
      ...schemaProperties,
      ...confidenceProperties,
      ...sourceEvidenceProperties,
    });
  }

  async extractStructuredData(
    content: string,
    fields: EnrichmentField[],
    context: Record<string, string>
  ): Promise<Record<string, EnrichmentResult>> {
    try {
      const schema = this.createEnrichmentSchema(fields);
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

      // Grok has good context window but be conservative
      const MAX_CONTENT_CHARS = 250000;
      
      let trimmedContent = content;
      if (content.length > MAX_CONTENT_CHARS) {
        console.log(`[GROK] Content too long (${content.length} chars), trimming to ${MAX_CONTENT_CHARS} chars`);
        trimmedContent = content.substring(0, MAX_CONTENT_CHARS) + '\n\n[Content truncated due to length...]';
      }

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You are an expert data extractor with a witty edge. Extract the requested information from the provided content with high accuracy.

**CRITICAL RULE**: You MUST ONLY extract information that is EXPLICITLY STATED in the provided content. DO NOT make up, guess, or infer any values. If the information is not clearly present in the text, you MUST return null.

**TARGET ENTITY**: ${contextInfo}

For each field, you must provide:
1. The extracted value (or null if not found)
2. A confidence score between 0 and 1
3. A sources array with url and quote for each source

Fields to extract:
${fieldDescriptions}

**IMPORTANT**: You MUST respond with a valid JSON object only. No additional text or explanation.

Example JSON structure:
{
  "fieldName": "extracted value or null",
  "fieldName_confidence": 0.8,
  "fieldName_sources": [{"url": "source_url", "quote": "relevant quote"}]
}`,
          },
          {
            role: 'user',
            content: trimmedContent,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1, // Low temperature for consistent extraction
      });

      const messageContent = response.choices[0].message.content;
      if (!messageContent) {
        throw new Error('No response content from Grok');
      }
      
      const parsed = JSON.parse(messageContent);

      // Transform to EnrichmentResult format
      const results: Record<string, EnrichmentResult> = {};
      
      fields.forEach(field => {
        let value = parsed[field.name];
        let confidence = parsed[`${field.name}_confidence`] as number;
        const sourcesWithQuotes = parsed[`${field.name}_sources`] as Array<{url: string, quote: string}> | null;
        
        // Filter out invalid placeholder values
        if (value === '/' || value === '-' || value === 'N/A' || value === 'n/a') {
          value = null;
        }
        
        // Only include results with actual data found
        if (value !== null && value !== undefined && confidence > 0.3) {
          results[field.name] = {
            field: field.name,
            value,
            confidence,
            source: sourcesWithQuotes ? sourcesWithQuotes.map(s => s.url).join(', ') : 'grok_extraction',
            sourceContext: sourcesWithQuotes ? sourcesWithQuotes.map(s => ({
              url: s.url,
              snippet: s.quote
            })) : undefined,
          };
        }
      });

      return results;
    } catch (error) {
      console.error('Grok extraction error:', error);
      throw new Error('Failed to extract structured data with Grok');
    }
  }

  async generateSearchQueries(
    context: Record<string, string>,
    targetField: string,
    existingQueries: string[] = []
  ): Promise<string[]> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'Generate 3-5 targeted search queries to find specific information. Make queries specific and effective for web search. Be clever about it.'
          },
          {
            role: 'user',
            content: `Context: ${JSON.stringify(context)}
Target field: ${targetField}
Existing queries to avoid: ${existingQueries.join(', ')}

Generate search queries as a JSON array of strings.`
          }
        ],
        temperature: 0.3,
      });

      const content = response.choices[0].message.content;
      if (!content) return [];

      // Extract JSON array from response
      const jsonMatch = content.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return [];
    } catch (error) {
      console.error('Grok query generation error:', error);
      return [];
    }
  }
} 