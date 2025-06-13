from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Literal
from enum import Enum

class FieldType(str, Enum):
    DISCOVERY = "discovery"
    COMPANY_PROFILE = "company_profile"
    FUNDING = "funding"
    TECH_STACK = "tech_stack"
    METRICS = "metrics"
    GENERAL = "general"

class EnrichmentField(BaseModel):
    name: str
    type: FieldType
    description: str
    required: bool = False

class EmailContext(BaseModel):
    email: str
    domain: str
    fields: List[EnrichmentField]

class DiscoveryResult(BaseModel):
    company_name: Optional[str] = None
    website: Optional[str] = None
    description: Optional[str] = None
    domain: str
    confidence_score: float = Field(ge=0, le=1)
    source_urls: List[str] = []
    extraction_notes: Optional[str] = None

class CompanyProfileResult(BaseModel):
    company_name: Optional[str] = None
    industry: Optional[str] = None
    company_size: Optional[str] = None
    headquarters: Optional[str] = None
    founded_year: Optional[int] = None
    description: Optional[str] = None
    key_people: List[str] = []
    confidence_score: float = Field(ge=0, le=1)
    source_urls: List[str] = []
    extraction_notes: Optional[str] = None

class FundingResult(BaseModel):
    total_funding: Optional[str] = None
    last_funding_round: Optional[str] = None
    last_funding_amount: Optional[str] = None
    last_funding_date: Optional[str] = None
    investors: List[str] = []
    funding_stages: List[str] = []
    confidence_score: float = Field(ge=0, le=1)
    source_urls: List[str] = []
    extraction_notes: Optional[str] = None

class TechStackResult(BaseModel):
    technologies: List[str] = []
    programming_languages: List[str] = []
    frameworks: List[str] = []
    databases: List[str] = []
    cloud_services: List[str] = []
    confidence_score: float = Field(ge=0, le=1)
    source_urls: List[str] = []
    extraction_notes: Optional[str] = None

class MetricsResult(BaseModel):
    revenue: Optional[str] = None
    employee_count: Optional[str] = None
    growth_rate: Optional[str] = None
    market_share: Optional[str] = None
    valuation: Optional[str] = None
    confidence_score: float = Field(ge=0, le=1)
    source_urls: List[str] = []
    extraction_notes: Optional[str] = None

class GeneralResult(BaseModel):
    extracted_data: Dict[str, Any] = {}
    confidence_score: float = Field(ge=0, le=1)
    source_urls: List[str] = []
    extraction_notes: Optional[str] = None

class EnrichmentResult(BaseModel):
    email: str
    domain: str
    discovery: Optional[DiscoveryResult] = None
    company_profile: Optional[CompanyProfileResult] = None
    funding: Optional[FundingResult] = None
    tech_stack: Optional[TechStackResult] = None
    metrics: Optional[MetricsResult] = None
    general: Optional[GeneralResult] = None
    overall_confidence: float = Field(ge=0, le=1)
    processing_time: Optional[float] = None
    errors: List[str] = []

class LeadCSVRow(BaseModel):
    organization_name: str
    first_name: str = Field(alias="First_Name")
    last_name: str = Field(alias="Last_Name") 
    seniority: str = Field(alias="Seniority")
    email: Optional[str] = Field(alias="Email", default=None)
    personal_email_1: Optional[str] = Field(alias="Personal_Email_1", default=None)
    linkedin_url: Optional[str] = Field(alias="Linkedin_Url", default=None)
    linkedin_headline: Optional[str] = Field(alias="Linkedin_Headline", default=None)
    organization_linkedin_url: Optional[str] = Field(alias="Organization_Linkedin_Url", default=None)
    org_twitter_url: Optional[str] = Field(alias="Org_Twitter_Url", default=None)
    org_facebook_url: Optional[str] = Field(alias="Org_Facebook_Url", default=None)
    org_website_url: Optional[str] = Field(alias="Org_Website_Url", default=None)
    org_phone: Optional[str] = Field(alias="Org_Phone", default=None)
    org_keywords_1: Optional[str] = Field(alias="Org_Keywords_1", default=None)
    org_keywords_2: Optional[str] = Field(alias="Org_Keywords_2", default=None)
    ice_breaker: Optional[str] = Field(alias="Ice_Breaker", default=None)
    company_description: Optional[str] = None
    seniority_title: Optional[str] = None
    is_decision_maker: Optional[bool] = None
    sunbiz_data: Optional[Dict[str, Any]] = None
    raw_data: Dict[str, Any] = {}

    model_config = {"populate_by_name": True}

class DecisionMakerValidation(BaseModel):
    is_decision_maker: bool
    confidence_score: float = Field(ge=0, le=1)
    reasoning: str
    seniority_level: str
    job_title: Optional[str] = None

class EmailResearchResult(BaseModel):
    email_found: Optional[str] = None
    personal_email_found: Optional[str] = None
    confidence_score: float = Field(ge=0, le=1)
    source_urls: List[str] = []
    research_notes: Optional[str] = None

class LeadProcessingResult(BaseModel):
    total_rows: int
    processed_rows: int
    decision_makers_found: int
    emails_researched: int
    company_descriptions_created: int
    sunbiz_lookups: int
    results: List[LeadCSVRow]
    validation_results: List[DecisionMakerValidation]
    errors: List[str] = []
