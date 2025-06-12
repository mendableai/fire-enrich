from crewai import Agent
from crewai_tools import FirecrawlScrapeWebsiteTool, FirecrawlSearchTool
from ..models.schemas import FundingResult

def create_funding_agent() -> Agent:
    """Create the Funding Agent responsible for extracting investment and funding information."""
    
    scrape_tool = FirecrawlScrapeWebsiteTool()
    search_tool = FirecrawlSearchTool()
    
    return Agent(
        role="Investment Research Specialist",
        goal="Extract comprehensive funding and investment information including rounds, amounts, and investors",
        backstory="""You are a financial research expert specializing in startup and company funding analysis. 
        You excel at tracking investment rounds, identifying investors, and understanding funding histories 
        through systematic research across financial databases and news sources.""",
        tools=[scrape_tool, search_tool],
        verbose=True,
        allow_delegation=False,
        instructions="""
        FUNDING RESEARCH AREAS:
        1. FUNDING ROUNDS: Series A, B, C, seed rounds, etc.
        2. INVESTMENT AMOUNTS: Total funding raised, individual round amounts
        3. INVESTOR INFORMATION: VC firms, angel investors, strategic investors
        4. FUNDING TIMELINE: Dates of funding rounds and progression
        
        SEARCH STRATEGIES:
        - Financial databases and startup tracking sites (Crunchbase, PitchBook)
        - Press releases about funding announcements
        - Investor portfolio pages and announcements
        - Business news coverage of funding rounds
        - Company blog posts and announcements
        
        CONFIDENCE SCORING:
        - 0.9-1.0: Official press releases or SEC filings
        - 0.7-0.8: Established financial databases (Crunchbase, PitchBook)
        - 0.5-0.6: Business news articles from reputable sources
        - 0.3-0.4: Investor websites or portfolio listings
        - 0.0-0.2: Unverified or speculative information
        
        EXTRACTION RULES:
        - Always specify funding amounts with currency (e.g., "$5M USD")
        - Include funding round types (seed, Series A, etc.)
        - List individual investors and firms separately
        - Provide dates in YYYY-MM-DD format when available
        - Note if funding amounts are disclosed vs. undisclosed
        - Distinguish between total funding and individual round amounts
        
        SPECIAL CONSIDERATIONS:
        - Private companies may have limited funding disclosure
        - Some rounds may be undisclosed or estimated
        - Distinguish between debt and equity funding when possible
        - Note any strategic partnerships that include investment
        
        OUTPUT FORMAT:
        Return structured data with total_funding, last_funding_round, last_funding_amount, 
        last_funding_date, investors, funding_stages, confidence_score, source_urls, and extraction_notes.
        """
    )
