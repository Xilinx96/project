require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const app = express();
const PORT = process.env.PORT || 3000;
const cors = require('cors');
const { validateImageInput } = require('./validation'); // Create a validation helper file

// Configure CORS with specific origins in production
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-frontend-domain.com'] 
    : '*',
  methods: ['POST', 'GET'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

app.use(express.json({ limit: '10mb' }));

// Validate environment variables on startup
if (!process.env.GEMINI_API_KEY) {
  console.error('FATAL ERROR: GEMINI_API_KEY is not defined.');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
  model: 'gemini-1.5-flash',
  safetySettings: [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' }
  ]
});

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second initial delay

async function retryApiCall(fn, retries = MAX_RETRIES) {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0 || !isRetryableError(error)) {
      throw error;
    }
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (MAX_RETRIES - retries + 1)));
    return retryApiCall(fn, retries - 1);
  }
}

function isRetryableError(error) {
  // Retry on network errors or server-side errors
  return !error.response || error.response.status >= 500;
}

app.get('/', (req, res) => {
  res.status(200).json({ 
    status: 'OK',
    message: 'Gemini API service is operational',
    timestamp: new Date().toISOString()
  });
});

app.post('/api/ocr', async (req, res) => {
  try {
    const { image } = req.body;
    
    // Input validation
    if (!image || !validateImageInput(image)) {
      return res.status(400).json({
        error: 'Invalid request',
        details: 'Missing or invalid image data'
      });
    }

    const imageParts = [{
      inlineData: {
        data: image,
        mimeType: 'image/png'
      }
    }];

    const textPrompt = "Extract all readable text from the given image while preserving its original formatting. If no text is detected, try to describe the image that you see and return 'NO_TEXT_DETECTED' .";

    // Retryable API call with exponential backoff
    const result = await retryApiCall(async () => {
      try {
        return await model.generateContent([textPrompt, ...imageParts]);
      } catch (error) {
        error.isRetryable = !error.message.includes('invalid');
        throw error;
      }
    });

    const response = await result.response;
    const extractedText = response.text();

    if (!extractedText || extractedText.includes('NO_TEXT_DETECTED')) {
      return res.status(404).json({
        error: 'No text found',
        details: 'The image does not contain detectable text'
      });
    }

    res.status(200).json({ 
      success: true,
      text: extractedText,
      processedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error(`API Error: ${error.message}`, {
      timestamp: new Date().toISOString(),
      stack: error.stack
    });

    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.error?.message || 'Failed to process image';

    res.status(statusCode).json({
      error: 'Processing error',
      details: errorMessage,
      retriesAttempted: MAX_RETRIES - error.retriesLeft,
      suggestion: statusCode === 429 ? 'Please reduce request frequency' : ''
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Handle 404
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    availableEndpoints: ['POST /api/ocr', 'GET /health']
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
});