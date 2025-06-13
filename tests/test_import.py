#!/usr/bin/env python3
"""
Test script to verify all imports work correctly.
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_imports():
    """Test all imports to ensure the Python implementation works."""
    
    try:
        print("Testing schema imports...")
        from src.models.schemas import EnrichmentField, FieldType, EmailContext
        print("✓ Schemas imported successfully")
        
        print("Testing agent imports...")
        from src.agents.discovery_agent import create_discovery_agent
        from src.agents.company_profile_agent import create_company_profile_agent
        from src.agents.funding_agent import create_funding_agent
        from src.agents.tech_stack_agent import create_tech_stack_agent
        from src.agents.metrics_agent import create_metrics_agent
        from src.agents.general_agent import create_general_agent
        print("✓ All agents imported successfully")
        
        print("Testing task imports...")
        from src.tasks.enrichment_tasks import (
            create_discovery_task, create_company_profile_task,
            create_funding_task, create_tech_stack_task,
            create_metrics_task, create_general_task
        )
        print("✓ All tasks imported successfully")
        
        print("Testing main enricher import...")
        from src.lead_enricher import LeadEnricher
        print("✓ Lead enricher imported successfully")
        
        print("\n🎉 All imports working correctly!")
        print("The Python implementation is ready to use.")
        
        return True
        
    except ImportError as e:
        print(f"❌ Import error: {e}")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False

if __name__ == "__main__":
    success = test_imports()
    sys.exit(0 if success else 1)
