# MatchaCV - Resume ATS Optimization Tool

A powerful resume optimization tool that helps job seekers improve their ATS (Applicant Tracking System) compatibility scores and receive AI-powered suggestions for resume improvements.

## Project Structure

```
MatchaCV/
├── frontend/          # Frontend files (HTML, CSS, JavaScript)
│   ├── index.html     # Homepage
│   ├── upload.html    # Upload page
│   ├── style.css      # Styles
│   ├── script.js      # Homepage scripts
│   └── upload.js      # Upload page scripts
│
├── backend/           # Backend files (Node.js, Express)
│   ├── server.js      # Main server file
│   ├── database/      # Database connection and schema
│   ├── queue/         # Redis/Bull queue configuration
│   ├── utils/         # Utility modules (parsers, analyzers, etc.)
│   ├── worker/        # Background worker for job processing
│   ├── scripts/       # Setup and utility scripts
│   └── uploads/       # Temporary file storage
│
├── node_modules/     # Dependencies
├── .env              # Environment variables (not in git)
└── README.md         # This file
```

## Features

- **ATS Score Calculation**: Get a comprehensive ATS compatibility score
- **AI-Powered Suggestions**: Receive personalized resume improvement suggestions using OpenAI
- **Job Description Analysis**: Analyze resumes against specific job postings
- **Real-time Processing**: Asynchronous job processing with WebSocket updates
- **Multiple File Formats**: Support for PDF, DOC, and DOCX files

## Setup

1. **Install Dependencies**
   ```bash
   cd backend
   npm install
   ```

2. **Configure Environment Variables**
   Create a `.env` file in the root directory with:
   ```
   OPENAI_API_KEY=your_openai_api_key
   AWS_ACCESS_KEY_ID=your_aws_key
   AWS_SECRET_ACCESS_KEY=your_aws_secret
   AWS_REGION=us-east-1
   AWS_S3_BUCKET=your_bucket_name
   DATABASE_URL=your_postgresql_url
   REDIS_URL=redis://localhost:6379
   RECAPTCHA_SECRET_KEY=your_recaptcha_secret
   ```

3. **Setup Database**
   ```bash
   node backend/scripts/setup-database.js
   ```

4. **Setup Redis**
   ```bash
   bash backend/scripts/setup-redis.sh
   ```

5. **Start the Server**
   ```bash
   cd backend
   npm start
   ```

6. **Start the Worker** (in a separate terminal)
   ```bash
   cd backend
   npm run worker
   ```

## Usage

1. Open your browser and navigate to `http://localhost:3000`
2. Click "Get Started" and complete the reCAPTCHA
3. Upload your resume (PDF, DOC, or DOCX)
4. Paste a job description
5. Click "Analyze Resume" to get your ATS score and suggestions

## Built With

- Node.js
- Express
- PostgreSQL
- Redis
- AWS S3
- Socket.IO
- OpenAI
- JavaScript
- HTML5
- CSS3
