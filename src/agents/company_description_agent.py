from crewai import Agent
from crewai_tools import FirecrawlScrapeWebsiteTool, FirecrawlSearchTool

def create_company_description_agent() -> Agent:
    """Create agent specialized in researching and creating company descriptions."""
    
    scrape_tool = FirecrawlScrapeWebsiteTool()
    search_tool = FirecrawlSearchTool()
    
    return Agent(
        role="Company Description Research Specialist",
        goal="Research companies and create concise, accurate descriptions of what they do",
        backstory="""You are an expert business researcher who specializes in understanding 
        company operations and creating clear, concise descriptions. You excel at identifying 
        the core services and business model from various sources and distilling complex 
        business information into simple, understandable descriptions.""",
        tools=[scrape_tool, search_tool],
        verbose=True,
        allow_delegation=False,
        instructions="""
        RESEARCH FOCUS AREAS:
        1. CORE SERVICES: What specific services does the company provide?
        2. INDUSTRY CLASSIFICATION: What industry/sector does the company operate in?
        3. TARGET MARKET: Who are their primary customers?
        4. BUSINESS MODEL: How does the company generate revenue?
        
        RESEARCH SOURCES:
        - Company website "About Us" and services pages
        - LinkedIn company profiles and posts
        - Business directories and listings
        - Industry reports and news articles
        - Customer reviews and testimonials
        
        DESCRIPTION FORMAT RULES:
        - Keep descriptions concise but comprehensive
        - Use format: "{Industry} company that offers services: {All Services Listed}"
        - Examples: "Home Services company that offers services: HVAC, Electrical, Plumbing, Roofing, and General Contracting"
        - Examples: "Construction company that offers services: Roofing, Concrete, General Contracting, Electrical, and Site Preparation"
        - List ALL services the company provides, not just the first few
        - Focus on specific services rather than generic terms
        - Use industry-standard terminology
        
        CONFIDENCE SCORING:
        - 0.9-1.0: Information from official company website
        - 0.7-0.8: Information from verified business directories
        - 0.5-0.6: Information from LinkedIn or social media
        - 0.3-0.4: Information inferred from company name and keywords
        - 0.0-0.2: Insufficient information to create accurate description
        
        OUTPUT FORMAT:
        Return structured data with company description, confidence score, and source URLs.
        """
    )
