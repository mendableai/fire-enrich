import os
import time
from typing import List, Optional
from dotenv import load_dotenv
from crewai import Crew, Process

from .models.schemas import (
    EmailContext, EnrichmentField, EnrichmentResult, FieldType,
    DiscoveryResult, CompanyProfileResult, FundingResult, 
    TechStackResult, MetricsResult, GeneralResult
)
from .agents.discovery_agent import create_discovery_agent
from .agents.company_profile_agent import create_company_profile_agent
from .agents.funding_agent import create_funding_agent
from .agents.tech_stack_agent import create_tech_stack_agent
from .agents.metrics_agent import create_metrics_agent
from .agents.general_agent import create_general_agent
from .tasks.enrichment_tasks import (
    create_discovery_task, create_company_profile_task, create_funding_task,
    create_tech_stack_task, create_metrics_task, create_general_task
)

load_dotenv()

class LeadEnricher:
    """Main class for enriching email data using CrewAI multiagent framework."""
    
    def __init__(self):
        """Initialize the Lead Enricher with required API keys."""
        self.openai_api_key = os.getenv("OPENAI_API_KEY")
        self.firecrawl_api_key = os.getenv("FIRECRAWL_API_KEY")
        
        if not self.openai_api_key:
            raise ValueError("OPENAI_API_KEY environment variable is required")
        if not self.firecrawl_api_key:
            raise ValueError("FIRECRAWL_API_KEY environment variable is required")
    
    def _extract_domain_from_email(self, email: str) -> str:
        """Extract domain from email address."""
        return email.split('@')[1].lower()
    
    def _categorize_fields(self, fields: List[EnrichmentField]) -> dict:
        """Categorize fields by agent type."""
        categorized = {
            FieldType.DISCOVERY: [],
            FieldType.COMPANY_PROFILE: [],
            FieldType.FUNDING: [],
            FieldType.TECH_STACK: [],
            FieldType.METRICS: [],
            FieldType.GENERAL: []
        }
        
        for field in fields:
            categorized[field.type].append(field)
        
        return categorized
    
    def _build_context_string(self, results: dict) -> str:
        """Build context string from previous agent results."""
        context_parts = []
        
        if results.get('discovery'):
            discovery = results['discovery']
            context_parts.append(f"Company: {discovery.company_name}")
            if discovery.website:
                context_parts.append(f"Website: {discovery.website}")
            if discovery.description:
                context_parts.append(f"Description: {discovery.description}")
        
        if results.get('company_profile'):
            profile = results['company_profile']
            if profile.industry:
                context_parts.append(f"Industry: {profile.industry}")
            if profile.company_size:
                context_parts.append(f"Size: {profile.company_size}")
        
        return "\n".join(context_parts)
    
    async def enrich_email(self, email: str, fields: List[EnrichmentField]) -> EnrichmentResult:
        """
        Enrich an email with company data using the specified fields.
        
        Args:
            email: Email address to enrich
            fields: List of fields to extract
            
        Returns:
            EnrichmentResult with extracted data
        """
        start_time = time.time()
        domain = self._extract_domain_from_email(email)
        
        email_context = EmailContext(
            email=email,
            domain=domain,
            fields=fields
        )
        
        categorized_fields = self._categorize_fields(fields)
        results = {}
        errors = []
        
        try:
            if categorized_fields[FieldType.DISCOVERY] or any(categorized_fields.values()):
                discovery_agent = create_discovery_agent()
                discovery_task = create_discovery_task(email_context)
                
                discovery_crew = Crew(
                    agents=[discovery_agent],
                    tasks=[discovery_task],
                    process=Process.sequential,
                    verbose=True
                )
                
                discovery_result = discovery_crew.kickoff()
                results['discovery'] = discovery_result
            
            context = self._build_context_string(results)
            
            if categorized_fields[FieldType.COMPANY_PROFILE]:
                profile_agent = create_company_profile_agent()
                profile_task = create_company_profile_task(email_context, context)
                
                profile_crew = Crew(
                    agents=[profile_agent],
                    tasks=[profile_task],
                    process=Process.sequential,
                    verbose=True
                )
                
                profile_result = profile_crew.kickoff()
                results['company_profile'] = profile_result
                context = self._build_context_string(results)
            
            if categorized_fields[FieldType.FUNDING]:
                funding_agent = create_funding_agent()
                funding_task = create_funding_task(email_context, context)
                
                funding_crew = Crew(
                    agents=[funding_agent],
                    tasks=[funding_task],
                    process=Process.sequential,
                    verbose=True
                )
                
                funding_result = funding_crew.kickoff()
                results['funding'] = funding_result
                context = self._build_context_string(results)
            
            if categorized_fields[FieldType.TECH_STACK]:
                tech_agent = create_tech_stack_agent()
                tech_task = create_tech_stack_task(email_context, context)
                
                tech_crew = Crew(
                    agents=[tech_agent],
                    tasks=[tech_task],
                    process=Process.sequential,
                    verbose=True
                )
                
                tech_result = tech_crew.kickoff()
                results['tech_stack'] = tech_result
                context = self._build_context_string(results)
            
            if categorized_fields[FieldType.METRICS]:
                metrics_agent = create_metrics_agent()
                metrics_task = create_metrics_task(email_context, context)
                
                metrics_crew = Crew(
                    agents=[metrics_agent],
                    tasks=[metrics_task],
                    process=Process.sequential,
                    verbose=True
                )
                
                metrics_result = metrics_crew.kickoff()
                results['metrics'] = metrics_result
                context = self._build_context_string(results)
            
            if categorized_fields[FieldType.GENERAL]:
                general_agent = create_general_agent()
                general_task = create_general_task(email_context, categorized_fields[FieldType.GENERAL], context)
                
                general_crew = Crew(
                    agents=[general_agent],
                    tasks=[general_task],
                    process=Process.sequential,
                    verbose=True
                )
                
                general_result = general_crew.kickoff()
                results['general'] = general_result
        
        except Exception as e:
            errors.append(f"Error during enrichment: {str(e)}")
        
        confidence_scores = []
        for result in results.values():
            if hasattr(result, 'confidence_score'):
                confidence_scores.append(result.confidence_score)
        
        overall_confidence = sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0.0
        processing_time = time.time() - start_time
        
        return EnrichmentResult(
            email=email,
            domain=domain,
            discovery=results.get('discovery'),
            company_profile=results.get('company_profile'),
            funding=results.get('funding'),
            tech_stack=results.get('tech_stack'),
            metrics=results.get('metrics'),
            general=results.get('general'),
            overall_confidence=overall_confidence,
            processing_time=processing_time,
            errors=errors
        )
    
    def enrich_email_sync(self, email: str, fields: List[EnrichmentField]) -> EnrichmentResult:
        """
        Synchronous version of enrich_email for easier usage.
        
        Args:
            email: Email address to enrich
            fields: List of fields to extract
            
        Returns:
            EnrichmentResult with extracted data
        """
        import asyncio
        return asyncio.run(self.enrich_email(email, fields))
