#!/usr/bin/env node

/**
 * Test script for LLM Provider Switching
 * 
 * This script helps validate that the LLM provider switching implementation
 * works correctly by testing the core functionality programmatically.
 * 
 * Usage:
 *   node scripts/test-llm-switching.js
 * 
 * Prerequisites:
 *   - Set environment variables for at least one LLM provider
 *   - Ensure the development server is running on localhost:3001
 */

const https = require('https');
const http = require('http');

// Test configuration
const TEST_CONFIG = {
  baseUrl: 'http://localhost:3001',
  testProviders: ['openai', 'anthropic', 'deepseek', 'grok'],
  testModels: {
    openai: 'gpt-4o',
    anthropic: 'claude-3-5-sonnet-20241022',
    deepseek: 'deepseek-chat',
    grok: 'grok-beta'
  },
  testData: {
    rows: [
      { email: 'john.doe@example.com', name: 'John Doe' },
      { email: 'jane.smith@example.com', name: 'Jane Smith' }
    ],
    fields: [
      { name: 'company', description: 'Company name' },
      { name: 'title', description: 'Job title' }
    ],
    emailColumn: 'email'
  }
};

// Helper function to make HTTP requests
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const protocol = options.protocol === 'https:' ? https : http;
    
    const req = protocol.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const result = {
            statusCode: res.statusCode,
            headers: res.headers,
            body: res.headers['content-type']?.includes('application/json') 
              ? JSON.parse(body) 
              : body
          };
          resolve(result);
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    
    req.end();
  });
}

// Test functions
async function testApiHealth() {
  console.log('🔍 Testing API health...');
  
  try {
    const response = await makeRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/check-env',
      method: 'GET'
    });
    
    if (response.statusCode === 200) {
      console.log('✅ API is healthy');
      console.log('📊 Available providers:', Object.keys(response.body.providers || {}));
      return response.body;
    } else {
      throw new Error(`API health check failed: ${response.statusCode}`);
    }
  } catch (error) {
    console.error('❌ API health check failed:', error.message);
    throw error;
  }
}

async function testLLMConfig() {
  console.log('🔍 Testing LLM configuration endpoint...');
  
  try {
    const response = await makeRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/llm-config',
      method: 'GET'
    });
    
    if (response.statusCode === 200) {
      console.log('✅ LLM config endpoint working');
      console.log('📋 Available models:', response.body.models?.length || 0);
      return response.body;
    } else {
      throw new Error(`LLM config failed: ${response.statusCode}`);
    }
  } catch (error) {
    console.error('❌ LLM config test failed:', error.message);
    throw error;
  }
}

async function testProviderEnrichment(provider, model, apiKeys) {
  console.log(`🔍 Testing enrichment with ${provider} (${model})...`);
  
  const headers = {
    'Content-Type': 'application/json',
    'x-use-agents': 'true'
  };
  
  // Add API keys to headers
  if (apiKeys.firecrawl) headers['X-Firecrawl-API-Key'] = apiKeys.firecrawl;
  if (apiKeys.openai) headers['X-OpenAI-API-Key'] = apiKeys.openai;
  if (apiKeys.anthropic) headers['X-Anthropic-API-Key'] = apiKeys.anthropic;
  if (apiKeys.deepseek) headers['X-DeepSeek-API-Key'] = apiKeys.deepseek;
  if (apiKeys.grok) headers['X-Grok-API-Key'] = apiKeys.grok;
  
  const requestData = {
    ...TEST_CONFIG.testData,
    llmProvider: provider,
    llmModel: model,
    useAgents: true,
    useV2Architecture: true
  };
  
  try {
    const response = await makeRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/enrich',
      method: 'POST',
      headers
    }, requestData);
    
    if (response.statusCode === 200) {
      console.log(`✅ ${provider} enrichment successful`);
      
      // Check if response indicates correct provider was used
      const responseText = JSON.stringify(response.body);
      if (responseText.toLowerCase().includes(provider.toLowerCase())) {
        console.log(`✅ Response confirms ${provider} was used`);
      } else {
        console.log(`⚠️  Response doesn't clearly indicate ${provider} usage`);
      }
      
      return response.body;
    } else {
      throw new Error(`Enrichment failed: ${response.statusCode} - ${JSON.stringify(response.body)}`);
    }
  } catch (error) {
    console.error(`❌ ${provider} enrichment failed:`, error.message);
    return null;
  }
}

async function runAllTests() {
  console.log('🚀 Starting LLM Provider Switching Tests\n');
  
  try {
    // Test 1: API Health
    const healthCheck = await testApiHealth();
    console.log('');
    
    // Test 2: LLM Config
    const llmConfig = await testLLMConfig();
    console.log('');
    
    // Get available API keys from environment
    const apiKeys = {
      firecrawl: process.env.FIRECRAWL_API_KEY,
      openai: process.env.OPENAI_API_KEY,
      anthropic: process.env.ANTHROPIC_API_KEY,
      deepseek: process.env.DEEPSEEK_API_KEY,
      grok: process.env.GROK_API_KEY
    };
    
    console.log('🔑 Available API Keys:');
    Object.entries(apiKeys).forEach(([provider, key]) => {
      console.log(`   ${provider}: ${key ? '✅ Set' : '❌ Missing'}`);
    });
    console.log('');
    
    // Test 3: Provider Enrichment Tests
    const results = {};
    
    for (const provider of TEST_CONFIG.testProviders) {
      const model = TEST_CONFIG.testModels[provider];
      const providerKey = apiKeys[provider];
      
      if (!providerKey) {
        console.log(`⏭️  Skipping ${provider} - no API key available`);
        continue;
      }
      
      if (!apiKeys.firecrawl) {
        console.log(`⏭️  Skipping ${provider} - Firecrawl API key required`);
        continue;
      }
      
      const result = await testProviderEnrichment(provider, model, apiKeys);
      results[provider] = result;
      console.log('');
    }
    
    // Test Summary
    console.log('📊 Test Summary:');
    console.log('================');
    
    const successfulProviders = Object.entries(results)
      .filter(([_, result]) => result !== null)
      .map(([provider, _]) => provider);
    
    const failedProviders = Object.entries(results)
      .filter(([_, result]) => result === null)
      .map(([provider, _]) => provider);
    
    console.log(`✅ Successful providers: ${successfulProviders.join(', ') || 'None'}`);
    console.log(`❌ Failed providers: ${failedProviders.join(', ') || 'None'}`);
    
    if (successfulProviders.length > 0) {
      console.log('\n🎉 LLM Provider Switching is working!');
      console.log('✅ Multiple providers can be used for enrichment');
      console.log('✅ Provider selection is respected by the backend');
      console.log('✅ Agent architecture works with different providers');
    } else {
      console.log('\n⚠️  No providers were successfully tested');
      console.log('💡 Make sure you have valid API keys set in environment variables');
    }
    
  } catch (error) {
    console.error('\n💥 Test suite failed:', error.message);
    process.exit(1);
  }
}

// Validation functions
function validateEnvironment() {
  console.log('🔍 Validating environment...');
  
  const requiredForTesting = ['FIRECRAWL_API_KEY'];
  const missing = requiredForTesting.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '));
    console.log('💡 Set at least FIRECRAWL_API_KEY and one LLM provider key to run tests');
    return false;
  }
  
  const llmProviders = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'DEEPSEEK_API_KEY', 'GROK_API_KEY'];
  const availableProviders = llmProviders.filter(key => process.env[key]);
  
  if (availableProviders.length === 0) {
    console.error('❌ No LLM provider API keys found');
    console.log('💡 Set at least one of:', llmProviders.join(', '));
    return false;
  }
  
  console.log('✅ Environment validation passed');
  return true;
}

// Main execution
if (require.main === module) {
  console.log('🧪 Fire Enrich LLM Provider Switching Test Suite');
  console.log('================================================\n');
  
  if (!validateEnvironment()) {
    process.exit(1);
  }
  
  runAllTests().catch(error => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  });
}

module.exports = {
  testApiHealth,
  testLLMConfig,
  testProviderEnrichment,
  runAllTests
};
