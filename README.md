# Resume Parser & Job Matcher - Serverless Backend

A scalable, cloud-native backend system for resume parsing, skill extraction, and job matching using AWS Lambda, SQS, DynamoDB, and LangChain.

## 🏗 Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend UI   │    │   API Gateway   │    │   S3 Storage    │
│   (React App)   │◄──►│   (REST API)    │◄──►│   (PDF Files)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Resume Upload  │    │   DynamoDB      │    │   SQS Queues    │
│   Handler       │◄──►│   (Metadata)    │◄──►│   (Processing)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │                        │
                              ▼                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Job Management │    │  Match Scores   │    │  Worker Lambda  │
│   Handler       │    │   Handler       │    │   Functions     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🔄 Processing Pipeline

### 1. Resume Upload Flow
```
Frontend → API Gateway → Resume Upload Handler → S3 + DynamoDB → Resume Processing Queue
```

### 2. Worker Processing Flow
```
Resume Processing Queue → Resume Parser Worker → Skill Extraction Queue → Skill Extractor Worker → Scoring Queue → Scorer Worker → DynamoDB
```

### 3. Microservice Workers

#### Resume Parser Worker
- **Purpose**: Extract text from PDF resumes
- **Input**: S3 PDF file
- **Output**: Parsed text + metadata
- **Technology**: pdf-parse library

#### Skill Extractor Worker
- **Purpose**: Extract skills using LLM
- **Input**: Parsed resume text
- **Output**: Structured skills data
- **Technology**: LangChain + OpenAI GPT-3.5-turbo

#### Scorer Worker
- **Purpose**: Calculate match scores
- **Input**: Extracted skills + job requirements
- **Output**: Match score + analysis
- **Technology**: LangChain + OpenAI GPT-3.5-turbo

## 🗄 Database Schema

### Jobs Table
```json
{
  "id": "job-uuid",
  "title": "Frontend Developer",
  "company": "Tech Corp",
  "description": "Job description...",
  "requirements": ["React", "JavaScript", "HTML"],
  "location": "San Francisco, CA",
  "salary": "$80,000 - $120,000",
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-15T10:00:00Z"
}
```

### Resumes Table
```json
{
  "id": "resume-uuid",
  "jobId": "job-uuid",
  "candidateEmail": "candidate@example.com",
  "fileName": "resume.pdf",
  "s3Key": "resumes/resume-uuid.pdf",
  "status": "SCORED",
  "parsedText": "Extracted text content...",
  "extractedSkills": {
    "programmingLanguages": ["JavaScript", "Python"],
    "frameworks": ["React", "Node.js"],
    "databases": ["MongoDB"],
    "estimatedExperience": "3 years"
  },
  "matchScore": 85,
  "uploadedAt": "2024-01-16T11:30:00Z",
  "parsedAt": "2024-01-16T11:32:00Z",
  "scoredAt": "2024-01-16T11:35:00Z"
}
```

### Match Scores Table
```json
{
  "id": "resume-uuid-job-uuid",
  "resumeId": "resume-uuid",
  "jobId": "job-uuid",
  "overallScore": 85,
  "technicalMatch": 90,
  "experienceMatch": 80,
  "missingSkills": ["TypeScript"],
  "bonusSkills": ["Docker", "AWS"],
  "detailedAnalysis": "Strong technical skills...",
  "recommendations": "Consider for interview...",
  "confidence": 0.9,
  "createdAt": "2024-01-16T11:35:00Z"
}
```

## 🚀 Deployment

### Prerequisites
- Node.js 16+
- AWS CLI configured
- Serverless Framework installed globally
- OpenAI API key

### Environment Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Create environment file**:
   ```bash
   cp .env.example .env
   ```

3. **Configure environment variables**:
   ```env
   # AWS Configuration
   AWS_REGION=us-east-1
   
   # OpenAI Configuration
   OPENAI_API_KEY=your_openai_api_key
   
   # Application Configuration
   APP_URL=http://localhost:3000
   bucketsuffix=dev
   OPENAI_API_KEY=your_open_ai_key
   ```

### Deployment Commands

1. **Deploy to development**:
   ```bash
   npm run deploy
   ```

2. **Deploy to production**:
   ```bash
   stage=production region=us-east-1 serverless deploy
   ```

3. **Remove deployment**:
   ```bash
   serverless remove
   ```

## 📊 API Endpoints

### Resume Management
- `POST /resume/upload` - Upload resume for processing
- `GET /resumes` - Get all resumes
- `GET /resumes/{resumeId}` - Get specific resume

### Job Management
- `GET /jobs` - Get all jobs
- `POST /jobs` - Create new job
- `GET /jobs/{jobId}` - Get specific job
- `PUT /jobs/{jobId}` - Update job
- `DELETE /jobs/{jobId}` - Delete job

### Match Scores
- `GET /matches` - Get all match scores
- `GET /matches?limit=10` - Get top match scores
- `GET /matches?resumeId=uuid` - Get scores for specific resume
- `GET /matches/{jobId}` - Get scores for specific job

## 🔧 Configuration

### Lambda Function Settings
- **Memory**: 2048MB (workers), 1024MB (handlers)
- **Timeout**: 300s (workers), 60s (handlers)
- **Runtime**: Node.js 16.x

### SQS Queue Settings
- **Visibility Timeout**: 300-600s
- **Message Retention**: 14 days
- **Dead Letter Queues**: Enabled with 3 retries

### DynamoDB Settings
- **Billing Mode**: Pay-per-request
- **Point-in-time Recovery**: Enabled for production
- **Global Secondary Indexes**: Optimized for queries

## 📈 Monitoring & Logging

### CloudWatch Metrics
- Lambda function invocations and errors
- SQS queue depth and processing times
- DynamoDB read/write capacity
- API Gateway request counts

### Logging
- Structured JSON logging
- Request/response correlation
- Error tracking with stack traces
- Performance metrics

### Alerts
- Queue depth thresholds
- Lambda error rates
- Processing time anomalies
- Cost monitoring

## 🔒 Security

### IAM Permissions
- Least privilege access
- Resource-specific policies
- Cross-account access controls

### Data Protection
- S3 encryption at rest
- DynamoDB encryption at rest
- API Gateway HTTPS only
- Environment variable encryption

### Access Control
- CORS configuration
- API key authentication (optional)
- Rate limiting

## 💰 Cost Optimization

### Lambda Optimization
- Memory allocation tuning
- Cold start optimization
- Function bundling

### SQS Optimization
- Batch processing
- Long polling
- Dead letter queue management

### DynamoDB Optimization
- Efficient query patterns
- Index optimization
- Capacity planning

## 🧪 Testing

### Unit Tests
```bash
npm test
```

### Integration Tests
```bash
npm run test:integration
```

### Load Testing
```bash
npm run test:load
```

## 🔄 CI/CD

### GitHub Actions
- Automated testing
- Security scanning
- Deployment to staging/production
- Infrastructure validation

### Deployment Pipeline
1. Code commit
2. Automated tests
3. Security scan
4. Build artifacts
5. Deploy to staging
6. Integration tests
7. Deploy to production

## 🚨 Troubleshooting

### Common Issues

1. **Lambda Timeout**
   - Increase timeout settings
   - Optimize function code
   - Check external API calls

2. **SQS Message Processing**
   - Check queue depth
   - Verify Lambda permissions
   - Review dead letter queues

3. **DynamoDB Errors**
   - Check IAM permissions
   - Verify table names
   - Review capacity settings

### Debug Commands
```bash
# View logs
serverless logs -f ResumeParserWorker

# Monitor queues
aws sqs get-queue-attributes --queue-url $QUEUE_URL

# Check DynamoDB
aws dynamodb scan --table-name $TABLE_NAME --limit 5
```

## 📚 Additional Resources

- [Serverless Framework Documentation](https://www.serverless.com/framework/docs/)
- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [LangChain Documentation](https://js.langchain.com/docs/)
- [DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

