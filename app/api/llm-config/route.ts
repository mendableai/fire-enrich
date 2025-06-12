import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { provider, model } = await request.json();

    // Validate provider
    const validProviders = ['openai', 'anthropic', 'deepseek', 'grok'];
    if (!validProviders.includes(provider)) {
      return NextResponse.json(
        { error: 'Invalid provider' },
        { status: 400 }
      );
    }

    // Check if the required API key is available (either in env or headers)
    const envKeyMap = {
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      deepseek: 'DEEPSEEK_API_KEY',
      grok: 'GROK_API_KEY',
    };

    const headerKeyMap = {
      openai: 'X-OpenAI-API-Key',
      anthropic: 'X-Anthropic-API-Key',
      deepseek: 'X-DeepSeek-API-Key',
      grok: 'X-Grok-API-Key',
    };

    const requiredEnvKey = envKeyMap[provider as keyof typeof envKeyMap];
    const headerKey = headerKeyMap[provider as keyof typeof headerKeyMap];
    const hasEnvKey = !!process.env[requiredEnvKey];
    const hasHeaderKey = !!request.headers.get(headerKey);

    if (!hasEnvKey && !hasHeaderKey) {
      return NextResponse.json(
        { error: `${provider.toUpperCase()} API key not configured` },
        { status: 400 }
      );
    }

    // In a real-world scenario, you might want to:
    // 1. Update a database with user preferences
    // 2. Validate the model name for the provider
    // 3. Test the API key works with the selected model

    return NextResponse.json({ 
      success: true, 
      provider, 
      model,
      message: `Successfully switched to ${provider} with model ${model}` 
    });

  } catch (error) {
    console.error('LLM config error:', error);
    return NextResponse.json(
      { error: 'Failed to update LLM configuration' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // Return current LLM configuration
  const availableProviders = {
    openai: !!process.env.OPENAI_API_KEY || !!request.headers.get('X-OpenAI-API-Key'),
    anthropic: !!process.env.ANTHROPIC_API_KEY || !!request.headers.get('X-Anthropic-API-Key'),
    deepseek: !!process.env.DEEPSEEK_API_KEY || !!request.headers.get('X-DeepSeek-API-Key'),
    grok: !!process.env.GROK_API_KEY || !!request.headers.get('X-Grok-API-Key'),
  };

  return NextResponse.json({
    availableProviders,
    currentProvider: process.env.LLM_PROVIDER || 'grok',
    currentModel: process.env.LLM_MODEL || 'grok-3-mini',
  });
}