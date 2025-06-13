#!/usr/bin/env python3
"""
Simple test to verify the Lead Enricher works without requiring API keys.
This tests the structure and import flow without making actual API calls.
"""

import os
from src.models.schemas import EnrichmentField, FieldType
from src.lead_enricher import LeadEnricher

def test_enricher_initialization():
    """Test that the enricher can be initialized properly."""
    print("Testing LeadEnricher initialization...")
    
    os.environ["OPENAI_API_KEY"] = "test-key"
    os.environ["FIRECRAWL_API_KEY"] = "test-key"
    
    try:
        enricher = LeadEnricher()
        print("✓ LeadEnricher initialized successfully")
        return True
    except Exception as e:
        print(f"❌ LeadEnricher initialization failed: {e}")
        return False

def test_field_categorization():
    """Test field categorization logic."""
    print("Testing field categorization...")
    
    os.environ["OPENAI_API_KEY"] = "test-key"
    os.environ["FIRECRAWL_API_KEY"] = "test-key"
    
    enricher = LeadEnricher()
    
    fields = [
        EnrichmentField(
            name="company_name",
            type=FieldType.DISCOVERY,
            description="Company name",
            required=True
        ),
        EnrichmentField(
            name="industry",
            type=FieldType.COMPANY_PROFILE,
            description="Industry",
            required=True
        ),
        EnrichmentField(
            name="funding",
            type=FieldType.FUNDING,
            description="Funding info",
            required=False
        )
    ]
    
    try:
        categorized = enricher._categorize_fields(fields)
        
        assert len(categorized[FieldType.DISCOVERY]) == 1
        assert len(categorized[FieldType.COMPANY_PROFILE]) == 1
        assert len(categorized[FieldType.FUNDING]) == 1
        assert len(categorized[FieldType.TECH_STACK]) == 0
        
        print("✓ Field categorization working correctly")
        return True
    except Exception as e:
        print(f"❌ Field categorization failed: {e}")
        return False

def test_domain_extraction():
    """Test email domain extraction."""
    print("Testing domain extraction...")
    
    os.environ["OPENAI_API_KEY"] = "test-key"
    os.environ["FIRECRAWL_API_KEY"] = "test-key"
    
    enricher = LeadEnricher()
    
    test_cases = [
        ("contact@example.com", "example.com"),
        ("hello@stripe.com", "stripe.com"),
        ("info@COMPANY.COM", "company.com")
    ]
    
    try:
        for email, expected_domain in test_cases:
            domain = enricher._extract_domain_from_email(email)
            assert domain == expected_domain, f"Expected {expected_domain}, got {domain}"
        
        print("✓ Domain extraction working correctly")
        return True
    except Exception as e:
        print(f"❌ Domain extraction failed: {e}")
        return False

def main():
    """Run all tests."""
    print("🧪 Running Lead Enricher Structure Tests")
    print("=" * 50)
    
    tests = [
        test_enricher_initialization,
        test_field_categorization,
        test_domain_extraction
    ]
    
    passed = 0
    total = len(tests)
    
    for test in tests:
        if test():
            passed += 1
        print()
    
    print("=" * 50)
    print(f"Tests passed: {passed}/{total}")
    
    if passed == total:
        print("🎉 All structure tests passed!")
        print("The Python implementation is ready for use.")
        return True
    else:
        print("❌ Some tests failed. Please check the implementation.")
        return False

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
