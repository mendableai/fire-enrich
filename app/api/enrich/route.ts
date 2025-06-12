import { NextRequest, NextResponse } from 'next/server';
import { AgentEnrichmentStrategy } from '@/lib/strategies/agent-enrichment-strategy';
import type { EnrichmentRequest, RowEnrichmentResult } from '@/lib/types';
import { loadSkipList, shouldSkipEmail, getSkipReason } from '@/lib/utils/skip-list';

// Use Node.js runtime for better compatibility
export const runtime = 'nodejs';

// Store active sessions in memory (in production, use Redis or similar)
const activeSessions = new Map<string, AbortController>();

export async function POST(request: NextRequest) {
  try {
    // Add request body size check
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 5 * 1024 * 1024) { // 5MB limit
      return NextResponse.json(
        { error: 'Request body too large' },
        { status: 413 }
      );
    }

    const body: EnrichmentRequest = await request.json();
    const { rows, fields, emailColumn, nameColumn, llmProvider = 'openai', llmModel } = body;

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { error: 'No rows provided' },
        { status: 400 }
      );
    }

    if (!fields || fields.length === 0 || fields.length > 10) {
      return NextResponse.json(
        { error: 'Please provide 1-10 fields to enrich' },
        { status: 400 }
      );
    }

    if (!emailColumn) {
      return NextResponse.json(
        { error: 'Email column is required' },
        { status: 400 }
      );
    }

    // Use a more compatible UUID generation
    const sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const abortController = new AbortController();
    activeSessions.set(sessionId, abortController);

    // Check environment variables and headers for API keys
    const firecrawlApiKey = process.env.FIRECRAWL_API_KEY || request.headers.get('X-Firecrawl-API-Key');
    
    // Get the appropriate LLM API key based on provider
    const llmApiKeys = {
      openai: process.env.OPENAI_API_KEY || request.headers.get('X-OpenAI-API-Key'),
      anthropic: process.env.ANTHROPIC_API_KEY || request.headers.get('X-Anthropic-API-Key'),
      deepseek: process.env.DEEPSEEK_API_KEY || request.headers.get('X-DeepSeek-API-Key'),
      grok: process.env.GROK_API_KEY || request.headers.get('X-Grok-API-Key'),
    };
    
    const selectedLlmApiKey = llmApiKeys[llmProvider];
    
    if (!selectedLlmApiKey || !firecrawlApiKey) {
      console.error('Missing API keys:', { 
        provider: llmProvider,
        hasLLM: !!selectedLlmApiKey, 
        hasFirecrawl: !!firecrawlApiKey 
      });
      return NextResponse.json(
        { error: `Server configuration error: Missing ${llmProvider.toUpperCase()} or Firecrawl API key` },
        { status: 500 }
      );
    }

    // Always use the advanced agent architecture
    const strategyName = 'AgentEnrichmentStrategy';
    
    console.log(`[STRATEGY] Using ${strategyName} with ${llmProvider.toUpperCase()} - Advanced multi-agent architecture with specialized agents`);
    const enrichmentStrategy = new AgentEnrichmentStrategy(
      selectedLlmApiKey,
      firecrawlApiKey,
      llmProvider,
      llmModel
    );

    // Load skip list
    const skipList = await loadSkipList();

    // Create a streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send session ID
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'session', sessionId })}\n\n`
            )
          );

          for (let i = 0; i < rows.length; i++) {
            // Check if cancelled
            if (abortController.signal.aborted) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'cancelled' })}\n\n`
                )
              );
              break;
            }

            const row = rows[i];
            const email = row[emailColumn];
            
            // Add name to row context if nameColumn is provided
            if (nameColumn && row[nameColumn]) {
              row._name = row[nameColumn];
            }
            
            // Check if email should be skipped
            if (email && shouldSkipEmail(email, skipList)) {
              const skipReason = getSkipReason(email, skipList);
              
              // Send skip result
              const skipResult: RowEnrichmentResult = {
                rowIndex: i,
                originalData: row,
                enrichments: {},
                status: 'skipped',
                error: skipReason,
              };
              
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'result',
                    result: skipResult,
                  })}\n\n`
                )
              );
              
              continue; // Skip to next row
            }
            
            // Send processing status
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'processing',
                  rowIndex: i,
                  totalRows: rows.length,
                })}\n\n`
              )
            );

            try {
              // Enrich the row
              console.log(`[ENRICHMENT] Processing row ${i + 1}/${rows.length} - Email: ${email} - Strategy: ${strategyName}`);
              const startTime = Date.now();
              
              // Agent strategies return RowEnrichmentResult
              const result = await enrichmentStrategy.enrichRow(
                row,
                fields,
                emailColumn,
                undefined, // onProgress
                (message: string, type: 'info' | 'success' | 'warning' | 'agent') => {
                  // Stream agent progress messages
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        type: 'agent_progress',
                        rowIndex: i,
                        message,
                        messageType: type,
                      })}\n\n`
                    )
                  );
                }
              );
              result.rowIndex = i; // Set the correct row index
              
              const duration = Date.now() - startTime;
              console.log(`[ENRICHMENT] Completed row ${i + 1} in ${duration}ms - Fields enriched: ${Object.keys(result.enrichments).length}`);
              
              // Log which fields were successfully enriched
              const enrichedFields = Object.entries(result.enrichments)
                .filter(([, enrichment]) => enrichment.value)
                .map(([fieldName, enrichment]) => `${fieldName}: ${enrichment.value ? '✓' : '✗'}`)
                .join(', ');
              if (enrichedFields) {
                console.log(`[ENRICHMENT] Fields: ${enrichedFields}`);
              }

              // Send result
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'result',
                    result,
                  })}\n\n`
                )
              );
            } catch (error) {
              // Send error for this row
              const errorResult: RowEnrichmentResult = {
                rowIndex: i,
                originalData: row,
                enrichments: {},
                status: 'error',
                error: error instanceof Error ? error.message : 'Unknown error',
              };

              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'result',
                    result: errorResult,
                  })}\n\n`
                )
              );
            }

            // Small delay between rows to prevent rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

          // Send completion
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'complete' })}\n\n`
            )
          );
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'error',
                error: error instanceof Error ? error.message : 'Unknown error',
              })}\n\n`
            )
          );
        } finally {
          activeSessions.delete(sessionId);
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Failed to start enrichment:', error);
    return NextResponse.json(
      { 
        error: 'Failed to start enrichment',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// Cancel endpoint
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json(
      { error: 'Session ID required' },
      { status: 400 }
    );
  }

  const controller = activeSessions.get(sessionId);
  if (controller) {
    controller.abort();
    activeSessions.delete(sessionId);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json(
    { error: 'Session not found' },
    { status: 404 }
  );
}