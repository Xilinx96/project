require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Ensure environment variables are loaded
if (!process.env.GEMINI_API_KEY) {
  console.error('❌ ERROR: GEMINI_API_KEY is not set.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// CORS Configuration
const allowedOrigins = [
  'https://goglelens.onrender.com/', // 🔧 Update with your frontend URL
  'http://localhost:5500',         // For local development
  'http://127.0.0.1:5500'          // Alternative localhost
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`⚠️ CORS blocked request from: ${origin}`);
      callback(new Error('CORS not allowed for this origin'));
    }
  },
  credentials: true,
  methods: ['POST', 'GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

// Initialize Gemini AI model
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: "Google Lens OCR API",
    endpoints: {
      ocr: {
        path: "/api/ocr",
        method: "POST",
        description: "Accepts base64 image data"
      },
      health: "/health"
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// OCR Endpoint
app.post('/api/ocr', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image || !image.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Invalid or missing base64 image data' });
    }

    const imageParts = [{
      inlineData: {
        data: image,
        mimeType: 'image/png',
      },
    }];

    const textPrompt = "Extract all readable text from the given image. If no text is found, return 'NO_TEXT_DETECTED'.";

    const result = await model.generateContent([textPrompt, ...imageParts]);
    const extractedText = (await result.response.text())
      .replace(/NO_TEXT_DETECTED/gi, '') // Clean response
      .trim();

    if (!extractedText) {
      return res.status(404).json({ error: 'No text found' });
    }

    res.status(200).json({ success: true, text: extractedText });

  } catch (error) {
    console.error(`🚨 API Error: ${error.stack}`);
    res.status(500).json({ 
      error: 'Server error',
      message: error.message,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  }
});

// Catch-all for unknown routes
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found', availableEndpoints: ['/api/ocr', '/health'] });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
});