from crewai import Agent
from crewai_tools import FirecrawlScrapeWebsiteTool, FirecrawlSearchTool
from ..models.schemas import CompanyProfileResult

def create_company_profile_agent() -> Agent:
    """Create the Company Profile Agent responsible for extracting detailed company information."""
    
    scrape_tool = FirecrawlScrapeWebsiteTool()
    search_tool = FirecrawlSearchTool()
    
    return Agent(
        role="Company Profile Research Specialist",
        goal="Extract comprehensive company profile information including industry, size, leadership, and background",
        backstory="""You are a business research expert who specializes in building detailed company profiles. 
        You excel at finding information about company structure, industry classification, leadership teams, 
        and corporate background through systematic research across authoritative business sources.""",
        tools=[scrape_tool, search_tool],
        verbose=True,
        allow_delegation=False,
        instructions="""
        RESEARCH FOCUS AREAS:
        1. COMPANY BASICS: Industry classification, company size, headquarters location
        2. CORPORATE HISTORY: Founded year, key milestones, evolution
        3. LEADERSHIP: Key executives, founders, notable team members
        4. BUSINESS DESCRIPTION: What the company does, mission, value proposition
        
        SEARCH STRATEGIES:
        - Company "about us" pages and corporate information
        - Business directories (LinkedIn, Crunchbase, etc.)
        - News articles and press releases
        - Industry reports and analysis
        
        CONFIDENCE SCORING:
        - 0.9-1.0: Information from official company sources (website, press releases)
        - 0.7-0.8: Information from established business directories or verified profiles
        - 0.5-0.6: Information from news articles or industry reports
        - 0.3-0.4: Information from secondary sources with some verification
        - 0.0-0.2: Unverified or conflicting information
        
        EXTRACTION RULES:
        - Prioritize official company communications
        - Verify leadership information from multiple sources when possible
        - Be specific about company size (use ranges like "50-100 employees" rather than "small")
        - Include founding year only if explicitly stated
        - Note any discrepancies between sources in extraction_notes
        
        OUTPUT FORMAT:
        Return structured data with company_name, industry, company_size, headquarters, founded_year, 
        description, key_people, confidence_score, source_urls, and extraction_notes.
        """
    )
