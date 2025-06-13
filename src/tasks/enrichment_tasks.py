from crewai import Task
from ..models.schemas import (
    EmailContext, DiscoveryResult, CompanyProfileResult, 
    FundingResult, TechStackResult, MetricsResult, GeneralResult
)

def create_discovery_task(email_context: EmailContext) -> Task:
    """Create a task for the Discovery Agent."""
    return Task(
        description=f"""
        Extract foundational company information for the email domain: {email_context.domain}
        
        Email: {email_context.email}
        Domain: {email_context.domain}
        
        Your task is to discover and extract basic company information including:
        - Company name
        - Official website
        - Company description
        - Basic company details
        
        Use systematic research starting with direct website access, then fallback searches if needed.
        Provide confidence scores based on source reliability and include all source URLs.
        """,
        expected_output="A structured result with company_name, website, description, domain, confidence_score, source_urls, and extraction_notes"
    )

def create_company_profile_task(email_context: EmailContext, discovery_context: str = "") -> Task:
    """Create a task for the Company Profile Agent."""
    context_info = f"\n\nContext from previous research:\n{discovery_context}" if discovery_context else ""
    
    return Task(
        description=f"""
        Extract detailed company profile information for: {email_context.domain}
        
        Email: {email_context.email}
        Domain: {email_context.domain}{context_info}
        
        Your task is to research and extract comprehensive company profile information including:
        - Industry classification
        - Company size and employee count
        - Headquarters location
        - Founded year
        - Detailed company description
        - Key leadership and executives
        
        Focus on authoritative business sources and official company communications.
        """,
        expected_output="A structured result with company_name, industry, company_size, headquarters, founded_year, description, key_people, confidence_score, source_urls, and extraction_notes"
    )

def create_funding_task(email_context: EmailContext, previous_context: str = "") -> Task:
    """Create a task for the Funding Agent."""
    context_info = f"\n\nContext from previous research:\n{previous_context}" if previous_context else ""
    
    return Task(
        description=f"""
        Extract funding and investment information for: {email_context.domain}
        
        Email: {email_context.email}
        Domain: {email_context.domain}{context_info}
        
        Your task is to research and extract comprehensive funding information including:
        - Total funding raised
        - Most recent funding round details
        - Funding amounts and dates
        - Investor information
        - Funding stage progression
        
        Focus on financial databases, press releases, and official funding announcements.
        """,
        expected_output="A structured result with total_funding, last_funding_round, last_funding_amount, last_funding_date, investors, funding_stages, confidence_score, source_urls, and extraction_notes"
    )

def create_tech_stack_task(email_context: EmailContext, previous_context: str = "") -> Task:
    """Create a task for the Tech Stack Agent."""
    context_info = f"\n\nContext from previous research:\n{previous_context}" if previous_context else ""
    
    return Task(
        description=f"""
        Extract technology stack information for: {email_context.domain}
        
        Email: {email_context.email}
        Domain: {email_context.domain}{context_info}
        
        Your task is to research and extract comprehensive technology information including:
        - Programming languages used
        - Frameworks and libraries
        - Databases and data storage
        - Cloud services and infrastructure
        - Development and deployment tools
        
        Focus on engineering blogs, job postings, and technical documentation.
        """,
        expected_output="A structured result with technologies, programming_languages, frameworks, databases, cloud_services, confidence_score, source_urls, and extraction_notes"
    )

def create_metrics_task(email_context: EmailContext, previous_context: str = "") -> Task:
    """Create a task for the Metrics Agent."""
    context_info = f"\n\nContext from previous research:\n{previous_context}" if previous_context else ""
    
    return Task(
        description=f"""
        Extract business metrics and performance data for: {email_context.domain}
        
        Email: {email_context.email}
        Domain: {email_context.domain}{context_info}
        
        Your task is to research and extract quantitative business metrics including:
        - Revenue and financial performance
        - Employee count and company size
        - Growth rates and trends
        - Market share and position
        - Company valuation
        
        Focus on financial reports, business publications, and official company announcements.
        """,
        expected_output="A structured result with revenue, employee_count, growth_rate, market_share, valuation, confidence_score, source_urls, and extraction_notes"
    )

def create_general_task(email_context: EmailContext, custom_fields: list, previous_context: str = "") -> Task:
    """Create a task for the General Agent with custom field requirements."""
    context_info = f"\n\nContext from previous research:\n{previous_context}" if previous_context else ""
    
    fields_description = "\n".join([f"- {field.name}: {field.description}" for field in custom_fields])
    
    return Task(
        description=f"""
        Extract additional custom information for: {email_context.domain}
        
        Email: {email_context.email}
        Domain: {email_context.domain}{context_info}
        
        Your task is to research and extract the following specific information:
        {fields_description}
        
        Adapt your research approach based on the specific information requested.
        Use appropriate sources and provide confidence scoring based on source reliability.
        """,
        expected_output="A structured result with extracted_data dictionary containing the requested information, confidence_score, source_urls, and extraction_notes"
    )
