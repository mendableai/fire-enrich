#!/usr/bin/env python3
"""
Test enhanced CSV processing functionality with sample lead data.
"""

import os
import pandas as pd
from src.models.schemas import LeadCSVRow, DecisionMakerValidation, LeadProcessingResult
from src.lead_enricher import LeadEnricher

def test_lead_csv_row_creation():
    """Test LeadCSVRow model creation with sample data."""
    print("Testing LeadCSVRow creation...")
    
    try:
        sample_data = {
            "organization_name": "Absolute Aluminum, Inc.",
            "First_Name": "Dale",
            "Last_Name": "Desjardins", 
            "Seniority": "c_suite",
            "Email": "ddesjardins@absolutealuminum.com",
            "Personal_Email_1": None,
            "Linkedin_Url": "http://www.linkedin.com/in/absolutealuminum",
            "Linkedin_Headline": "Experienced CEO of Absolute Aluminum",
            "Organization_Linkedin_Url": "http://www.linkedin.com/company/absolute-aluminum-inc.",
            "Org_Website_Url": "http://www.absolutealuminum.com",
            "Org_Phone": "+1 941-497-7777",
            "Org_Keywords_1": None,
            "Org_Keywords_2": None
        }
        
        lead_row = LeadCSVRow(**sample_data)
        
        assert lead_row.organization_name == "Absolute Aluminum, Inc."
        assert lead_row.seniority == "c_suite"
        assert lead_row.email == "ddesjardins@absolutealuminum.com"
        
        print("✓ LeadCSVRow creation successful")
        return True
        
    except Exception as e:
        print(f"❌ LeadCSVRow creation failed: {e}")
        return False

def test_decision_maker_validation():
    """Test decision maker validation logic."""
    print("Testing decision maker validation...")
    
    os.environ["OPENAI_API_KEY"] = "test-key"
    os.environ["FIRECRAWL_API_KEY"] = "test-key"
    
    try:
        enricher = LeadEnricher()
        
        c_suite_row = LeadCSVRow(
            organization_name="Test Company",
            First_Name="John",
            Last_Name="Doe",
            Seniority="c_suite",
            Linkedin_Headline="CEO at Test Company"
        )
        
        validation = enricher._validate_decision_maker(c_suite_row)
        assert validation.is_decision_maker == True
        assert validation.confidence_score >= 0.8
        
        entry_row = LeadCSVRow(
            organization_name="Test Company",
            First_Name="Jane",
            Last_Name="Smith", 
            Seniority="entry",
            Linkedin_Headline="Junior Analyst"
        )
        
        validation = enricher._validate_decision_maker(entry_row)
        assert validation.is_decision_maker == False
        
        entry_owner_row = LeadCSVRow(
            organization_name="Test Company",
            First_Name="Bob",
            Last_Name="Owner", 
            Seniority="entry",
            Linkedin_Headline="Owner at Test Company"
        )
        
        validation = enricher._validate_decision_maker(entry_owner_row)
        assert validation.is_decision_maker == True
        
        print("✓ Decision maker validation working correctly")
        return True
        
    except Exception as e:
        print(f"❌ Decision maker validation failed: {e}")
        return False

def test_company_description_consolidation():
    """Test company description consolidation logic."""
    print("Testing company description consolidation...")
    
    os.environ["OPENAI_API_KEY"] = "test-key"
    os.environ["FIRECRAWL_API_KEY"] = "test-key"
    
    try:
        enricher = LeadEnricher()
        
        hvac_row = LeadCSVRow(
            organization_name="AC America",
            First_Name="Test",
            Last_Name="User",
            Seniority="c_suite",
            Org_Keywords_1="hvac",
            Org_Keywords_2="air conditioning"
        )
        
        description = enricher._consolidate_company_description(hvac_row)
        assert "HVAC" in description
        assert "hvac" in description.lower()
        
        no_keywords_row = LeadCSVRow(
            organization_name="Generic Company",
            First_Name="Test",
            Last_Name="User",
            Seniority="c_suite"
        )
        
        description = enricher._consolidate_company_description(no_keywords_row)
        assert "Generic Company" in description
        assert "Business services" in description
        
        print("✓ Company description consolidation working correctly")
        return True
        
    except Exception as e:
        print(f"❌ Company description consolidation failed: {e}")
        return False

def test_sample_csv_processing():
    """Test processing the actual sample CSV file."""
    print("Testing sample CSV processing...")
    
    try:
        sample_csv_path = '/home/ubuntu/attachments/124c9a24-625f-4881-9b04-c9ef66fdf71f/sample_leads.csv'
        
        if not os.path.exists(sample_csv_path):
            print("❌ Sample CSV file not found")
            return False
        
        os.environ["OPENAI_API_KEY"] = "test-key"
        os.environ["FIRECRAWL_API_KEY"] = "test-key"
        
        enricher = LeadEnricher()
        result = enricher.process_lead_csv(sample_csv_path)
        
        assert result.total_rows > 0
        assert result.decision_makers_found > 0
        assert len(result.results) <= result.total_rows
        
        decision_makers = [r for r in result.results if r.is_decision_maker]
        assert len(decision_makers) == result.decision_makers_found
        
        for dm in decision_makers:
            assert dm.company_description is not None
            assert dm.seniority_title is not None
        
        print(f"✓ Sample CSV processing successful")
        print(f"  Total rows: {result.total_rows}")
        print(f"  Processed rows: {result.processed_rows}")
        print(f"  Decision makers found: {result.decision_makers_found}")
        print(f"  Company descriptions created: {result.company_descriptions_created}")
        print(f"  Emails researched: {result.emails_researched}")
        
        return True
        
    except Exception as e:
        print(f"❌ Sample CSV processing failed: {e}")
        return False

def main():
    """Run all enhanced CSV processing tests."""
    print("🧪 Testing Enhanced CSV Processing Functionality")
    print("=" * 60)
    
    tests = [
        test_lead_csv_row_creation,
        test_decision_maker_validation,
        test_company_description_consolidation,
        test_sample_csv_processing
    ]
    
    passed = 0
    total = len(tests)
    
    for test in tests:
        if test():
            passed += 1
        print()
    
    print("=" * 60)
    print(f"Tests passed: {passed}/{total}")
    
    if passed == total:
        print("🎉 All enhanced CSV processing tests passed!")
        return True
    else:
        print("❌ Some tests failed. Check the implementation.")
        return False

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
