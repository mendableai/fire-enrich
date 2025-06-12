'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Bot, CheckCircle, Circle, Zap, DollarSign, Clock, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

export type LLMProvider = 'openai' | 'anthropic' | 'deepseek' | 'grok';

interface LLMModel {
  id: string;
  name: string;
  provider: LLMProvider;
  cost: 'low' | 'medium' | 'high';
  speed: 'fast' | 'medium' | 'slow';
  contextWindow: string;
  description: string;
  available?: boolean;
}

const LLM_MODELS: LLMModel[] = [
  {
    id: 'grok-3-mini',
    name: 'Grok 3 Mini',
    provider: 'grok',
    cost: 'medium',
    speed: 'fast',
    contextWindow: '250K',
    description: 'X.AI\'s witty and efficient model',
    available: true,
  },
  {
    id: 'deepseek-chat',
    name: 'DeepSeek V3',
    provider: 'deepseek',
    cost: 'low',
    speed: 'fast',
    contextWindow: '300K',
    description: 'Cost-effective and powerful',
    available: true,
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    cost: 'high',
    speed: 'fast',
    contextWindow: '128K',
    description: 'OpenAI\'s most capable model',
    available: true,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    cost: 'low',
    speed: 'fast',
    contextWindow: '128K',
    description: 'Faster and cheaper GPT-4o',
    available: true,
  },
  {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    cost: 'high',
    speed: 'fast',
    contextWindow: '200K',
    description: 'Anthropic\'s most capable model',
    available: true,
  },
];

const getCostIcon = (cost: string) => {
  switch (cost) {
    case 'low':
      return <DollarSign className="w-3 h-3 text-green-600" />;
    case 'medium':
      return <DollarSign className="w-3 h-3 text-yellow-600" />;
    case 'high':
      return <DollarSign className="w-3 h-3 text-red-600" />;
    default:
      return <DollarSign className="w-3 h-3 text-gray-600" />;
  }
};

const getSpeedIcon = (speed: string) => {
  switch (speed) {
    case 'fast':
      return <Zap className="w-3 h-3 text-green-600" />;
    case 'medium':
      return <Clock className="w-3 h-3 text-yellow-600" />;
    case 'slow':
      return <Clock className="w-3 h-3 text-red-600" />;
    default:
      return <Clock className="w-3 h-3 text-gray-600" />;
  }
};

const getCostBadgeColor = (cost: string) => {
  switch (cost) {
    case 'low':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
    case 'high':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
  }
};

interface LLMSwitcherProps {
  onModelChange?: (provider: LLMProvider, modelId: string) => void;
  onNeedApiKey?: () => void;
  className?: string;
}

export function LLMSwitcher({ onModelChange, onNeedApiKey, className }: LLMSwitcherProps) {
  const [currentModel, setCurrentModel] = useState<LLMModel>(
    LLM_MODELS.find(m => m.provider === 'grok') || LLM_MODELS[0]
  );
  const [availableModels, setAvailableModels] = useState<LLMModel[]>([]);

  useEffect(() => {
    checkAvailableModels();
  }, []);

  const checkAvailableModels = async () => {
    try {
      const response = await fetch('/api/check-env');
      const data = await response.json();
      
      const available = LLM_MODELS.map(model => {
        const envKey = `${model.provider.toUpperCase()}_API_KEY`;
        const localKey = `${model.provider}_api_key`;
        
        return {
          ...model,
          available: data.environmentStatus[envKey] || !!localStorage.getItem(localKey)
        };
      });
      
      setAvailableModels(available);
    } catch (error) {
      console.error('Failed to check available models:', error);
      // Set all models as potentially available on error
      setAvailableModels(LLM_MODELS.map(m => ({ ...m, available: true })));
    }
  };

  const handleModelChange = async (model: LLMModel) => {
    if (!model.available) {
      toast.error(`${model.name} is not available. Please add the ${model.provider.toUpperCase()} API key.`);
      onNeedApiKey?.();
      return;
    }

    setCurrentModel(model);
    
    // Save to localStorage for persistence
    localStorage.setItem('selected_llm_provider', model.provider);
    localStorage.setItem('selected_llm_model', model.id);
    
    // Call the callback if provided
    onModelChange?.(model.provider, model.id);
    
    toast.success(`Switched to ${model.name}`, {
      description: `Now using ${model.provider.charAt(0).toUpperCase() + model.provider.slice(1)} for AI operations`,
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`flex items-center gap-2 ${className}`}
        >
          <Bot className="w-4 h-4" />
          <span className="hidden sm:inline">{currentModel.name}</span>
          <Badge 
            variant="secondary" 
            className={`text-xs px-1.5 py-0.5 ${getCostBadgeColor(currentModel.cost)}`}
          >
            {currentModel.cost}
          </Badge>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Bot className="w-4 h-4" />
          AI Model Selection
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {availableModels.map((model) => (
          <DropdownMenuItem
            key={model.id}
            onClick={() => handleModelChange(model)}
            disabled={!model.available}
            className="flex flex-col items-start gap-2 p-3 cursor-pointer"
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                {currentModel.id === model.id ? (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                ) : (
                  <Circle className="w-4 h-4 text-gray-400" />
                )}
                <span className="font-medium">
                  {model.name}
                  {!model.available && (
                    <span className="text-red-500 text-xs ml-2">(API key needed)</span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {getCostIcon(model.cost)}
                {getSpeedIcon(model.speed)}
              </div>
            </div>
            
            <div className="text-xs text-muted-foreground w-full">
              {model.description} • {model.contextWindow} context
            </div>
            
            <div className="flex gap-1 mt-1">
              <Badge 
                variant="secondary" 
                className={`text-xs ${getCostBadgeColor(model.cost)}`}
              >
                {model.cost} cost
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {model.provider}
              </Badge>
            </div>
          </DropdownMenuItem>
        ))}
        
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onNeedApiKey}
          className="flex items-center gap-2 cursor-pointer text-blue-600"
        >
          <ExternalLink className="w-4 h-4" />
          Manage API Keys
        </DropdownMenuItem>
        <div className="p-2 text-xs text-muted-foreground">
          Models require their respective API keys to be available
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
} 