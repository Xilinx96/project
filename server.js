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

// Configure CORS (update for production)
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' ? ['https://project-209p.onrender.com'] : '*',
  methods: ['POST', 'GET'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

// Initialize Gemini AI model
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
  model: 'gemini-1.5-flash'
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// OCR Endpoint
app.post('/api/ocr', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'Missing image data' });
    }
    
    if (!image || !image.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Invalid or missing base64 image data' });
    }

    const imageParts = [{
      inlineData: {
        data: image, // Expecting base64 encoded image
        mimeType: 'image/png' // Adjust if different
      }
    }];

    const textPrompt = "Extract all readable text from the given image. If no text is found, return 'NO_TEXT_DETECTED'.";

    const result = await model.generateContent([textPrompt, ...imageParts]);
    const extractedText = await result.response.text();

    if (!extractedText || extractedText.includes('NO_TEXT_DETECTED')) {
      return res.status(404).json({ error: 'No text found' });
    }

    res.status(200).json({ success: true, text: extractedText });

  } catch (error) {
    console.error(`🚨 API Error: ${error.message}`, { timestamp: new Date().toISOString() });
    res.status(500).json({ error: 'Server error', details: error.message });
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
