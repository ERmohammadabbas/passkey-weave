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
const PORT = process.env.PORT || 3001;
const WORKER_ID = process.env.WORKER_ID || `worker-${uuidv4().substring(0, 8)}`;

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
app.use('/issue', limiter);

// Swagger documentation
const swaggerDocument = YAML.load(path.join(__dirname, '../swagger.yaml'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'healthy', worker: WORKER_ID, timestamp: new Date().toISOString() });
});

// Issue credential endpoint
app.post('/issue', async (req: Request, res: Response) => {
  try {
    const credential = req.body;

    if (!credential || typeof credential !== 'object') {
      logger.warn('Invalid credential format received');
      return res.status(400).json({ message: 'Invalid credential format' });
    }

    // Generate a unique credential ID if not provided
    const credentialId = credential.id || uuidv4();
    const credentialWithId = { ...credential, id: credentialId };

    // Check if credential already exists
    const exists = await storage.exists(credentialId);
    if (exists) {
      logger.info(`Credential ${credentialId} already issued`);
      return res.status(409).json({ message: 'Credential already issued' });
    }

    // Store the credential
    await storage.save(credentialId, {
      credential: credentialWithId,
      worker: WORKER_ID,
      timestamp: new Date().toISOString(),
    });

    logger.info(`Credential ${credentialId} issued by ${WORKER_ID}`);

    res.status(201).json({
      message: `Credential issued by ${WORKER_ID}`,
      worker: WORKER_ID,
      credentialId,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error(`Error issuing credential: ${error.message}`);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Start server
app.listen(PORT, () => {
  logger.info(`Issuance Service (${WORKER_ID}) running on port ${PORT}`);
  logger.info(`API Documentation available at http://localhost:${PORT}/api-docs`);
});

export default app;
