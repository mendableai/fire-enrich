#!/usr/bin/env python3
"""
Example usage of the Lead Enricher Python implementation using CrewAI.
"""

import os
from dotenv import load_dotenv
from src.lead_enricher import LeadEnricher
from src.models.schemas import EnrichmentField, FieldType

def main():
    """Example usage of the Lead Enricher."""
    
    load_dotenv()
    
    if not os.getenv("OPENAI_API_KEY"):
        print("Error: OPENAI_API_KEY environment variable is required")
        print("Please set it in your .env file or environment")
        return
    
    if not os.getenv("FIRECRAWL_API_KEY"):
        print("Error: FIRECRAWL_API_KEY environment variable is required")
        print("Please set it in your .env file or environment")
        return
    
    enricher = LeadEnricher()
    
    fields = [
        EnrichmentField(
            name="company_name",
            type=FieldType.DISCOVERY,
            description="The official name of the company",
            required=True
        ),
        EnrichmentField(
            name="industry",
            type=FieldType.COMPANY_PROFILE,
            description="The industry or sector the company operates in",
            required=True
        ),
        EnrichmentField(
            name="employee_count",
            type=FieldType.COMPANY_PROFILE,
            description="Number of employees at the company",
            required=False
        ),
        EnrichmentField(
            name="funding_info",
            type=FieldType.FUNDING,
            description="Information about company funding and investors",
            required=False
        ),
        EnrichmentField(
            name="tech_stack",
            type=FieldType.TECH_STACK,
            description="Technologies and programming languages used",
            required=False
        )
    ]
    
    test_email = "contact@example.com"
    
    print(f"Enriching email: {test_email}")
    print("This may take a few minutes as agents research the company...")
    print("-" * 50)
    
    try:
        result = enricher.enrich_email_sync(test_email, fields)
        
        print(f"Email: {result.email}")
        print(f"Domain: {result.domain}")
        print(f"Overall Confidence: {result.overall_confidence:.2f}")
        print(f"Processing Time: {result.processing_time:.2f} seconds")
        print()
        
        if result.discovery:
            print("=== DISCOVERY RESULTS ===")
            print(f"Company Name: {result.discovery.company_name}")
            print(f"Website: {result.discovery.website}")
            print(f"Description: {result.discovery.description}")
            print(f"Confidence: {result.discovery.confidence_score:.2f}")
            print()
        
        if result.company_profile:
            print("=== COMPANY PROFILE RESULTS ===")
            print(f"Industry: {result.company_profile.industry}")
            print(f"Company Size: {result.company_profile.company_size}")
            print(f"Headquarters: {result.company_profile.headquarters}")
            print(f"Founded: {result.company_profile.founded_year}")
            print(f"Key People: {', '.join(result.company_profile.key_people)}")
            print(f"Confidence: {result.company_profile.confidence_score:.2f}")
            print()
        
        if result.funding:
            print("=== FUNDING RESULTS ===")
            print(f"Total Funding: {result.funding.total_funding}")
            print(f"Last Round: {result.funding.last_funding_round}")
            print(f"Last Amount: {result.funding.last_funding_amount}")
            print(f"Investors: {', '.join(result.funding.investors)}")
            print(f"Confidence: {result.funding.confidence_score:.2f}")
            print()
        
        if result.tech_stack:
            print("=== TECH STACK RESULTS ===")
            print(f"Languages: {', '.join(result.tech_stack.programming_languages)}")
            print(f"Frameworks: {', '.join(result.tech_stack.frameworks)}")
            print(f"Databases: {', '.join(result.tech_stack.databases)}")
            print(f"Cloud Services: {', '.join(result.tech_stack.cloud_services)}")
            print(f"Confidence: {result.tech_stack.confidence_score:.2f}")
            print()
        
        if result.metrics:
            print("=== METRICS RESULTS ===")
            print(f"Revenue: {result.metrics.revenue}")
            print(f"Employee Count: {result.metrics.employee_count}")
            print(f"Growth Rate: {result.metrics.growth_rate}")
            print(f"Valuation: {result.metrics.valuation}")
            print(f"Confidence: {result.metrics.confidence_score:.2f}")
            print()
        
        if result.errors:
            print("=== ERRORS ===")
            for error in result.errors:
                print(f"- {error}")
            print()
        
        print("Enrichment completed successfully!")
        
    except Exception as e:
        print(f"Error during enrichment: {e}")
        return

if __name__ == "__main__":
    main()
