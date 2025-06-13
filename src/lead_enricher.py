import os
import time
from typing import List, Optional
from dotenv import load_dotenv
from crewai import Crew, Process

from .models.schemas import (
    EmailContext, EnrichmentField, EnrichmentResult, FieldType,
    DiscoveryResult, CompanyProfileResult, FundingResult, 
    TechStackResult, MetricsResult, GeneralResult,
    LeadCSVRow, DecisionMakerValidation, EmailResearchResult, LeadProcessingResult
)
from .agents.discovery_agent import create_discovery_agent
from .agents.company_profile_agent import create_company_profile_agent
from .agents.funding_agent import create_funding_agent
from .agents.tech_stack_agent import create_tech_stack_agent
from .agents.metrics_agent import create_metrics_agent
from .agents.general_agent import create_general_agent
from .agents.email_research_agent import create_email_research_agent
from .agents.company_description_agent import create_company_description_agent
from .agents.decision_maker_agent import create_decision_maker_agent
from .tasks.enrichment_tasks import (
    create_discovery_task, create_company_profile_task, create_funding_task,
    create_tech_stack_task, create_metrics_task, create_general_task
)
from .tasks.lead_enrichment_tasks import (
    create_email_research_task, create_company_description_task, create_decision_maker_validation_task
)
from .tools.sunbiz_scraper import SunbizScraperTool

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
    
    def _validate_decision_maker(self, row: LeadCSVRow) -> DecisionMakerValidation:
        """Validate if person is a decision maker based on seniority and title."""
        seniority = row.seniority.lower()
        headline = (row.linkedin_headline or "").lower()
        
        if seniority == "c_suite":
            return DecisionMakerValidation(
                is_decision_maker=True,
                confidence_score=0.9,
                reasoning="C-suite level position indicates decision-making authority",
                seniority_level=seniority,
                job_title=row.linkedin_headline
            )
        elif seniority == "director":
            return DecisionMakerValidation(
                is_decision_maker=True,
                confidence_score=0.8,
                reasoning="Director level position typically has decision-making authority",
                seniority_level=seniority,
                job_title=row.linkedin_headline
            )
        elif seniority == "entry":
            decision_keywords = ["owner", "founder", "co-founder", "partner", "principal", "president", "ceo", "cfo", "cto", "coo"]
            has_decision_keywords = any(keyword in headline for keyword in decision_keywords)
            
            return DecisionMakerValidation(
                is_decision_maker=has_decision_keywords,
                confidence_score=0.6 if has_decision_keywords else 0.2,
                reasoning="Entry level with decision-making title" if has_decision_keywords else "Entry level position without clear decision-making authority",
                seniority_level=seniority,
                job_title=row.linkedin_headline
            )
        
        return DecisionMakerValidation(
            is_decision_maker=False,
            confidence_score=0.1,
            reasoning="Unknown seniority level, cannot determine decision-making authority",
            seniority_level=seniority,
            job_title=row.linkedin_headline
        )
    
    def _consolidate_company_description(self, row: LeadCSVRow) -> str:
        """Consolidate Org_Keywords into company description with basic research."""
        keywords = []
        if row.org_keywords_1:
            keywords.append(row.org_keywords_1.strip())
        if row.org_keywords_2:
            keywords.append(row.org_keywords_2.strip())
        
        if not keywords:
            return f"{row.organization_name} - Business services company"
        
        services = ", ".join(keywords)
        
        if any(keyword in services.lower() for keyword in ["hvac", "air conditioning", "heating", "cooling"]):
            return f"HVAC company that offers services: {services.title()}"
        elif any(keyword in services.lower() for keyword in ["roofing", "roof", "construction", "contractor"]):
            return f"Construction company that offers services: {services.title()}"
        elif any(keyword in services.lower() for keyword in ["electric", "electrical"]):
            return f"Electrical services company that offers services: {services.title()}"
        elif any(keyword in services.lower() for keyword in ["plumbing", "plumber"]):
            return f"Plumbing services company that offers services: {services.title()}"
        elif any(keyword in services.lower() for keyword in ["cleaning", "janitorial"]):
            return f"Cleaning services company that offers services: {services.title()}"
        else:
            return f"Home services company that offers services: {services.title()}"
    
    def _research_missing_emails(self, row: LeadCSVRow) -> EmailResearchResult:
        """Research missing emails using basic pattern matching and domain inference."""
        email_found = None
        personal_email_found = None
        confidence_score = 0.0
        source_urls = []
        research_notes = "Basic email research performed"
        
        if not row.email and row.org_website_url:
            domain = row.org_website_url.replace("http://", "").replace("https://", "").replace("www.", "").split("/")[0]
            first_name = row.first_name.lower()
            last_name = row.last_name.lower()
            
            possible_emails = [
                f"{first_name}.{last_name}@{domain}",
                f"{first_name}@{domain}",
                f"{first_name[0]}{last_name}@{domain}",
                f"info@{domain}",
                f"contact@{domain}"
            ]
            
            email_found = possible_emails[0]
            confidence_score = 0.3
            research_notes = f"Inferred email pattern from company domain: {domain}"
            source_urls = [row.org_website_url] if row.org_website_url else []
        
        if not row.personal_email_1:
            first_name = row.first_name.lower()
            last_name = row.last_name.lower()
            
            common_domains = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com"]
            personal_email_found = f"{first_name}.{last_name}@gmail.com"
            confidence_score = max(confidence_score, 0.2)
            research_notes += " | Inferred personal email pattern"
        
        return EmailResearchResult(
            email_found=email_found,
            personal_email_found=personal_email_found,
            confidence_score=confidence_score,
            source_urls=source_urls,
            research_notes=research_notes
        )
    
    def _save_lead_csv_results(self, results: List[LeadCSVRow], output_path: str):
        """Save lead processing results to CSV file."""
        import pandas as pd
        
        rows = []
        for result in results:
            row = {
                "organization_name": result.organization_name,
                "First_Name": result.first_name,
                "Last_Name": result.last_name,
                "Seniority_Title": result.seniority_title or f"{result.seniority} - {result.linkedin_headline or 'N/A'}",
                "Email": result.email,
                "Personal_Email_1": result.personal_email_1,
                "Company_Description": result.company_description,
                "Linkedin_Url": result.linkedin_url,
                "Organization_Linkedin_Url": result.organization_linkedin_url,
                "Org_Website_Url": result.org_website_url,
                "Org_Phone": result.org_phone,
                "Is_Decision_Maker": result.is_decision_maker,
                "Sunbiz_Data": str(result.sunbiz_data) if result.sunbiz_data else None
            }
            rows.append(row)
        
        df = pd.DataFrame(rows)
        df.to_csv(output_path, index=False)
    
    def process_lead_csv(self, csv_file_path: str, output_path: Optional[str] = None) -> LeadProcessingResult:
        """Process lead CSV with advanced cleaning and research."""
        import pandas as pd
        
        try:
            df = pd.read_csv(csv_file_path)
            results = []
            validation_results = []
            errors = []
            
            decision_makers_count = 0
            emails_researched = 0
            descriptions_created = 0
            sunbiz_lookups = 0
            
            for index, row in df.iterrows():
                try:
                    if pd.isna(row.get('organization_name')) or not row.get('organization_name'):
                        continue
                    
                    row_dict = row.to_dict()
                    for key, value in row_dict.items():
                        if pd.isna(value):
                            row_dict[key] = None
                    
                    lead_row = LeadCSVRow(**row_dict)
                    lead_row.raw_data = row_dict
                    
                    validation = self._validate_decision_maker(lead_row)
                    validation_results.append(validation)
                    
                    if validation.is_decision_maker:
                        decision_makers_count += 1
                        
                        lead_row.company_description = self._consolidate_company_description(lead_row)
                        descriptions_created += 1
                        
                        lead_row.seniority_title = f"{lead_row.seniority} - {lead_row.linkedin_headline or 'N/A'}"
                        
                        if not lead_row.email or not lead_row.personal_email_1:
                            email_research = self._research_missing_emails(lead_row)
                            if email_research.email_found and not lead_row.email:
                                lead_row.email = email_research.email_found
                            if email_research.personal_email_found and not lead_row.personal_email_1:
                                lead_row.personal_email_1 = email_research.personal_email_found
                            emails_researched += 1
                        
                        if any(indicator in lead_row.organization_name.lower() for indicator in ["fl", "florida"]):
                            try:
                                sunbiz_tool = SunbizScraperTool()
                                sunbiz_result = sunbiz_tool._run(lead_row.organization_name)
                                lead_row.sunbiz_data = {"search_result": sunbiz_result}
                                sunbiz_lookups += 1
                            except Exception as e:
                                lead_row.sunbiz_data = {"error": str(e)}
                    
                    lead_row.is_decision_maker = validation.is_decision_maker
                    results.append(lead_row)
                    
                except Exception as e:
                    errors.append(f"Row {index}: {str(e)}")
            
            if output_path:
                self._save_lead_csv_results(results, output_path)
            
            return LeadProcessingResult(
                total_rows=len(df),
                processed_rows=len(results),
                decision_makers_found=decision_makers_count,
                emails_researched=emails_researched,
                company_descriptions_created=descriptions_created,
                sunbiz_lookups=sunbiz_lookups,
                results=results,
                validation_results=validation_results,
                errors=errors
            )
            
        except Exception as e:
            raise ValueError(f"Error processing lead CSV file: {str(e)}")
    
    async def process_lead_csv_async(self, csv_file_path: str, output_path: Optional[str] = None) -> LeadProcessingResult:
        """Asynchronous version of lead CSV processing."""
        import asyncio
        return await asyncio.get_event_loop().run_in_executor(None, self.process_lead_csv, csv_file_path, output_path)
