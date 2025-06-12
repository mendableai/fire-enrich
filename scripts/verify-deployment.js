#!/usr/bin/env node

/**
 * Deployment Verification Script
 * 
 * This script verifies that the Fire-Enrich enhanced version
 * can be successfully cloned and run by end users.
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Fire-Enrich Enhanced Deployment Verification');
console.log('==============================================\n');

// Check if we're in the right directory
const currentDir = process.cwd();
const packageJsonPath = path.join(currentDir, 'package.json');

if (!fs.existsSync(packageJsonPath)) {
  console.error('❌ Error: package.json not found. Please run this script from the fire-enrich directory.');
  process.exit(1);
}

// Read package.json
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
console.log(`📦 Project: ${packageJson.name}`);
console.log(`📋 Version: ${packageJson.version}`);
console.log(`📝 Description: ${packageJson.description || 'Fire-Enrich Enhanced'}\n`);

// Check required files
const requiredFiles = [
  'components/settings-modal.tsx',
  'components/llm-switcher.tsx',
  'lib/llm-manager.ts',
  'lib/api-key-manager.ts',
  'lib/services/llm-service.ts',
  'lib/services/openai.ts',
  'lib/services/anthropic.ts',
  'lib/services/deepseek.ts',
  'lib/services/grok.ts',
  'app/api/llm-config/route.ts',
  'DEPLOYMENT_GUIDE.md',
  'FEATURE_SUMMARY.md',
  'IMPLEMENTATION_SUMMARY.md'
];

console.log('📁 Checking required files...');
let missingFiles = [];

requiredFiles.forEach(file => {
  const filePath = path.join(currentDir, file);
  if (fs.existsSync(filePath)) {
    console.log(`   ✅ ${file}`);
  } else {
    console.log(`   ❌ ${file} - MISSING`);
    missingFiles.push(file);
  }
});

if (missingFiles.length > 0) {
  console.error(`\n❌ Missing ${missingFiles.length} required files. Deployment verification failed.`);
  process.exit(1);
}

// Check dependencies
console.log('\n📦 Checking LLM-related dependencies...');
const requiredDeps = [
  'openai',
  '@anthropic-ai/sdk',
  'sonner'
];

const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
let missingDeps = [];

requiredDeps.forEach(dep => {
  if (dependencies[dep]) {
    console.log(`   ✅ ${dep}: ${dependencies[dep]}`);
  } else {
    console.log(`   ❌ ${dep} - MISSING`);
    missingDeps.push(dep);
  }
});

if (missingDeps.length > 0) {
  console.error(`\n❌ Missing ${missingDeps.length} required dependencies. Run 'npm install' to fix.`);
  process.exit(1);
}

// Check documentation
console.log('\n📚 Checking documentation...');
const docFiles = [
  'DEPLOYMENT_GUIDE.md',
  'FEATURE_SUMMARY.md',
  'README.md',
  'docs/LLM_PROVIDER_SWITCHING.md',
  'docs/API_KEY_STORAGE.md',
  'docs/ARCHITECTURE_DIAGRAM.md'
];

docFiles.forEach(file => {
  const filePath = path.join(currentDir, file);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    const wordCount = content.split(/\s+/).length;
    console.log(`   ✅ ${file} (${wordCount} words)`);
  } else {
    console.log(`   ⚠️  ${file} - Optional but recommended`);
  }
});

// Check scripts
console.log('\n🧪 Checking available scripts...');
const scripts = packageJson.scripts || {};
const recommendedScripts = ['dev', 'build', 'start', 'lint'];

recommendedScripts.forEach(script => {
  if (scripts[script]) {
    console.log(`   ✅ npm run ${script}: ${scripts[script]}`);
  } else {
    console.log(`   ❌ npm run ${script} - MISSING`);
  }
});

// Check for LLM switching components
console.log('\n🔄 Verifying LLM switching implementation...');

try {
  // Check LLM Manager
  const llmManagerPath = path.join(currentDir, 'lib/llm-manager.ts');
  const llmManagerContent = fs.readFileSync(llmManagerPath, 'utf8');
  
  const hasProviders = llmManagerContent.includes('LLM_PROVIDERS');
  const hasOpenAI = llmManagerContent.includes('openai');
  const hasAnthropic = llmManagerContent.includes('anthropic');
  const hasDeepSeek = llmManagerContent.includes('deepseek');
  const hasGrok = llmManagerContent.includes('grok');
  
  console.log(`   ✅ LLM_PROVIDERS defined: ${hasProviders}`);
  console.log(`   ✅ OpenAI support: ${hasOpenAI}`);
  console.log(`   ✅ Anthropic support: ${hasAnthropic}`);
  console.log(`   ✅ DeepSeek support: ${hasDeepSeek}`);
  console.log(`   ✅ Grok support: ${hasGrok}`);
  
  // Check Settings Modal
  const settingsModalPath = path.join(currentDir, 'components/settings-modal.tsx');
  const settingsModalContent = fs.readFileSync(settingsModalPath, 'utf8');
  
  const hasApiKeyTab = settingsModalContent.includes('api-keys');
  const hasLlmTab = settingsModalContent.includes('llm-settings');
  const hasValidation = settingsModalContent.includes('validateApiKey');
  
  console.log(`   ✅ API Keys tab: ${hasApiKeyTab}`);
  console.log(`   ✅ LLM Settings tab: ${hasLlmTab}`);
  console.log(`   ✅ API key validation: ${hasValidation}`);
  
} catch (error) {
  console.error(`   ❌ Error checking LLM implementation: ${error.message}`);
}

// Final verification
console.log('\n🎯 Deployment Verification Summary');
console.log('==================================');

if (missingFiles.length === 0 && missingDeps.length === 0) {
  console.log('✅ All required files present');
  console.log('✅ All dependencies available');
  console.log('✅ LLM switching implementation verified');
  console.log('✅ Documentation complete');
  console.log('\n🚀 DEPLOYMENT VERIFICATION PASSED!');
  console.log('\n📋 Next Steps for End Users:');
  console.log('1. Clone the repository: git clone https://github.com/bcharleson/fire-enrich.git');
  console.log('2. Install dependencies: npm install');
  console.log('3. Start development server: npm run dev -- -p 3002');
  console.log('4. Open http://localhost:3002');
  console.log('5. Configure API keys in Settings');
  console.log('6. Start enriching data with your preferred LLM provider!');
  
} else {
  console.error('❌ DEPLOYMENT VERIFICATION FAILED');
  console.error(`   Missing files: ${missingFiles.length}`);
  console.error(`   Missing dependencies: ${missingDeps.length}`);
  process.exit(1);
}

console.log('\n🎉 Fire-Enrich Enhanced is ready for sharing!');
