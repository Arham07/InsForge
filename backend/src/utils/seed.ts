import { AuthService } from '@/core/auth/auth.js';
import { DatabaseManager } from '@/core/database/database.js';
import { AIConfigService } from '@/core/ai/config.js';
import { isCloudEnvironment } from '@/utils/environment.js';
import logger from '@/utils/logger.js';

/**
 * Validates admin credentials are configured
 * Admin is authenticated via environment variables, not stored in DB
 */
async function ensureFirstAdmin(adminEmail: string, adminPassword: string): Promise<void> {
  if (adminEmail && adminPassword) {
    logger.info(`✅ Admin configured: ${adminEmail}`);
  } else {
    logger.warn('⚠️ Admin credentials not configured - check ADMIN_EMAIL and ADMIN_PASSWORD');
  }
}

/**
 * Seeds default AI configurations for cloud environments
 */
async function seedDefaultAIConfigs(): Promise<void> {
  // Only seed default AI configs in cloud environment
  if (!isCloudEnvironment()) {
    return;
  }
  
  const aiConfigService = new AIConfigService();
  
  // Check if AI configs already exist
  const existingConfigs = await aiConfigService.findAll();
  
  if (existingConfigs.length > 0) {
    return;
  }
  
  // TODO: change the default text model once confirmed, also need to change the corresponding ai docs
  // best if we can add the current active models in metadata
  await aiConfigService.create(
    'text',
    'openrouter',
    'anthropic/claude-3.5-haiku',
    'You are a helpful assistant.'
  );
  
  await aiConfigService.create(
    'image',
    'openrouter',
    'google/gemini-2.5-flash-image-preview'
  );
  
  logger.info('✅ Default AI models configured (cloud environment)');
}



// Create api key, admin user, and default AI configs
export async function seedBackend(): Promise<void> {
  const authService = AuthService.getInstance();
  const dbManager = DatabaseManager.getInstance();

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'change-this-password';

  try {
    logger.info(`\n🚀 Insforge Backend Starting...`);

    // Validate admin credentials are configured
    await ensureFirstAdmin(adminEmail, adminPassword);

    // Initialize API key (from env or generate)
    const apiKey = await authService.initializeApiKey();

    // Get database stats
    const tableCount = await dbManager.getUserTableCount();

    logger.info(`✅ Database connected to PostgreSQL`, {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: process.env.POSTGRES_PORT || '5432',
      database: process.env.POSTGRES_DB || 'insforge',
    });
    // Database connection info is already logged above

    if (tableCount > 0) {
      logger.info(`✅ Found ${tableCount} user tables`);
    }
    
    // seed AI configs for cloud environment
    await seedDefaultAIConfigs();
    
    logger.info(`API key generated: ${apiKey}`);
    logger.info(`Setup complete:
      - Save this API key for your apps!
      - Dashboard: http://localhost:7131
      - API: http://localhost:7130/api
    `);
  } catch (error) {
    logger.error('Error during setup', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
