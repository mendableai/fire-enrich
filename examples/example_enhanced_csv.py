#!/usr/bin/env python3
"""
Example usage of enhanced CSV processing for lead lists.
"""

import os
from dotenv import load_dotenv
from src.lead_enricher import LeadEnricher

load_dotenv()

def main():
    """Demonstrate enhanced CSV processing functionality."""
    
    print("🔍 Enhanced Lead CSV Processing Example")
    print("=" * 50)
    
    enricher = LeadEnricher()
    
    sample_csv_path = '/home/ubuntu/attachments/124c9a24-625f-4881-9b04-c9ef66fdf71f/sample_leads.csv'
    output_path = 'processed_leads.csv'
    
    print(f"Input file: {sample_csv_path}")
    print(f"Output file: {output_path}")
    print()
    
    try:
        print("🚀 Processing lead CSV with enhanced functionality...")
        result = enricher.process_lead_csv(sample_csv_path, output_path)
        
        print("✅ Processing completed successfully!")
        print()
        print("📊 Results Summary:")
        print(f"  Total rows processed: {result.total_rows}")
        print(f"  Decision makers identified: {result.decision_makers_found}")
        print(f"  Emails researched: {result.emails_researched}")
        print(f"  Company descriptions created: {result.company_descriptions_created}")
        print(f"  Sunbiz lookups performed: {result.sunbiz_lookups}")
        print()
        
        print("🎯 Decision Maker Analysis:")
        for i, validation in enumerate(result.validation_results[:5]):
            person_name = f"{result.results[i].first_name} {result.results[i].last_name}" if i < len(result.results) else "Unknown"
            status = "✓ Decision Maker" if validation.is_decision_maker else "✗ Not Decision Maker"
            print(f"  {person_name}: {status} (Confidence: {validation.confidence_score:.2f})")
        
        if len(result.validation_results) > 5:
            print(f"  ... and {len(result.validation_results) - 5} more validations")
        
        print()
        print("🏢 Sample Company Descriptions:")
        decision_makers = [r for r in result.results if r.is_decision_maker and r.company_description]
        for dm in decision_makers[:3]:
            print(f"  {dm.organization_name}: {dm.company_description}")
        
        if result.errors:
            print()
            print("⚠️  Errors encountered:")
            for error in result.errors[:3]:
                print(f"  - {error}")
            if len(result.errors) > 3:
                print(f"  ... and {len(result.errors) - 3} more errors")
        
        print()
        print(f"📄 Enhanced lead data saved to: {output_path}")
        
    except Exception as e:
        print(f"❌ Error processing CSV: {e}")

if __name__ == "__main__":
    main()
