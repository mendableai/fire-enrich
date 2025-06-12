# 🚀 Fire-Enrich with Multi-LLM Support - Deployment Guide

## 🎯 Overview

This enhanced version of Fire-Enrich includes comprehensive **Multi-LLM Provider Support**, allowing users to switch between different AI providers (OpenAI, Anthropic, DeepSeek, Grok) seamlessly through an intuitive UI.

## ✨ New Features

### 🔄 LLM Provider Switching
- **4 Supported Providers**: OpenAI, Anthropic, DeepSeek, Grok (xAI)
- **Multiple Models**: Each provider offers multiple model options
- **Real-time Switching**: Change providers without restarting the application
- **Persistent Selection**: Your choice is saved locally and persists between sessions

### 🔐 Enhanced API Key Management
- **Secure Local Storage**: API keys stored locally in your browser
- **User-Friendly Interface**: Tabbed settings modal for easy management
- **API Key Validation**: Test your keys before saving
- **Visual Indicators**: Clear status indicators for each provider
- **Bulk Management**: Clear all keys with one click

### 🎨 Improved User Interface
- **Settings Modal**: Professional tabbed interface for configuration
- **LLM Switcher**: Header component showing current model with easy switching
- **Responsive Design**: Works seamlessly on desktop and mobile
- **Professional Animations**: Smooth, centered modal animations

## 🛠 Quick Setup for End Users

### 1. Clone and Install
```bash
git clone https://github.com/bcharleson/fire-enrich.git
cd fire-enrich/fire-enrich
npm install
```

### 2. Start the Application
```bash
npm run dev -- -p 3002
```
The application will be available at `http://localhost:3002`

### 3. Configure API Keys
1. Click the **Settings** button in the top-right corner
2. Go to the **API Keys** tab
3. Add your API keys for the providers you want to use:
   - **Firecrawl API Key** (Required) - Get from [firecrawl.dev](https://firecrawl.dev)
   - **OpenAI API Key** (Required) - Get from [platform.openai.com](https://platform.openai.com)
   - **Anthropic API Key** (Optional) - Get from [console.anthropic.com](https://console.anthropic.com)
   - **DeepSeek API Key** (Optional) - Get from [platform.deepseek.com](https://platform.deepseek.com)
   - **Grok API Key** (Optional) - Get from [console.x.ai](https://console.x.ai)
4. Test each key using the **Test** button
5. Click **Save Settings**

### 4. Select Your LLM Provider
1. Go to the **LLM Settings** tab in the Settings modal
2. Choose your preferred **LLM Provider**
3. Select the **Model** you want to use
4. Click **Save Settings**

### 5. Start Enriching Data
1. Navigate to the **Fire-Enrich** page
2. Upload your CSV file
3. Configure your enrichment fields
4. The system will use your selected LLM provider for enrichment

## 🔧 Supported LLM Providers & Models

### OpenAI
- **GPT-4o** - Most capable model
- **GPT-4o Mini** - Fast and efficient
- **GPT-4 Turbo** - High performance

### Anthropic
- **Claude 3.5 Sonnet** - Most capable Claude model
- **Claude 3 Haiku** - Fast and efficient

### DeepSeek
- **DeepSeek Chat** - General purpose model
- **DeepSeek Coder** - Optimized for coding

### Grok (xAI)
- **Grok 3 Mini** - Fast and efficient (Default)
- **Grok Beta** - Latest experimental model

## 🔒 Security & Privacy

- **Local Storage Only**: API keys are stored locally in your browser
- **No Server Storage**: Keys are never sent to or stored on external servers
- **Secure Transmission**: Keys are only used for direct API calls to providers
- **Easy Cleanup**: Clear all stored data with one click

## 🎯 For Developers

### Architecture Overview
- **Modular Design**: Each LLM provider has its own service class
- **Unified Interface**: Common interface for all providers
- **Type Safety**: Full TypeScript support
- **Error Handling**: Comprehensive error handling and fallbacks

### Key Components
- `components/settings-modal.tsx` - Main settings interface
- `components/llm-switcher.tsx` - LLM selection component
- `lib/llm-manager.ts` - LLM provider management
- `lib/api-key-manager.ts` - API key storage and validation
- `lib/services/` - Individual provider service implementations

### Testing
Run the automated test suite:
```bash
node scripts/test-llm-switching.js
```

## 🚀 Production Deployment

### Environment Variables (Optional)
You can still use environment variables for API keys:
```bash
FIRECRAWL_API_KEY=your_firecrawl_key
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
DEEPSEEK_API_KEY=your_deepseek_key
GROK_API_KEY=your_grok_key
```

### Build for Production
```bash
npm run build
npm start
```

## 🤝 Contributing

This enhanced version is ready for contribution back to the main fire-enrich repository. The implementation includes:

- ✅ Comprehensive documentation
- ✅ Type safety and error handling
- ✅ User-friendly interface
- ✅ Backward compatibility
- ✅ Production-ready code quality

## 📞 Support

For issues or questions about the LLM switching functionality:
1. Check the existing documentation in the `docs/` folder
2. Run the test suite to verify your setup
3. Review the implementation summary in `IMPLEMENTATION_SUMMARY.md`

---

**Enjoy the enhanced Fire-Enrich experience with multi-LLM support! 🎉**
