from crewai import Task
from ..models.schemas import EmailContext, EnrichmentField, LeadCSVRow

def create_email_research_task(lead_row: LeadCSVRow, context: str = "") -> Task:
    """Create task for researching missing email addresses."""
    
    person_info = f"{lead_row.first_name} {lead_row.last_name}"
    company_info = lead_row.organization_name
    linkedin_url = lead_row.linkedin_url or ""
    
    return Task(
        description=f"""
        Research and find missing email addresses for {person_info} at {company_info}.
        
        PERSON DETAILS:
        - Name: {person_info}
        - Company: {company_info}
        - LinkedIn: {linkedin_url}
        - Current Email: {lead_row.email or 'MISSING'}
        - Current Personal Email: {lead_row.personal_email_1 or 'MISSING'}
        
        CONTEXT: {context}
        
        RESEARCH OBJECTIVES:
        1. Find business email if missing
        2. Find personal email if missing
        3. Verify existing emails if provided
        4. Use LinkedIn profile, company website, and professional directories
        
        DELIVERABLES:
        - Business email address (if found)
        - Personal email address (if found)
        - Confidence score for each email
        - Source URLs where emails were found
        - Research notes explaining findings
        """,
        expected_output="""
        EmailResearchResult with:
        - email_found: Business email address or None
        - personal_email_found: Personal email address or None
        - confidence_score: Float between 0-1
        - source_urls: List of URLs where information was found
        - research_notes: Explanation of research process and findings
        """,
        agent=None
    )

def create_company_description_task(lead_row: LeadCSVRow, context: str = "") -> Task:
    """Create task for researching and creating company description."""
    
    company_name = lead_row.organization_name
    website = lead_row.org_website_url or ""
    keywords = []
    if lead_row.org_keywords_1:
        keywords.append(lead_row.org_keywords_1)
    if lead_row.org_keywords_2:
        keywords.append(lead_row.org_keywords_2)
    
    return Task(
        description=f"""
        Research {company_name} and create a concise company description.
        
        COMPANY DETAILS:
        - Name: {company_name}
        - Website: {website}
        - Existing Keywords: {', '.join(keywords) if keywords else 'None'}
        
        CONTEXT: {context}
        
        RESEARCH OBJECTIVES:
        1. Understand what services the company provides
        2. Identify the industry/sector
        3. Create concise description following format rules
        4. Consolidate existing keywords with research findings
        
        DESCRIPTION FORMAT:
        "{{Industry}} company that offers services: {{All Services Listed}}"
        
        DELIVERABLES:
        - Concise company description (10-20 words)
        - Industry classification
        - List of main services
        - Confidence score
        - Source URLs
        """,
        expected_output="""
        CompanyProfileResult with:
        - description: Concise company description following format rules
        - industry: Industry classification
        - confidence_score: Float between 0-1
        - source_urls: List of research sources
        - extraction_notes: Research methodology and findings
        """,
        agent=None
    )

def create_decision_maker_validation_task(lead_row: LeadCSVRow, context: str = "") -> Task:
    """Create task for validating decision maker status."""
    
    person_info = f"{lead_row.first_name} {lead_row.last_name}"
    company_info = lead_row.organization_name
    seniority = lead_row.seniority
    job_title = lead_row.linkedin_headline or ""
    
    return Task(
        description=f"""
        Validate whether {person_info} is a decision maker at {company_info}.
        
        PERSON DETAILS:
        - Name: {person_info}
        - Company: {company_info}
        - Seniority Level: {seniority}
        - Job Title: {job_title}
        - LinkedIn: {lead_row.linkedin_url or 'Not provided'}
        
        CONTEXT: {context}
        
        VALIDATION CRITERIA:
        1. Analyze seniority level (c_suite, director, entry)
        2. Evaluate job title for decision-making authority
        3. Research company structure if needed
        4. Apply decision maker rules based on role and authority
        
        DECISION MAKER RULES:
        - C_SUITE: Automatically decision makers
        - DIRECTOR: Usually decision makers
        - ENTRY: Only if title contains ownership/leadership keywords
        
        DELIVERABLES:
        - Decision maker status (True/False)
        - Confidence score
        - Detailed reasoning
        - Supporting evidence
        """,
        expected_output="""
        DecisionMakerValidation with:
        - is_decision_maker: Boolean decision
        - confidence_score: Float between 0-1
        - reasoning: Detailed explanation of decision
        - seniority_level: Original seniority level
        - job_title: Job title used in analysis
        """,
        agent=None
    )
