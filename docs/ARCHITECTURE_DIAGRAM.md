# Fire Enrich LLM Provider Architecture

## System Architecture Diagram

```mermaid
graph TB
    subgraph "Frontend (Next.js)"
        A[LLM Switcher Component] --> B[localStorage]
        B --> C[EnrichmentTable Component]
        C --> D[API Request]
    end
    
    subgraph "API Layer"
        D --> E[/api/enrich Route]
        E --> F[API Key Validation]
        F --> G[Request Processing]
    end
    
    subgraph "Strategy Layer"
        G --> H[AgentEnrichmentStrategy]
        H --> I[AgentOrchestrator]
    end
    
    subgraph "Service Layer"
        I --> J[LLMService]
        J --> K{Provider Selection}
        
        K -->|openai| L[OpenAIService]
        K -->|anthropic| M[AnthropicService]
        K -->|deepseek| N[DeepSeekService]
        K -->|grok| O[GrokService]
    end
    
    subgraph "External APIs"
        L --> P[OpenAI API]
        M --> Q[Anthropic API]
        N --> R[DeepSeek API]
        O --> S[Grok API]
    end
    
    subgraph "Agent Architecture"
        I --> T[SearchAgent]
        I --> U[ExtractionAgent]
        I --> V[ValidationAgent]
        I --> W[SynthesisAgent]
        
        T --> J
        U --> J
        V --> J
        W --> J
    end
    
    style A fill:#e1f5fe
    style J fill:#f3e5f5
    style K fill:#fff3e0
    style L fill:#e8f5e8
    style M fill:#e8f5e8
    style N fill:#e8f5e8
    style O fill:#e8f5e8
```

## Component Interaction Flow

```mermaid
sequenceDiagram
    participant User
    participant LLMSwitcher
    participant LocalStorage
    participant EnrichmentTable
    participant API
    participant AgentOrchestrator
    participant LLMService
    participant ProviderService
    participant ExternalAPI
    
    User->>LLMSwitcher: Select provider/model
    LLMSwitcher->>LocalStorage: Save selection
    
    User->>EnrichmentTable: Start enrichment
    EnrichmentTable->>LocalStorage: Read provider/model
    EnrichmentTable->>API: POST /api/enrich
    
    API->>API: Validate API keys
    API->>AgentOrchestrator: Create with LLM config
    AgentOrchestrator->>LLMService: Initialize with provider
    LLMService->>ProviderService: Create service instance
    
    loop For each CSV row
        AgentOrchestrator->>ProviderService: Extract data
        ProviderService->>ExternalAPI: API call
        ExternalAPI-->>ProviderService: Response
        ProviderService-->>AgentOrchestrator: Structured data
        AgentOrchestrator-->>API: Enrichment result
        API-->>EnrichmentTable: Stream result
        EnrichmentTable-->>User: Update UI
    end
```

## Data Structure Flow

```mermaid
graph LR
    subgraph "Input Data"
        A[CSV Rows] --> B[Email Addresses]
        B --> C[Enrichment Fields]
    end
    
    subgraph "Configuration"
        D[LLM Provider] --> E[Provider Config]
        F[LLM Model] --> E
        G[API Keys] --> E
    end
    
    subgraph "Processing"
        C --> H[Agent Pipeline]
        E --> H
        H --> I[Search Queries]
        I --> J[Web Content]
        J --> K[Structured Extraction]
    end
    
    subgraph "Output Data"
        K --> L[Enriched Records]
        L --> M[CSV Export]
        L --> N[Real-time Updates]
    end
```

## Provider Service Interface

```mermaid
classDiagram
    class LLMService {
        +provider: LLMProvider
        +model: string
        +extractStructuredData()
        +generateSearchQueries()
    }
    
    class OpenAIService {
        -client: OpenAI
        -model: string
        +extractStructuredData()
        +generateSearchQueries()
    }
    
    class AnthropicService {
        -client: Anthropic
        -model: string
        +extractStructuredData()
        +generateSearchQueries()
    }
    
    class DeepSeekService {
        -client: OpenAI
        -model: string
        +extractStructuredData()
        +generateSearchQueries()
    }
    
    class GrokService {
        -client: OpenAI
        -model: string
        +extractStructuredData()
        +generateSearchQueries()
    }
    
    LLMService --> OpenAIService
    LLMService --> AnthropicService
    LLMService --> DeepSeekService
    LLMService --> GrokService
```

## Agent Workflow

```mermaid
stateDiagram-v2
    [*] --> Initialize
    Initialize --> SearchAgent: Start enrichment
    
    SearchAgent --> GenerateQueries: Create search queries
    GenerateQueries --> ExecuteSearch: Use Firecrawl
    ExecuteSearch --> ExtractionAgent: Process results
    
    ExtractionAgent --> ExtractData: Use selected LLM
    ExtractData --> ValidationAgent: Validate results
    
    ValidationAgent --> CheckQuality: Assess data quality
    CheckQuality --> SynthesisAgent: If valid
    CheckQuality --> SearchAgent: If needs more data
    
    SynthesisAgent --> CombineResults: Merge all data
    CombineResults --> [*]: Return enriched record
```

## Error Handling Flow

```mermaid
graph TD
    A[API Request] --> B{Valid Provider?}
    B -->|No| C[Return Error: Invalid Provider]
    B -->|Yes| D{API Key Available?}
    D -->|No| E[Return Error: Missing API Key]
    D -->|Yes| F{API Key Valid?}
    F -->|No| G[Return Error: Invalid API Key]
    F -->|Yes| H[Process Request]
    
    H --> I{LLM API Call}
    I -->|Success| J[Return Results]
    I -->|Rate Limited| K[Retry with Backoff]
    I -->|Error| L[Log Error & Return Generic Message]
    
    K --> I
    
    style C fill:#ffebee
    style E fill:#ffebee
    style G fill:#ffebee
    style L fill:#ffebee
    style J fill:#e8f5e8
```

## Configuration Management

```mermaid
graph LR
    subgraph "Environment Variables"
        A[OPENAI_API_KEY] --> D[Server Config]
        B[ANTHROPIC_API_KEY] --> D
        C[DEEPSEEK_API_KEY] --> D
        E[GROK_API_KEY] --> D
    end
    
    subgraph "Client Storage"
        F[localStorage Keys] --> G[Client Config]
        H[User Preferences] --> G
    end
    
    subgraph "Runtime Config"
        D --> I[Merged Configuration]
        G --> I
        I --> J[LLM Service Factory]
    end
    
    J --> K[Provider Instance]
```

## Performance Optimization

```mermaid
graph TB
    subgraph "Request Optimization"
        A[Batch Processing] --> B[Parallel Requests]
        B --> C[Rate Limiting]
        C --> D[Connection Pooling]
    end
    
    subgraph "Content Optimization"
        E[Content Truncation] --> F[Smart Chunking]
        F --> G[Context Prioritization]
        G --> H[Token Management]
    end
    
    subgraph "Caching Strategy"
        I[Response Caching] --> J[Query Deduplication]
        J --> K[Result Memoization]
        K --> L[Provider Failover]
    end
    
    A --> E
    E --> I
```

## Security Architecture

```mermaid
graph TD
    subgraph "Client Security"
        A[HTTPS Only] --> B[API Key Validation]
        B --> C[Input Sanitization]
        C --> D[Rate Limiting]
    end
    
    subgraph "Server Security"
        E[Environment Variables] --> F[Key Rotation]
        F --> G[Access Logging]
        G --> H[Error Sanitization]
    end
    
    subgraph "API Security"
        I[Provider Authentication] --> J[Request Signing]
        J --> K[Response Validation]
        K --> L[Audit Trail]
    end
    
    D --> E
    H --> I
```

## Monitoring & Observability

```mermaid
graph LR
    subgraph "Metrics Collection"
        A[Request Count] --> D[Dashboard]
        B[Response Time] --> D
        C[Error Rate] --> D
        E[Token Usage] --> D
        F[Cost Tracking] --> D
    end
    
    subgraph "Alerting"
        D --> G[High Error Rate]
        D --> H[Slow Response]
        D --> I[API Quota Exceeded]
        D --> J[Cost Threshold]
    end
    
    subgraph "Logging"
        K[Request Logs] --> L[Centralized Logging]
        M[Error Logs] --> L
        N[Performance Logs] --> L
        L --> O[Log Analysis]
    end
```

## Deployment Architecture

```mermaid
graph TB
    subgraph "Development"
        A[Local Dev Server] --> B[Hot Reload]
        B --> C[Debug Logging]
        C --> D[Test API Keys]
    end
    
    subgraph "Staging"
        E[Staging Server] --> F[Integration Tests]
        F --> G[Performance Tests]
        G --> H[Security Scans]
    end
    
    subgraph "Production"
        I[Production Server] --> J[Load Balancer]
        J --> K[Auto Scaling]
        K --> L[Health Checks]
        L --> M[Monitoring]
    end
    
    D --> E
    H --> I
```

This architecture documentation provides a comprehensive visual representation of how the LLM provider switching system works, from user interaction through to external API calls and back to the user interface.
