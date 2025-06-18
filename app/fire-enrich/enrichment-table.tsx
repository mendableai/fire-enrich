'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { CSVRow, EnrichmentField, RowEnrichmentResult } from '@/lib/types';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { SourceContextTooltip } from './source-context-tooltip';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Download, X, Copy, ExternalLink, Globe, Mail, Check, ChevronDown, ChevronUp, Activity, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { toast } from 'sonner';

interface EnrichmentTableProps {
  rows: CSVRow[];
  fields: EnrichmentField[];
  emailColumn?: string;
}

export function EnrichmentTable({ rows, fields, emailColumn }: EnrichmentTableProps) {
  const [results, setResults] = useState<Map<number, RowEnrichmentResult>>(new Map());
  const [status, setStatus] = useState<'idle' | 'processing' | 'completed' | 'cancelled'>('idle');
  const [currentRow, setCurrentRow] = useState(-1);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [useAgents] = useState(true); // Default to using agents
  const [selectedRow, setSelectedRow] = useState<{
    isOpen: boolean;
    row: CSVRow | null;
    result: RowEnrichmentResult | undefined;
    index: number;
  }>({ isOpen: false, row: null, result: undefined, index: -1 });
  const [copiedRow, setCopiedRow] = useState<number | null>(null);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [showSkipped, setShowSkipped] = useState(false);
  const [agentMessages, setAgentMessages] = useState<Array<{
    message: string;
    type: 'info' | 'success' | 'warning' | 'agent';
    timestamp: number;
    rowIndex?: number;
  }>>([]);
  const agentMessagesEndRef = useRef<HTMLDivElement>(null);
  const activityScrollRef = useRef<HTMLDivElement>(null);

  // Track when each row's data arrives
  const [rowDataArrivalTime, setRowDataArrivalTime] = useState<Map<number, number>>(new Map());
  const [cellsShown, setCellsShown] = useState<Set<string>>(new Set());
  const animationTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup animation timer on unmount
  useEffect(() => {
    const timer = animationTimerRef.current;
    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, []);
  
  // Auto-scroll to bottom when new agent messages arrive
  useEffect(() => {
    if (activityScrollRef.current) {
      activityScrollRef.current.scrollTop = activityScrollRef.current.scrollHeight;
    }
  }, [agentMessages]);

  // Calculate animation delay for each cell
  const getCellAnimationDelay = useCallback((rowIndex: number, fieldIndex: number) => {
    const arrivalTime = rowDataArrivalTime.get(rowIndex);
    if (!arrivalTime) return 0; // No delay if no arrival time
    
    // Reduced animation time for better UX
    const totalRowAnimationTime = 2000; // 2 seconds
    const delayPerCell = Math.min(300, totalRowAnimationTime / fields.length); // Max 300ms per cell
    
    // Add delay based on field position
    return fieldIndex * delayPerCell;
  }, [rowDataArrivalTime, fields.length]);

  const startEnrichment = useCallback(async () => {
    setStatus('processing');
    setAgentMessages([]); // Clear previous messages
    
    try {
      // Get API keys using the new API key manager
      const { getApiKeyHeaders } = await import('@/lib/api-key-manager');
      const { getCurrentLLMSelection } = await import('@/lib/llm-manager');

      const apiKeyHeaders = getApiKeyHeaders();
      const llmSelection = getCurrentLLMSelection();

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(useAgents && { 'x-use-agents': 'true' }),
        ...apiKeyHeaders,
      };

      const response = await fetch('/api/enrich', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          rows,
          fields,
          emailColumn,
          useAgents,
          useV2Architecture: true, // Use new agent architecture when agents are enabled
          llmProvider: llmSelection.provider,
          llmModel: llmSelection.model,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to start enrichment');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));

              switch (data.type) {
                case 'session':
                  setSessionId(data.sessionId);
                  break;
                
                case 'processing':
                  setCurrentRow(data.rowIndex);
                  break;
                
                case 'result':
                  setResults(prev => {
                    const newMap = new Map(prev);
                    newMap.set(data.result.rowIndex, data.result);
                    return newMap;
                  });
                  // Track when this row's data arrived
                  setRowDataArrivalTime(prevTime => {
                    const newMap = new Map(prevTime);
                    newMap.set(data.result.rowIndex, Date.now());
                    return newMap;
                  });
                  
                  // Mark all cells as shown after animation completes
                  setTimeout(() => {
                    const rowCells = fields.map(f => `${data.result.rowIndex}-${f.name}`);
                    setCellsShown(prev => {
                      const newSet = new Set(prev);
                      rowCells.forEach(cell => newSet.add(cell));
                      return newSet;
                    });
                  }, 2500); // Slightly after all animations complete
                  break;
                
                case 'complete':
                  setStatus('completed');
                  // Add a final success message
                  setAgentMessages(prev => [...prev, {
                    message: 'All enrichment tasks completed successfully',
                    type: 'success',
                    timestamp: Date.now()
                  }]);
                  break;
                
                case 'cancelled':
                  setStatus('cancelled');
                  break;
                
                case 'error':
                  console.error('Enrichment error:', data.error);
                  setStatus('completed');
                  break;
                
                case 'agent_progress':
                  setAgentMessages(prev => [...prev, {
                    message: data.message,
                    type: data.messageType,
                    timestamp: Date.now(),
                    rowIndex: data.rowIndex
                  }]);
                  // Keep only last 50 messages
                  setAgentMessages(prev => prev.slice(-50));
                  break;
              }
            } catch {
              // Ignore parsing errors
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to start enrichment:', error);
      setStatus('completed');
    }
  }, [fields, rows, emailColumn, useAgents]);

  useEffect(() => {
    if (status === 'idle') {
      startEnrichment();
    }
  }, [startEnrichment, status]); // Add proper dependencies

  const cancelEnrichment = async () => {
    if (sessionId) {
      try {
        await fetch(`/api/enrich?sessionId=${sessionId}`, {
          method: 'DELETE',
        });
      } catch (error) {
        console.error('Failed to cancel enrichment:', error);
      }
      setStatus('cancelled');
      setCurrentRow(-1);
    }
  };

  const downloadCSV = () => {
    // Build headers
    const headers = [
      emailColumn || 'email',
      ...fields.map(f => f.displayName),
      ...fields.map(f => `${f.displayName}_confidence`),
      ...fields.map(f => `${f.displayName}_source`)
    ];
    
    const csvRows = [headers.map(h => `"${h}"`).join(',')];

    rows.forEach((row, index) => {
      const result = results.get(index);
      const values: string[] = [];
      
      // Add email
      const email = emailColumn ? row[emailColumn] : Object.values(row)[0];
      values.push(`"${email || ''}"`);
      
      // Add field values
      fields.forEach(field => {
        const enrichment = result?.enrichments[field.name];
        const value = enrichment?.value;
        if (value === undefined || value === null) {
          values.push('');
        } else if (Array.isArray(value)) {
          values.push(`"${value.join('; ')}"`);
        } else if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
          values.push(`"${value.replace(/"/g, '""')}"`);
        } else {
          values.push(String(value));
        }
      });
      
      // Add confidence scores
      fields.forEach(field => {
        const enrichment = result?.enrichments[field.name];
        values.push(enrichment?.confidence ? enrichment.confidence.toFixed(2) : '');
      });
      
      // Add sources
      fields.forEach(field => {
        const enrichment = result?.enrichments[field.name];
        if (enrichment?.sourceContext && enrichment.sourceContext.length > 0) {
          const urls = enrichment.sourceContext.map(s => s.url).join('; ');
          values.push(`"${urls}"`);
        } else if (enrichment?.source) {
          values.push(`"${enrichment.source}"`);
        } else {
          values.push('');
        }
      });

      csvRows.push(values.join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `enriched_data_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadJSON = () => {
    const exportData = {
      metadata: {
        exportDate: new Date().toISOString(),
        totalRows: rows.length,
        processedRows: results.size,
        fields: fields.map(f => ({
          name: f.name,
          displayName: f.displayName,
          type: f.type
        })),
        status: status
      },
      data: rows.map((row, index) => {
        const result = results.get(index);
        const email = emailColumn ? row[emailColumn] : Object.values(row)[0];
        
        const enrichedRow: Record<string, unknown> = {
          _index: index,
          _email: email,
          _original: row,
          _status: result ? 'enriched' : 'pending'
        };
        
        if (result) {
          fields.forEach(field => {
            const enrichment = result.enrichments[field.name];
            if (enrichment) {
              enrichedRow[field.name] = {
                value: enrichment.value,
                confidence: enrichment.confidence,
                sources: enrichment.sourceContext?.map(s => s.url) || 
                        (enrichment.source ? enrichment.source.split(', ') : [])
              };
            }
          });
        }
        
        return enrichedRow;
      })
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `enriched_data_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadSkippedEmails = () => {
    // Get all skipped rows
    const skippedRows = rows.filter((_, index) => {
      const result = results.get(index);
      return result?.status === 'skipped';
    });

    if (skippedRows.length === 0) {
      return;
    }

    // Create CSV header
    const headers = Object.keys(skippedRows[0]);
    const csvRows = [headers.join(',')];

    // Add skipped rows with skip reason
    skippedRows.forEach((row, index) => {
      const originalIndex = rows.findIndex(r => r === row);
      const result = results.get(originalIndex);
      const values = headers.map(header => {
        const value = row[header];
        // Escape quotes and wrap in quotes if necessary
        if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value || '';
      });
      
      // Add skip reason as last column
      if (index === 0) {
        csvRows[0] += ',Skip Reason';
      }
      values.push(result?.error || 'Personal email provider');
      
      csvRows.push(values.join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `skipped_emails_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };


  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };


  const copyRowData = (rowIndex: number) => {
    const result = results.get(rowIndex);
    const row = rows[rowIndex];
    if (!result || !row) return;
    
    // Format data nicely for Google Docs
    const emailValue = emailColumn ? row[emailColumn] : '';
    let formattedData = `Email: ${emailValue}\n\n`;
    
    fields.forEach(field => {
      const enrichment = result.enrichments[field.name];
      const value = enrichment?.value;
      
      // Format the field name and value
      formattedData += `${field.displayName}: `;
      
      if (value === undefined || value === null || value === '') {
        formattedData += 'Not found';
      } else if (Array.isArray(value)) {
        formattedData += value.join(', ');
      } else if (typeof value === 'boolean') {
        formattedData += value ? 'Yes' : 'No';
      } else {
        formattedData += String(value);
      }
      
      formattedData += '\n\n';
    });
    
    copyToClipboard(formattedData.trim());
    
    // Show copied feedback
    setCopiedRow(rowIndex);
    toast.success('Row data copied to clipboard!');
    setTimeout(() => setCopiedRow(null), 2000);
  };

  const openDetailSidebar = (rowIndex: number) => {
    const row = rows[rowIndex];
    const result = results.get(rowIndex);
    setSelectedRow({ isOpen: true, row, result, index: rowIndex });
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            {/* Progress indicator */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  status === 'processing' ? 'bg-orange-100 dark:bg-orange-900/20' : 
                  status === 'completed' ? 'bg-green-100 dark:bg-green-900/20' : 
                  'bg-red-100 dark:bg-red-900/20'
                }`}>
                  {status === 'processing' ? (
                    <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                  ) : status === 'completed' ? (
                    <Check className="w-6 h-6 text-green-600 dark:text-green-400" />
                  ) : (
                    <X className="w-6 h-6 text-red-600 dark:text-red-400" />
                  )}
                </div>
              </div>
              
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {status === 'processing' ? 'Enriching Data' : 
                   status === 'completed' ? 'Enrichment Complete' : 
                   'Enrichment Cancelled'}
                </h3>
                <div className="flex flex-col gap-0.5 mt-0.5">
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">
                    {results.size} of {rows.length} rows processed
                  </span>
                  {(() => {
                    const allResults = Array.from(results.values());
                    const skippedResults = allResults.filter(r => r.status === 'skipped');
                    const skippedCount = skippedResults.length;
                    if (skippedCount > 0) {
                      return (
                        <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                          {skippedCount} common email providers skipped (Gmail, Outlook, etc.)
                        </span>
                      );
                    }
                    return null;
                  })()}
                  {status === 'processing' && currentRow >= 0 && (
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">
                      Currently processing row {currentRow + 1}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {(status === 'completed' || status === 'cancelled' || (status === 'processing' && results.size > 0)) && (
              <div className="flex items-center gap-3">
                {(() => {
                  const skippedCount = Array.from(results.values()).filter(r => r.status === 'skipped').length;
                  if (skippedCount > 0) {
                    return (
                      <Button
                        onClick={downloadSkippedEmails}
                        variant="orange"
                        size="sm"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Skipped Emails CSV
                      </Button>
                    );
                  }
                  return null;
                })()}
                <Button
                  onClick={downloadCSV}
                  variant="orange"
                  size="sm"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export CSV
                </Button>
                <Button
                  onClick={downloadJSON}
                  className="bg-black text-white hover:bg-zinc-900 shadow-lg shadow-black/20 dark:shadow-black/40"
                  size="sm"
                >
                  <Download className="w-4 h-4 mr-2" />
                  JSON
                </Button>
              </div>
            )}
            
            {/* Cancel button moved to the end */}
            {status === 'processing' && (
              <Button
                onClick={cancelEnrichment}
                variant="outline"
                size="sm"
                className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:border-red-800 dark:hover:border-red-700 dark:hover:bg-red-950"
              >
                <X className="w-3 h-3 mr-1.5" />
                Cancel
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Agent Progress Messages */}
      {agentMessages.length > 0 && (
        <Card className="p-3 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
          <h4 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
            Agent Activity Log
          </h4>
          <div ref={activityScrollRef} className="space-y-1 max-h-32 overflow-y-auto pr-2 text-xs">
            {agentMessages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-2 py-0.5 ${
                  msg.type === 'agent' ? 'text-orange-600 dark:text-orange-400' :
                  msg.type === 'success' ? 'text-green-600 dark:text-green-400' :
                  msg.type === 'warning' ? 'text-amber-600 dark:text-amber-400' :
                  'text-zinc-600 dark:text-zinc-400'
                }`}
              >
                <span className="flex-shrink-0 mt-0.5">
                  {msg.type === 'agent' ? <Activity className="w-3 h-3" /> :
                   msg.type === 'success' ? <CheckCircle className="w-3 h-3" /> :
                   msg.type === 'warning' ? <AlertCircle className="w-3 h-3" /> :
                   <Info className="w-3 h-3" />}
                </span>
                <span className="flex-1">
                  {msg.rowIndex !== undefined && (
                    <span className="font-medium">Row {msg.rowIndex + 1}: </span>
                  )}
                  {msg.message}
                </span>
              </div>
            ))}
            <div ref={agentMessagesEndRef} />
          </div>
        </Card>
      )}

      <div className="overflow-hidden rounded-lg shadow-sm border border-gray-200">
        <div className="overflow-x-auto bg-white">
          <table className="min-w-full relative">
          <thead>
            <tr className="border-b-2 border-orange-100">
              <th className="sticky left-0 z-10 bg-white dark:bg-zinc-900 px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300 border-r-2 border-orange-400 shadow-[2px_0_8px_rgba(251,146,60,0.3)]">
                {emailColumn || 'Email'}
              </th>
              {fields.map(field => (
                <th key={field.name} className="px-4 py-3 text-left text-sm font-medium text-gray-700 bg-gray-50">
                  {field.displayName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const result = results.get(index);
              const isProcessing = currentRow === index && status === 'processing';
              
              return (
                <tr key={index} className={`
                  ${isProcessing ? 'animate-processing-row' : 
                    index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} 
                  hover:bg-orange-50/50 transition-all duration-300 group
                `}>
                  <td className={`
                    sticky left-0 z-10 px-4 py-2 text-sm font-medium
                    ${isProcessing ? 'bg-orange-50 dark:bg-orange-950/10' : 
                      'bg-white dark:bg-zinc-900'}
                    border-r-2 border-orange-400 shadow-[2px_0_8px_rgba(251,146,60,0.3)]
                  `}>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {result && (
                          <div className="relative group/copy">
                            <button
                              onClick={() => copyRowData(index)}
                              className="text-orange-400 hover:text-orange-600 transition-all duration-200 hover:scale-110"
                              title="Copy row data"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap opacity-0 group-hover/copy:opacity-100 transition-opacity pointer-events-none z-[100]">
                              Copy row
                              <div className="absolute top-full left-1/2 transform -translate-x-1/2 -translate-y-1/2 rotate-45 w-2 h-2 bg-gray-900"></div>
                            </span>
                            {copiedRow === index && (
                              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap z-[100] animate-fade-in">
                                Copied!
                                <div className="absolute top-full left-1/2 transform -translate-x-1/2 -translate-y-1/2 rotate-45 w-2 h-2 bg-gray-900"></div>
                              </div>
                            )}
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <div className="text-gray-800 font-mono text-sm truncate max-w-[180px]">
                            {emailColumn ? row[emailColumn] : Object.values(row)[0]}
                          </div>
                          {/* Show additional columns if CSV has many columns */}
                          {Object.keys(row).length > fields.length + 1 && (
                            <div className="flex items-center gap-1 text-xs text-gray-500">
                              {Object.keys(row).slice(1, 3).map((key, idx) => (
                                <span key={idx} className="truncate max-w-[60px]" title={row[key]}>
                                  {idx > 0 && ', '}{row[key]}
                                </span>
                              ))}
                              {Object.keys(row).length > 3 && (
                                <span className="text-gray-400 font-medium">
                                  +{Object.keys(row).length - 3} more
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <button
                          onClick={() => openDetailSidebar(index)}
                          className="text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 font-medium hover:underline"
                        >
                          View details →
                        </button>
                      </div>
                    </div>
                  </td>
                  
                  {/* Check if this row is skipped and render a single merged cell */}
                  {result?.status === 'skipped' ? (
                    <td 
                      colSpan={fields.length}
                      className="px-4 py-3 text-sm border-l border-gray-100 bg-gray-50"
                    >
                      <div className="flex flex-col items-start gap-1">
                        <span className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                          Skipped
                        </span>
                        <span className="text-xs text-gray-500">
                          {result.error || 'Personal email provider'}
                        </span>
                      </div>
                    </td>
                  ) : (
                    fields.map((field, fieldIndex) => {
                      const enrichment = result?.enrichments[field.name];
                      const cellKey = `${index}-${field.name}`;
                      
                      // Check if this cell should be shown
                      const isCellShown = cellsShown.has(cellKey);
                      const rowArrivalTime = rowDataArrivalTime.get(index);
                      const cellDelay = getCellAnimationDelay(index, fieldIndex);
                      const shouldAnimate = rowArrivalTime && !isCellShown && (Date.now() - rowArrivalTime) < 2500;
                      const shouldShowData = isCellShown || (rowArrivalTime && (Date.now() - rowArrivalTime) > cellDelay);
                      
                      return (
                        <td 
                          key={field.name} 
                          className="px-4 py-2 text-sm relative border-l border-gray-100"
                        >
                          {!result ? (
                            <div className="animate-slow-pulse">
                              <div className="h-4 bg-gradient-to-r from-gray-200 to-gray-300 rounded-full w-3/4"></div>
                            </div>
                          ) : (!shouldShowData && shouldAnimate) ? (
                            <div className="animate-slow-pulse">
                              <div className="h-4 bg-gradient-to-r from-gray-200 to-gray-300 rounded-full w-3/4"></div>
                            </div>
                          ) : result?.status === 'error' ? (
                            <span className="inline-flex items-center px-2 py-1 bg-red-100 text-red-600 rounded-full text-xs font-medium">
                              Error
                            </span>
                          ) : !enrichment || enrichment.value === null || enrichment.value === undefined || enrichment.value === '' ? (
                          <div 
                            className={shouldAnimate && !isCellShown ? "animate-in fade-in slide-in-from-bottom-2" : ""}
                            style={shouldAnimate && !isCellShown ? {
                              animationDuration: '500ms',
                              animationDelay: `${cellDelay}ms`,
                              animationFillMode: 'both',
                              animationTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)'
                            } : {}}
                          >
                            <span className="flex items-center gap-1 text-gray-400">
                              <X size={16} />
                              <span className="text-xs">No information found</span>
                            </span>
                          </div>
                        ) : (
                          <div 
                            className={shouldAnimate && !isCellShown ? "animate-in fade-in slide-in-from-bottom-2" : ""}
                            style={shouldAnimate && !isCellShown ? {
                              animationDuration: '500ms',
                              animationDelay: `${cellDelay}ms`,
                              animationFillMode: 'both',
                              animationTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)'
                            } : {}}
                          >
                            <div className="flex flex-col gap-1">
                              <div className="font-medium text-gray-800">
                                {field.type === 'boolean' ? (
                                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${
                                    enrichment.value === true || enrichment.value === 'true' || enrichment.value === 'Yes' 
                                      ? 'bg-green-100 text-green-600' 
                                      : 'bg-red-100 text-red-600'
                                  }`}>
                                    {enrichment.value === true || enrichment.value === 'true' || enrichment.value === 'Yes' ? '✓' : '✗'}
                                  </span>
                                ) : field.type === 'array' && Array.isArray(enrichment.value) ? (
                                  <div className="space-y-1">
                                    {enrichment.value.slice(0, 2).map((item, i) => (
                                      <span key={i} className="inline-block px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs mr-1">
                                        {item}
                                      </span>
                                    ))}
                                    {enrichment.value.length > 2 && (
                                      <span className="text-xs text-gray-500 font-medium"> +{enrichment.value.length - 2} more</span>
                                    )}
                                  </div>
                                ) : (
                                  <div className="truncate max-w-xs" title={String(enrichment.value)}>
                                    {enrichment.value || '-'}
                                  </div>
                                )}
                              </div>
                              {(enrichment.source || enrichment.sourceContext) && (
                                <div className="mt-1">
                                  <SourceContextTooltip
                                    sources={enrichment.sourceContext || []}
                                    value={enrichment.value}
                                    legacySource={enrichment.source}
                                    sourceCount={enrichment.sourceCount}
                                    corroboration={enrichment.corroboration}
                                    confidence={enrichment.confidence}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                    );
                  })
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      <Sheet 
        open={selectedRow.isOpen} 
        onOpenChange={(open) => setSelectedRow({ ...selectedRow, isOpen: open })}
      >
        <SheetContent className="w-[550px] sm:max-w-[550px] overflow-y-auto bg-white dark:bg-zinc-900 border-l-2 border-zinc-200 dark:border-zinc-800 px-8">
          {selectedRow.row && (
            <>
              <SheetHeader className="pb-4 border-b border-zinc-200 dark:border-zinc-800">
                <SheetTitle className="text-2xl font-bold text-[#36322F] dark:text-white">
                  {emailColumn ? selectedRow.row[emailColumn] : Object.values(selectedRow.row)[0]}
                </SheetTitle>
                {/* Email and Website buttons */}
                <div className="flex items-center gap-3 mt-3">
                  {selectedRow.result && (
                    <>
                      {/* Website link */}
                      {selectedRow.result.enrichments.website?.value && (
                        <a
                          href={String(selectedRow.result.enrichments.website.value)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-zinc-900 hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300 flex items-center gap-1 text-sm font-medium"
                        >
                          <Globe size={16} />
                          Website
                        </a>
                      )}
                      {/* Email display */}
                      {emailColumn && selectedRow.row[emailColumn] && (
                        <span className="text-zinc-600 dark:text-zinc-400 flex items-center gap-1 text-sm">
                          <Mail size={16} />
                          {selectedRow.row[emailColumn]}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </SheetHeader>
              
              <div className="mt-6 space-y-6">
                {/* Enriched Fields */}
                {selectedRow.result && (
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                      <h3 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
                        Enriched Data
                      </h3>
                      <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                    </div>
                    
                    <div className="space-y-3">
                      {fields.map((field) => {
                        const enrichment = selectedRow.result?.enrichments[field.name];
                        if (!enrichment && enrichment !== null) return null;
                        
                        return (
                          <Card key={field.name} className="p-4 bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <Label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                                {field.displayName}
                              </Label>
                            </div>
                            
                            <div className="text-zinc-900 dark:text-zinc-100">
                              {!enrichment || enrichment.value === null || enrichment.value === undefined || enrichment.value === '' ? (
                                <div className="flex items-center gap-2 text-zinc-400 py-2">
                                  <X size={16} />
                                  <span className="text-sm italic">No information found</span>
                                </div>
                              ) : field.type === 'array' && Array.isArray(enrichment.value) ? (
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                  {enrichment.value.map((item, i) => (
                                    <Badge key={i} variant="secondary" className="bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 border-orange-200 dark:border-orange-800">
                                      {item}
                                    </Badge>
                                  ))}
                                </div>
                              ) : field.type === 'boolean' ? (
                                <Badge 
                                  variant={enrichment.value === true || enrichment.value === 'true' || enrichment.value === 'Yes' ? "default" : "secondary"}
                                  className={enrichment.value === true || enrichment.value === 'true' || enrichment.value === 'Yes' 
                                    ? "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/20 dark:text-green-400"
                                    : "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/20 dark:text-red-400"
                                  }
                                >
                                  {enrichment.value === true || enrichment.value === 'true' || enrichment.value === 'Yes' ? 'Yes' : 'No'}
                                </Badge>
                              ) : (typeof enrichment.value === 'string' && (enrichment.value.startsWith('http://') || enrichment.value.startsWith('https://'))) ? (
                                <a 
                                  href={String(enrichment.value)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline break-all inline-flex items-center gap-1"
                                >
                                  {enrichment.value}
                                  <ExternalLink size={12} />
                                </a>
                              ) : (
                                <p className="text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed">
                                  {enrichment.value}
                                </p>
                              )}
                            </div>
                            
                            {/* Corroboration Data */}
                            {enrichment && enrichment.corroboration && (
                              <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700">
                                <div className="flex items-center gap-2 mb-2">
                                  {enrichment.corroboration.sources_agree ? (
                                    <>
                                      <div className="w-2 h-2 bg-green-500 rounded-full" />
                                      <span className="text-xs text-green-700 font-medium">All sources agree</span>
                                    </>
                                  ) : (
                                    <>
                                      <div className="w-2 h-2 bg-amber-500 rounded-full" />
                                      <span className="text-xs text-amber-700 font-medium">Sources vary</span>
                                    </>
                                  )}
                                </div>
                                <div className="space-y-2">
                                  {enrichment.corroboration.evidence
                                    .filter(e => e.value !== null)
                                    .map((evidence, idx) => (
                                      <div key={idx} className="bg-gray-50 dark:bg-zinc-900 rounded p-2 space-y-1">
                                        <div className="flex items-start justify-between gap-2">
                                          <a
                                            href={evidence.source_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                                          >
                                            {new URL(evidence.source_url).hostname} →
                                          </a>
                                        </div>
                                        {evidence.exact_text && (
                                          <p className="text-xs text-gray-600 italic">
                                            &quot;{evidence.exact_text}&quot;
                                          </p>
                                        )}
                                        <p className="text-xs font-medium text-gray-800">
                                          Found: {JSON.stringify(evidence.value)}
                                        </p>
                                      </div>
                                    ))}
                                </div>
                              </div>
                            )}
                            
                            {/* Source Context (fallback if no corroboration) */}
                            {enrichment && !enrichment.corroboration && enrichment.sourceContext && enrichment.sourceContext.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700">
                                <button
                                  onClick={() => {
                                    const sourceKey = `${field.name}-sources`;
                                    setExpandedSources(prev => {
                                      const newSet = new Set<string>(prev);
                                      if (!prev.has(sourceKey)) {
                                        newSet.add(sourceKey);
                                      } else {
                                        newSet.delete(sourceKey);
                                      }
                                      return newSet;
                                    });
                                  }}
                                  className="flex items-center gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors w-full"
                                >
                                  <Globe size={12} />
                                  <span>Sources ({enrichment.sourceContext.length})</span>
                                  {expandedSources.has(`${field.name}-sources`) ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </button>
                                {expandedSources.has(`${field.name}-sources`) && (
                                  <div className="space-y-1.5 pl-4 mt-2">
                                    {enrichment.sourceContext.map((source, idx) => (
                                      <div key={idx} className="group">
                                        <a 
                                          href={source.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex items-start gap-2 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                        >
                                          <span className="text-zinc-400 dark:text-zinc-600 flex-shrink-0">•</span>
                                          <span className="break-all underline">{new URL(source.url).hostname}</span>
                                          <ExternalLink size={10} className="flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </a>
                                        {source.snippet && (
                                          <p className="text-xs text-zinc-500 dark:text-zinc-400 italic mt-0.5 pl-4 line-clamp-2">
                                            &quot;{source.snippet}&quot;
                                          </p>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}
                
                {/* Original Data */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                    <h3 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
                      Original Data
                    </h3>
                    <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                  </div>
                  
                  <Card className="p-4 bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700">
                    <div className="space-y-3">
                      {Object.entries(selectedRow.row).map(([key, value]) => (
                        <div key={key} className="flex items-start justify-between gap-4">
                          <Label className="text-sm font-medium text-zinc-600 dark:text-zinc-400 min-w-[120px]">
                            {key}
                          </Label>
                          <span className="text-sm text-zinc-800 dark:text-zinc-200 text-right break-all">
                            {value || <span className="italic text-zinc-400">Empty</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>

                {/* Action Buttons */}
                <div className="pt-6 pb-4 border-t border-zinc-200 dark:border-zinc-800">
                  <div className="flex gap-3">
                    <Button
                      variant="orange"
                      className="flex-1"
                      onClick={async () => {
                        toast.info('Additional enrichment coming soon!');
                      }}
                    >
                      Add More Information
                    </Button>
                    
                    <Button
                      variant="outline"
                      className="flex-1 bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 border-zinc-900 dark:border-zinc-100"
                      onClick={() => {
                        copyRowData(selectedRow.index);
                        toast.success('Row data copied to clipboard!');
                      }}
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Copy Row Data
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Skipped Emails Summary */}
      {(() => {
        const skippedResults = Array.from(results.entries())
          .filter(([, result]) => result.status === 'skipped')
          .map(([index, result]) => ({
            index,
            email: emailColumn ? rows[index][emailColumn] : '',
            reason: result.error || 'Common email provider'
          }));
        
        if (skippedResults.length === 0) return null;
        
        return (
          <Card className="p-4 bg-gray-50 dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 mt-4">
            <button
              onClick={() => setShowSkipped(!showSkipped)}
              className="w-full flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="bg-gray-200 text-gray-700">
                  {skippedResults.length} Skipped
                </Badge>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Common email providers and domains excluded from enrichment
                </span>
              </div>
              {showSkipped ? (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </button>
            
            {showSkipped && (
              <div className="mt-4 space-y-2">
                <div className="text-xs text-gray-500 mb-2">
                  These emails were skipped to save API calls and processing time:
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {skippedResults.map(({ index, email, reason }) => (
                    <div
                      key={index}
                      className="flex items-center justify-between bg-white dark:bg-zinc-800 rounded-md px-3 py-2 text-sm"
                    >
                      <span className="font-mono text-gray-700 dark:text-gray-300 truncate">
                        {email}
                      </span>
                      <span className="text-xs text-gray-500 ml-2">
                        {reason}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        );
      })()}
    </div>
  );
}