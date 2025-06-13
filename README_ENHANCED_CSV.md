# Enhanced CSV Processing for Lead Lists

This document describes the enhanced CSV processing functionality added to the Lead-Enrich system for handling specific lead list formats with advanced data cleaning and enrichment capabilities.

## Features

### 1. Advanced Lead CSV Processing
- **Specialized Models**: `LeadCSVRow` model designed for the specific lead list format
- **Decision Maker Validation**: Intelligent validation based on seniority levels and job titles
- **Company Description Research**: Consolidates Org_Keywords and researches company descriptions
- **Email Research**: Finds missing personal and business emails through web research
- **Florida Sunbiz Integration**: Business registry lookup for Florida companies

### 2. Data Transformations
- **Column Consolidation**: Combines Org_Keywords_1 and Org_Keywords_2 into Company_Description
- **Seniority/Title Combination**: Merges Seniority and Job Title into single field
- **Decision Maker Filtering**: Validates and filters for actual decision makers
- **Email Enhancement**: Researches and fills missing email addresses

### 3. Decision Maker Validation Rules
- **C-Suite**: Automatically considered decision makers (confidence 0.9)
- **Director**: Usually decision makers (confidence 0.8)
- **Entry Level**: Only if job title contains ownership/leadership keywords (variable confidence)

## Usage

### Basic CSV Processing
```python
from src.lead_enricher import LeadEnricher

enricher = LeadEnricher()
result = enricher.process_lead_csv('input_leads.csv', 'output_leads.csv')

print(f"Decision makers found: {result.decision_makers_found}")
print(f"Company descriptions created: {result.company_descriptions_created}")
print(f"Emails researched: {result.emails_researched}")
```

### Async Processing
```python
import asyncio
from src.lead_enricher import LeadEnricher

async def process_leads():
    enricher = LeadEnricher()
    result = await enricher.process_lead_csv_async('input_leads.csv', 'output_leads.csv')
    return result

result = asyncio.run(process_leads())
```

## Input CSV Format

The system expects CSV files with the following columns:
- `organization_name`: Company name
- `First_Name`: Contact's first name
- `Last_Name`: Contact's last name
- `Seniority`: Seniority level (c_suite, director, entry)
- `Email`: Business email (may be empty)
- `Personal_Email_1`: Personal email (may be empty)
- `Linkedin_Url`: LinkedIn profile URL
- `Linkedin_Headline`: Job title from LinkedIn
- `Organization_Linkedin_Url`: Company LinkedIn URL
- `Org_Website_Url`: Company website
- `Org_Phone`: Company phone number
- `Org_Keywords_1`: First set of company keywords
- `Org_Keywords_2`: Second set of company keywords
- `Ice_Breaker`: Ice breaker information

## Output Enhancements

The processed CSV includes additional fields:
- `Company_Description`: Consolidated and researched company description
- `Seniority_Title`: Combined seniority and job title
- `Is_Decision_Maker`: Boolean indicating decision maker status
- Enhanced email fields with researched addresses

## Company Description Format

Company descriptions follow a standardized format:
- `"HVAC company that offers services: Air Conditioning, Heating, Ventilation"`
- `"Construction company that offers services: Roofing, Concrete, General Contracting"`
- `"Home services company that offers services: Plumbing, Electrical, HVAC"`

## Florida Sunbiz Integration

For companies with "FL" or "Florida" indicators, the system performs business registry lookups:
- Uses headless browser automation with Selenium
- Searches by company name in Florida business registry
- Extracts relevant business registration information
- Stores results in `sunbiz_data` field

## Testing

Run the enhanced CSV processing tests:
```bash
python test_enhanced_csv_processing.py
```

Run the example with sample data:
```bash
python example_enhanced_csv.py
```

## Dependencies

Additional dependencies for enhanced CSV processing:
- `selenium>=4.15.0`: For Florida Sunbiz web scraping
- `webdriver-manager>=4.0.0`: For Chrome driver management
- `pandas>=2.0.0`: For CSV processing and data manipulation

## Error Handling

The system includes comprehensive error handling:
- Individual row processing errors are captured and reported
- Failed Sunbiz lookups are logged but don't stop processing
- Email research failures are handled gracefully
- Validation errors are tracked and reported in results

## Performance Considerations

- Processing is optimized to only enrich decision makers
- Email research is only performed when emails are missing
- Sunbiz lookups are only performed for Florida companies
- Batch processing minimizes API calls and external requests
