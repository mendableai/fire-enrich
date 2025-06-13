# Fire Enrich

Transform simple email lists into rich datasets with AI-powered data enrichment.

## What is Fire Enrich?

Fire Enrich is an AI-powered data enrichment tool that transforms basic CSV files containing email addresses into comprehensive business intelligence datasets. Using advanced web scraping and AI extraction, it automatically discovers and structures information about companies, their leadership, funding, technology stack, and much more.

### Technologies Used

- **Firecrawl**: Advanced web scraping and search capabilities
- **OpenAI GPT-4**: Intelligent data extraction and synthesis
- **Next.js**: Modern React framework for the user interface
- **TypeScript**: Type-safe development environment
- **CrewAI**: Python multiagent framework for advanced processing
- **Selenium**: Browser automation for interactive web scraping

## Quick Start

### Option 1: Frontend UI (Recommended)

The easiest way to get started is with the web interface:

1. **Clone this repository**
   ```bash
   git clone https://github.com/RichelynScott/Lead-Enrich.git
   cd Lead-Enrich
   ```

2. **Create environment file with your API keys:**
   ```bash
   cp .env.example .env.local
   ```
   Edit `.env.local` and add your API keys:
   ```
   FIRECRAWL_API_KEY=your_firecrawl_key
   OPENAI_API_KEY=your_openai_key
   ```

3. **Install dependencies and start the frontend:**
   ```bash
   npm install
   npm run dev
   ```

4. **Access the CSV Upload Interface:**
   Open [http://localhost:3000/fire-enrich](http://localhost:3000/fire-enrich) in your browser

5. **Upload and Process Your CSV:**
   - Drag and drop your CSV file with email addresses
   - Select which fields you want to enrich (company info, funding, tech stack, etc.)
   - Watch real-time processing with AI agents
   - Download the enriched results

### Option 2: Python Backend (Advanced Users)

For advanced CSV processing, custom integration, or enhanced lead list processing:

1. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Set up Python environment:**
   ```bash
   cp .env.example .env
   # Edit .env and add your API keys:
   # FIRECRAWL_API_KEY=your_firecrawl_api_key_here
   # OPENAI_API_KEY=your_openai_api_key_here
   ```

3. **Basic Usage:**
   ```python
   from src.lead_enricher import LeadEnricher
   from src.models.schemas import EmailContext, EnrichmentField, FieldType
   
   # Individual email enrichment
   enricher = LeadEnricher()
   result = enricher.enrich_email_sync("contact@example.com", fields)
   
   # CSV batch processing
   result = enricher.enrich_csv('input.csv', 'output.csv')
   ```

4. **Enhanced Lead CSV Processing:**
   ```python
   # Process lead lists with advanced features
   result = enricher.process_lead_csv('leads.csv', 'processed_leads.csv')
   print(f"Decision makers found: {result.decision_makers_found}")
   print(f"Company descriptions created: {result.company_descriptions_created}")
   ```

## Features

### Frontend UI Features
- **Smart Email Detection**: Automatic email column detection and domain extraction
- **Real-time Processing**: Server-Sent Events for live progress updates
- **Flexible Field Selection**: Choose from preset fields or create custom ones
- **Agent-Based Enrichment**: Specialized AI agents for different data types
- **Export Options**: CSV and JSON formats with confidence scores

### Python Backend Features
- **Multiagent Architecture**: 6 specialized AI agents working sequentially
- **Enhanced CSV Processing**: Advanced lead list processing with data cleaning
- **Decision Maker Validation**: Intelligent filtering based on seniority and job titles
- **Company Description Research**: Consolidates keywords with web research
- **Florida Sunbiz Integration**: Interactive business registry lookups
- **Email Research**: Finds missing personal and business emails
- **Hybrid Web Scraping**: Crawl4AI primary with Firecrawl fallback

### Specialized AI Agents

1. **Discovery Agent**: Extracts foundational company information
2. **Company Profile Agent**: Gathers detailed business information
3. **Funding Agent**: Researches investment and funding history
4. **Tech Stack Agent**: Identifies technologies and development tools
5. **Metrics Agent**: Collects business metrics and performance data
6. **General Agent**: Handles custom field extraction requirements

## Enhanced CSV Processing

For processing lead lists with advanced data cleaning and enrichment:

### Input CSV Format
The system expects CSV files with columns like:
- `organization_name`: Company name
- `First_Name`, `Last_Name`: Contact information
- `Seniority`: Seniority level (c_suite, director, entry)
- `Email`, `Personal_Email_1`: Email addresses (may be empty)
- `Linkedin_Url`, `Linkedin_Headline`: LinkedIn information
- `Org_Website_Url`, `Org_Phone`: Company details
- `Org_Keywords_1`, `Org_Keywords_2`: Company keywords

### Data Transformations
- **Column Consolidation**: Combines Org_Keywords into Company_Description
- **Seniority/Title Combination**: Merges Seniority and Job Title
- **Decision Maker Filtering**: Validates and filters for actual decision makers
- **Email Enhancement**: Researches and fills missing email addresses

### Decision Maker Validation Rules
- **C-Suite**: Automatically considered decision makers (confidence 0.9)
- **Director**: Usually decision makers (confidence 0.8)
- **Entry Level**: Only if job title contains ownership/leadership keywords

### Company Description Format
Standardized format examples:
- `"HVAC company that offers services: Air Conditioning, Heating, Ventilation"`
- `"Construction company that offers services: Roofing, Concrete, General Contracting"`
- `"Home Services company that offers services: Plumbing, Electrical, HVAC"`

## Testing and Examples

### Run Tests
```bash
# Test Python imports and functionality
python tests/test_basic_imports.py
python tests/test_enhanced_csv_processing.py

# Test simple enrichment
python tests/test_simple_enrichment.py
```

### Run Examples
```bash
# Basic enrichment example
python examples/example.py

# Enhanced CSV processing example
python examples/example_enhanced_csv.py
```

## API Configuration

### Required API Keys

| Service | Purpose | Get Key |
|---------|---------|---------|
| Firecrawl | Web scraping and content aggregation | [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys) |
| OpenAI | Intelligent data extraction | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |

### Environment Variables
```bash
# Required
FIRECRAWL_API_KEY=your_firecrawl_api_key_here
OPENAI_API_KEY=your_openai_api_key_here

# Optional
OPENAI_MODEL=gpt-4                    # Default: gpt-4
OPENAI_TEMPERATURE=0.1                # Default: 0.1
FIRECRAWL_TIMEOUT=30000              # Default: 30000ms
```

### Alternative: Browser-based API Keys
If you prefer not to use environment variables, Fire Enrich supports entering API keys directly in the browser:
1. Visit the Fire Enrich page
2. Click "Enter API Keys" when prompted
3. Keys are stored securely in localStorage

## Architecture

### Multi-Agent System
Fire Enrich employs a sophisticated orchestration system with specialized extraction modules:

- **Discovery Phase**: Establishes foundation by identifying company and digital presence
- **Profile Extraction**: Specialized logic for industry classification and business model analysis
- **Financial Intelligence**: Targeted searches across venture databases and news sources
- **Technical Analysis**: Deep inspection including HTML parsing and repository analysis
- **Custom Field Handler**: Flexible extraction for any user-defined data points

### Service Layer Architecture
```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend UI   │────▶│   API Routes     │────▶│  Service Layer  │
│  (React/Next)   │     │   (SSE Stream)   │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                           │
                              ┌────────────────────────────┼────────────────────┐
                              │                            │                    │
                    ┌─────────▼────────┐      ┌───────────▼──────┐   ┌─────────▼────────┐
                    │ FirecrawlService │      │  OpenAIService   │   │SpecializedAgents │
                    │  (Web Scraping)  │      │ (GPT-4 Extract)  │   │   (AI Agents)    │
                    └──────────────────┘      └──────────────────┘   └──────────────────┘
```

### Process Flow

1. **Upload & Parse**: Upload CSV with emails, extract company domains
2. **Field Selection**: Choose data points from company descriptions to funding stages
3. **Sequential Agent Execution**: Agents activate in phases, building on previous discoveries
4. **Parallel Searches Per Phase**: Multiple concurrent searches using Firecrawl API
5. **AI Synthesis**: GPT-4 analyzes findings, resolves conflicts, extracts structured data
6. **Real-time Results**: Table populates in real-time with enriched data and source citations

## Example

Here's what Fire Enrich can extract from a simple email address:

**Input**: `contact@stripe.com`

**Output**:
```json
{
  "email": "contact@stripe.com",
  "domain": "stripe.com",
  "company_name": "Stripe",
  "industry": "Financial Technology",
  "description": "Stripe is a technology company that builds economic infrastructure for the internet. Businesses of every size—from new startups to public companies—use our software to accept payments and manage their businesses online.",
  "employee_count": "4,000-8,000",
  "headquarters": "San Francisco, California, United States",
  "founded_year": "2010",
  "website": "https://stripe.com",
  "linkedin": "https://www.linkedin.com/company/stripe",
  "twitter": "https://twitter.com/stripe",
  "funding_stage": "Private",
  "total_funding": "$2.2B",
  "latest_funding_round": "Series H",
  "latest_funding_amount": "$600M",
  "latest_funding_date": "2021-03-14",
  "investors": ["Sequoia Capital", "General Catalyst", "Andreessen Horowitz"],
  "ceo": "Patrick Collison",
  "cto": "David Singleton",
  "tech_stack": ["Ruby", "JavaScript", "Go", "Scala", "React"],
  "confidence_score": 0.95,
  "sources": [
    "https://stripe.com/about",
    "https://www.crunchbase.com/organization/stripe",
    "https://www.linkedin.com/company/stripe"
  ]
}
```

## Configuration & Unlimited Mode

When you clone and run this repository locally, Fire Enrich automatically enables **Unlimited Mode**, removing the restrictions of the public demo. You can configure these limits in `app/fire-enrich/config.ts`:

```typescript
const isUnlimitedMode = process.env.FIRE_ENRICH_UNLIMITED === 'true' || 
                       process.env.NODE_ENV === 'development';

export const FIRE_ENRICH_CONFIG = {
  CSV_LIMITS: {
    MAX_ROWS: isUnlimitedMode ? Infinity : 15,
    MAX_COLUMNS: isUnlimitedMode ? Infinity : 5,
  },
  REQUEST_LIMITS: {
    MAX_FIELDS_PER_ENRICHMENT: isUnlimitedMode ? 50 : 10,
  },
} as const;
```

## Extending Fire Enrich

Fire Enrich is designed to be easily extensible. You can add new data extraction capabilities by defining custom schemas:

```typescript
const customCompanySchema = z.object({
  sustainability_score: z.string().optional(),
  diversity_metrics: z.string().optional(),
  remote_work_policy: z.string().optional(),
  debtFinancing: z.string().optional(),
});
```

**To extend Fire Enrich with new data extraction capabilities:**

1. **Add to existing agent**: Modify the Zod schema in `/lib/agent-architecture/agents/[agent-name].ts`
2. **Create a new agent**: Define a new schema and implement the `AgentBase` interface
3. **Update the orchestrator**: Add routing logic to direct fields to your new agent
4. **Use custom fields**: The General Agent handles any field not covered by specialized agents

The field routing system automatically categorizes user requests:
- Fields with "industry" or "headquarter" → Company Profile Agent
- Fields with "fund" or "invest" → Financial Intel Agent  
- Fields with "employee" or "revenue" → Metrics Agent
- Fields with "tech" and "stack" → Tech Stack Agent
- Everything else → General Purpose Agent

This design allows Fire Enrich to grow with your needs while maintaining type safety and predictable behavior.

### Key Features

-   **Phased Extraction System**: Sequential modules that build context for increasingly accurate results.
-   **Drag & Drop CSV**: Simple, intuitive interface to get started in seconds.
-   **Customizable Fields**: Choose from a list of common data points or generate your own with natural language.
-   **Real-time Streaming**: Watch your data get enriched row-by-row via Server-Sent Events.
-   **Full Source Citations**: Every piece of data is linked back to the URL it was found on, ensuring complete transparency.
-   **Skip Common Providers**: Automatically skips personal emails (Gmail, Yahoo, etc.) to save on API calls and focus on company data.

## Performance & Best Practices

### Performance Optimizations
- Concurrent processing with rate limiting
- Smart caching of search results
- Deduplication of search queries
- 1-second delay between rows (API protection)

### Best Practices
1. **Start Small**: Test with 5-10 rows first
2. **Review Fields**: Ensure fields match your needs
3. **Check Sources**: Verify data accuracy via source URLs
4. **Monitor Progress**: Watch for errors or timeouts
5. **Export Regularly**: Download results as you go

### Rate Limits
- **Firecrawl**: Check your plan limits
- **OpenAI**: GPT-4 token limits apply
- **Processing**: 1 row per second default
- **Max Fields**: 10 per enrichment (configurable)

## Troubleshooting

### Common Issues

1. **"No API Keys Found"**
   - Check environment variables
   - Try browser-based key entry
   - Verify key validity

2. **Slow Enrichment**
   - Normal: ~5-15 seconds per row
   - Check API rate limits
   - Consider traditional mode

3. **Missing Data**
   - Some companies have limited online presence
   - Check confidence scores
   - Review source URLs

4. **Export Issues**
   - Ensure enrichment is complete
   - Check browser console for errors
   - Try different export format

## Privacy & Security

- **Local Storage**: API keys stored client-side only
- **No Data Retention**: Processed data not stored server-side
- **Secure Transmission**: HTTPS for all requests
- **Source Transparency**: All data sources tracked

## Dependencies

### Frontend Dependencies
- Node.js 18+ and npm/yarn/pnpm
- Next.js 15.3.2
- React 19
- TypeScript 5.x
- Tailwind CSS
- Radix UI components

### Python Backend Dependencies
- Python 3.12+
- CrewAI multiagent framework
- Selenium for browser automation
- Pandas for CSV processing
- Pydantic for data validation
- Additional dependencies in `requirements.txt`

## Our Open Source Philosophy

Let's be blunt: professional data enrichment services are expensive for a reason. Our goal with Fire Enrich isn't to replicate every feature of mature platforms overnight. Instead, we want to build a powerful, open-source foundation that anyone can use, understand, and contribute to.

This is just the start. By open-sourcing it, we're inviting you to join us on this journey.

-   **Add a new agent?** Fork the repo and show us what you've got.
-   **Improve a data extraction prompt?** Open a pull request.
-   **Have a new feature idea?** Start a discussion in the issues.

We believe that by building in public, we can create a tool that is more accessible, affordable, and adaptable, thanks to the collective intelligence of the open-source community.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

We welcome contributions! Please feel free to submit a Pull Request.

## Support

For questions and issues, please open an issue in this repository.
