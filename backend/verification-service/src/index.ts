import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { storage } from './storage';
import { logger } from './logger';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3002;
const WORKER_ID = process.env.WORKER_ID || `verifier-${uuidv4().substring(0, 8)}`;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/verify', limiter);

// Swagger documentation
const swaggerDocument = YAML.load(path.join(__dirname, '../swagger.yaml'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'healthy', worker: WORKER_ID, timestamp: new Date().toISOString() });
});

// Verify credential endpoint
app.post('/verify', async (req: Request, res: Response) => {
  try {
    const credential = req.body;

    if (!credential || typeof credential !== 'object') {
      logger.warn('Invalid credential format received for verification');
      return res.status(400).json({ message: 'Invalid credential format' });
    }

    const credentialId = credential.id;
    if (!credentialId) {
      logger.warn('Credential ID missing in verification request');
      return res.status(400).json({ message: 'Credential ID is required' });
    }

    // Check if credential exists
    const credentialData = await storage.get(credentialId);

    if (!credentialData) {
      logger.info(`Credential ${credentialId} not found`);
      return res.status(404).json({
        status: 'invalid',
        message: 'Credential not found',
      });
    }

    logger.info(`Credential ${credentialId} verified successfully`);

    res.json({
      status: 'valid',
      worker: credentialData.worker,
      timestamp: credentialData.timestamp,
      credential: credentialData.credential,
    });
  } catch (error: any) {
    logger.error(`Error verifying credential: ${error.message}`);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Start server
app.listen(PORT, () => {
  logger.info(`Verification Service (${WORKER_ID}) running on port ${PORT}`);
  logger.info(`API Documentation available at http://localhost:${PORT}/api-docs`);
});

export default app;
