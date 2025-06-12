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
