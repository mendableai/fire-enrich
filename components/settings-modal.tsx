'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExternalLink, Eye, EyeOff, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { 
  getStoredApiKeys, 
  saveApiKeys, 
  validateFirecrawlApiKey, 
  getApiKeyStatus,
  type ApiKeys,
  type ApiKeyStatus 
} from '@/lib/api-key-manager';
import { 
  LLM_PROVIDERS, 
  getCurrentLLMSelection, 
  saveLLMSelection, 
  getAvailableProviders,
  type LLMSelection 
} from '@/lib/llm-manager';

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
}

export function SettingsModal({ open, onOpenChange, onSave }: SettingsModalProps) {
  const [apiKeys, setApiKeys] = useState<ApiKeys>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [isValidating, setIsValidating] = useState(false);
  const [validationStatus, setValidationStatus] = useState<Record<string, boolean | null>>({});
  const [llmSelection, setLlmSelection] = useState<LLMSelection>({ provider: 'grok', model: 'grok-3-mini' });
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus>({
    firecrawl: false,
    openai: false,
    anthropic: false,
    deepseek: false,
    grok: false,
  });

  // Load stored data on mount
  useEffect(() => {
    if (open) {
      const stored = getStoredApiKeys();
      setApiKeys(stored);
      setLlmSelection(getCurrentLLMSelection());
      loadApiKeyStatus();
    }
  }, [open]);

  const loadApiKeyStatus = async () => {
    try {
      const status = await getApiKeyStatus();
      setApiKeyStatus(status);
    } catch (error) {
      console.error('Error loading API key status:', error);
    }
  };

  const togglePasswordVisibility = (provider: string) => {
    setShowPasswords(prev => ({
      ...prev,
      [provider]: !prev[provider]
    }));
  };

  const handleApiKeyChange = (provider: string, value: string) => {
    setApiKeys(prev => ({
      ...prev,
      [provider]: value
    }));
    // Clear validation status when key changes
    setValidationStatus(prev => ({
      ...prev,
      [provider]: null
    }));
  };

  const validateApiKey = async (provider: string, key: string) => {
    if (!key.trim()) return;
    
    setIsValidating(true);
    setValidationStatus(prev => ({ ...prev, [provider]: null }));
    
    try {
      let isValid = false;
      
      if (provider === 'firecrawl') {
        isValid = await validateFirecrawlApiKey(key);
      } else {
        // For other providers, we'll assume they're valid if they have the right format
        // You can add specific validation logic for each provider here
        isValid = key.trim().length > 10; // Basic validation
      }
      
      setValidationStatus(prev => ({ ...prev, [provider]: isValid }));
      
      if (isValid) {
        toast.success(`${provider.charAt(0).toUpperCase() + provider.slice(1)} API key validated successfully!`);
      } else {
        toast.error(`Invalid ${provider.charAt(0).toUpperCase() + provider.slice(1)} API key`);
      }
    } catch (error) {
      console.error(`Error validating ${provider} API key:`, error);
      setValidationStatus(prev => ({ ...prev, [provider]: false }));
      toast.error(`Error validating ${provider} API key`);
    } finally {
      setIsValidating(false);
    }
  };

  const handleSave = async () => {
    try {
      // Save API keys
      saveApiKeys(apiKeys);

      // Save LLM selection
      saveLLMSelection(llmSelection.provider, llmSelection.model);

      // Count saved keys for feedback
      const savedKeysCount = Object.values(apiKeys).filter(key => key && key.trim()).length;

      toast.success(`Settings saved! ${savedKeysCount} API key${savedKeysCount !== 1 ? 's' : ''} stored locally.`);
      onSave?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    }
  };

  const handleClearAllKeys = () => {
    setApiKeys({});
    setValidationStatus({});
    toast.info('All API keys cleared from form. Click Save to persist changes.');
  };

  const handleLLMProviderChange = (provider: string) => {
    const providerObj = LLM_PROVIDERS.find(p => p.id === provider);
    if (providerObj && providerObj.models.length > 0) {
      setLlmSelection({
        provider,
        model: providerObj.models[0].id
      });
    }
  };

  const availableProviders = getAvailableProviders(apiKeyStatus);

  const apiKeyProviders = [
    { id: 'firecrawl', name: 'Firecrawl', url: 'https://firecrawl.dev', required: true },
    { id: 'openai', name: 'OpenAI', url: 'https://platform.openai.com', required: true },
    { id: 'anthropic', name: 'Anthropic', url: 'https://console.anthropic.com', required: false },
    { id: 'deepseek', name: 'DeepSeek', url: 'https://platform.deepseek.com', required: false },
    { id: 'grok', name: 'Grok (xAI)', url: 'https://console.x.ai', required: false },
  ];

  // Custom DialogContent with pure centered pop-up animation (no sliding)
  const CustomDialogContent = ({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) => {
    return (
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out" />
        <DialogPrimitive.Content
          className={cn(
            // Fixed centered positioning with proper transform centering
            "fixed top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] z-50 grid w-full max-w-[calc(100%-2rem)] gap-4 rounded-lg border bg-background p-6 shadow-lg",
            // Pure scale animation with fixed centering - no Radix UI animation classes
            "data-[state=open]:modal-enter data-[state=closed]:modal-exit",
            className
          )}
          {...props}
        >
          {children}
          <DialogPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPortal>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <CustomDialogContent className="sm:max-w-2xl bg-white dark:bg-zinc-900 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure your API keys and LLM preferences. Your keys are stored locally and persist between sessions.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="api-keys" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="api-keys">API Keys</TabsTrigger>
            <TabsTrigger value="llm-settings">LLM Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="api-keys" className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4">
              <div className="flex items-start gap-2">
                <div className="text-blue-600 dark:text-blue-400 mt-0.5">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="text-sm">
                  <p className="font-medium text-blue-900 dark:text-blue-100">Local Storage</p>
                  <p className="text-blue-700 dark:text-blue-300 mt-1">
                    API keys are stored locally in your browser and persist between sessions. They are not shared with other users.
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              {apiKeyProviders.map((provider) => (
                <div key={provider.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor={`${provider.id}-key`} className="flex items-center gap-2">
                      {provider.name} API Key
                      {provider.required && <span className="text-red-500">*</span>}
                      {apiKeyStatus[provider.id as keyof ApiKeyStatus] && (
                        <Check className="h-4 w-4 text-green-500" />
                      )}
                    </Label>
                    <Button
                      onClick={() => window.open(provider.url, '_blank')}
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Get Key
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        id={`${provider.id}-key`}
                        type={showPasswords[provider.id] ? 'text' : 'password'}
                        value={apiKeys[provider.id as keyof ApiKeys] || ''}
                        onChange={(e) => handleApiKeyChange(provider.id, e.target.value)}
                        placeholder={`Enter your ${provider.name} API key`}
                        className="pr-20"
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {validationStatus[provider.id] === true && (
                          <Check className="h-4 w-4 text-green-500" />
                        )}
                        {validationStatus[provider.id] === false && (
                          <X className="h-4 w-4 text-red-500" />
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => togglePasswordVisibility(provider.id)}
                        >
                          {showPasswords[provider.id] ? (
                            <EyeOff className="h-3 w-3" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <Button
                      onClick={() => validateApiKey(provider.id, apiKeys[provider.id as keyof ApiKeys] || '')}
                      disabled={!apiKeys[provider.id as keyof ApiKeys]?.trim() || isValidating}
                      variant="outline"
                      size="sm"
                    >
                      Test
                    </Button>
                  </div>
                </div>
              ))}


            </div>
          </TabsContent>

          <TabsContent value="llm-settings" className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>LLM Provider</Label>
                <Select
                  value={llmSelection.provider}
                  onValueChange={handleLLMProviderChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {LLM_PROVIDERS.map((provider) => (
                      <SelectItem 
                        key={provider.id} 
                        value={provider.id}
                        disabled={provider.requiresApiKey && !apiKeyStatus[provider.id as keyof ApiKeyStatus]}
                      >
                        <div className="flex items-center gap-2">
                          {provider.name}
                          {provider.requiresApiKey && !apiKeyStatus[provider.id as keyof ApiKeyStatus] && (
                            <span className="text-xs text-muted-foreground">(API key required)</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Model</Label>
                <Select
                  value={llmSelection.model}
                  onValueChange={(model) => setLlmSelection(prev => ({ ...prev, model }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {LLM_PROVIDERS
                      .find(p => p.id === llmSelection.provider)
                      ?.models.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          <div>
                            <div className="font-medium">{model.name}</div>
                            {model.description && (
                              <div className="text-xs text-muted-foreground">{model.description}</div>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Bottom button row with Clear All API Keys on left and Cancel/Save on right */}
        <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button
            onClick={handleClearAllKeys}
            variant="outline"
            size="sm"
            className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:border-red-800 dark:hover:border-red-700 dark:hover:bg-red-950"
          >
            Clear All API Keys
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save Settings
            </Button>
          </div>
        </div>
      </CustomDialogContent>
    </Dialog>
  );
}
