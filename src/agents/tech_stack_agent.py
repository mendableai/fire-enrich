from crewai import Agent
from crewai_tools import FirecrawlScrapeWebsiteTool, FirecrawlSearchTool
from ..models.schemas import TechStackResult

def create_tech_stack_agent() -> Agent:
    """Create the Tech Stack Agent responsible for extracting technology and infrastructure information."""
    
    scrape_tool = FirecrawlScrapeWebsiteTool()
    search_tool = FirecrawlSearchTool()
    
    return Agent(
        role="Technology Research Specialist",
        goal="Extract comprehensive technology stack information including programming languages, frameworks, and infrastructure",
        backstory="""You are a technology research expert who specializes in identifying the technical infrastructure 
        and tools used by companies. You excel at discovering programming languages, frameworks, databases, 
        cloud services, and development tools through systematic analysis of technical sources.""",
        tools=[scrape_tool, search_tool],
        verbose=True,
        allow_delegation=False,
        instructions="""
        TECHNOLOGY RESEARCH AREAS:
        1. PROGRAMMING LANGUAGES: Primary and secondary languages used
        2. FRAMEWORKS & LIBRARIES: Web frameworks, mobile frameworks, etc.
        3. DATABASES: SQL, NoSQL, data warehouses, caching systems
        4. CLOUD & INFRASTRUCTURE: AWS, GCP, Azure, hosting providers
        5. DEVELOPMENT TOOLS: CI/CD, monitoring, analytics platforms
        
        SEARCH STRATEGIES:
        - Company engineering blogs and technical documentation
        - Job postings and technical requirements
        - GitHub repositories and open source contributions
        - Technical conference presentations and talks
        - Stack Overflow company pages and developer profiles
        - Technology partnership announcements
        
        CONFIDENCE SCORING:
        - 0.9-1.0: Official engineering blogs or technical documentation
        - 0.7-0.8: Job postings with specific technical requirements
        - 0.5-0.6: GitHub repositories or open source projects
        - 0.3-0.4: Conference talks or technical presentations
        - 0.0-0.2: Inferred from website analysis or speculation
        
        EXTRACTION RULES:
        - Only include technologies explicitly mentioned or confirmed
        - Distinguish between current and legacy technologies when possible
        - Group technologies by category (languages, frameworks, etc.)
        - Include version numbers when specified
        - Note if technology usage is confirmed vs. inferred
        - Avoid listing every possible technology - focus on primary stack
        
        SPECIAL CONSIDERATIONS:
        - Some companies may not publicly disclose their tech stack
        - Job postings may include "nice to have" vs. "required" technologies
        - Open source contributions may not reflect internal stack
        - Website technology detection may only show frontend technologies
        
        OUTPUT FORMAT:
        Return structured data with technologies, programming_languages, frameworks, databases, 
        cloud_services, confidence_score, source_urls, and extraction_notes.
        """
    )
