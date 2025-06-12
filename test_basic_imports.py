#!/usr/bin/env python3
"""
Basic import test to verify all dependencies are working correctly.
"""

import sys
print('Python version:', sys.version)
print('Python path:', sys.path[:3])

try:
    from crewai import Agent, Task, Crew, Process
    print('✓ CrewAI core imports successful')
except Exception as e:
    print('❌ CrewAI import error:', e)

try:
    from crewai_tools import FirecrawlScrapeWebsiteTool, FirecrawlSearchTool
    print('✓ CrewAI tools imports successful')
except Exception as e:
    print('❌ CrewAI tools import error:', e)

try:
    from src.models.schemas import EmailContext, EnrichmentField, FieldType
    print('✓ Schema imports successful')
except Exception as e:
    print('❌ Schema import error:', e)

try:
    from src.agents.discovery_agent import create_discovery_agent
    print('✓ Discovery agent import successful')
except Exception as e:
    print('❌ Discovery agent import error:', e)

try:
    from src.lead_enricher import LeadEnricher
    print('✓ Lead enricher import successful')
except Exception as e:
    print('❌ Lead enricher import error:', e)

print('\n🎯 Basic import test completed!')
