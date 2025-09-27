import { Router, Response, NextFunction } from 'express';
import { SecretsService } from '@/core/secrets/secrets.js';
import { verifyAdmin, AuthRequest } from '@/api/middleware/auth.js';
import { AuditService } from '@/core/logs/audit.js';
import { AppError } from '@/api/middleware/error.js';
import { ERROR_CODES } from '@/types/error-constants.js';

const router = Router();
const secretsService = new SecretsService();
const auditService = AuditService.getInstance();

/**
 * List all secrets (metadata only, no values)
 * GET /api/secrets
 */
router.get('/', verifyAdmin, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const secrets = await secretsService.listSecrets();
    res.json({ secrets });
  } catch (error) {
    next(error);
  }
});

/**
 * Get a specific secret value by key
 * GET /api/secrets/:key
 */
router.get('/:key', verifyAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { key } = req.params;
    const value = await secretsService.getSecretByKey(key);

    if (value === null) {
      throw new AppError(`Secret not found: ${key}`, 404, ERROR_CODES.NOT_FOUND);
    }

    // Log audit
    await auditService.log({
      actor: req.user?.email || 'api-key',
      action: 'GET_SECRET',
      module: 'SECRETS',
      details: { key },
      ip_address: req.ip,
    });

    res.json({ key, value });
  } catch (error) {
    next(error);
  }
});

/**
 * Create a new secret
 * POST /api/secrets
 */
router.post('/', verifyAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { key, value, isReserved, expiresAt } = req.body;

    // Validate input
    if (!key || !value) {
      throw new AppError('Both key and value are required', 400, ERROR_CODES.INVALID_INPUT);
    }

    // Validate key format (uppercase alphanumeric with underscores only)
    if (!/^[A-Z0-9_]+$/.test(key)) {
      throw new AppError(
        'Invalid key format. Use uppercase letters, numbers, and underscores only (e.g., STRIPE_API_KEY)',
        400,
        ERROR_CODES.INVALID_INPUT
      );
    }

    // Check if secret already exists
    const existing = await secretsService.getSecretByKey(key);
    if (existing !== null) {
      throw new AppError(`Secret already exists: ${key}`, 409, ERROR_CODES.INVALID_INPUT);
    }

    const result = await secretsService.createSecret({
      key,
      value,
      isReserved: isReserved || false,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });

    // Log audit
    await auditService.log({
      actor: req.user?.email || 'api-key',
      action: 'CREATE_SECRET',
      module: 'SECRETS',
      details: { key, id: result.id },
      ip_address: req.ip,
    });

    res.status(201).json({
      success: true,
      message: `Secret ${key} has been created successfully`,
      id: result.id,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Update an existing secret
 * PUT /api/secrets/:key
 */
router.put('/:key', verifyAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { key } = req.params;
    const { value, isActive, isReserved, expiresAt } = req.body;

    // Get existing secret
    const secrets = await secretsService.listSecrets();
    const secret = secrets.find((s) => s.key === key);

    if (!secret) {
      throw new AppError(`Secret not found: ${key}`, 404, ERROR_CODES.NOT_FOUND);
    }

    const success = await secretsService.updateSecret(secret.id, {
      value,
      isActive,
      isReserved,
      expiresAt: expiresAt !== undefined ? (expiresAt ? new Date(expiresAt) : null) : undefined,
    });

    if (!success) {
      throw new AppError(`Failed to update secret: ${key}`, 500, ERROR_CODES.INTERNAL_ERROR);
    }

    // Log audit
    await auditService.log({
      actor: req.user?.email || 'api-key',
      action: 'UPDATE_SECRET',
      module: 'SECRETS',
      details: { key, updates: { hasNewValue: !!value, isActive, isReserved, expiresAt } },
      ip_address: req.ip,
    });

    res.json({
      success: true,
      message: `Secret ${key} has been updated successfully`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Delete a secret (mark as inactive)
 * DELETE /api/secrets/:key
 */
router.delete('/:key', verifyAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { key } = req.params;

    // Get existing secret
    const secrets = await secretsService.listSecrets();
    const secret = secrets.find((s) => s.key === key);

    if (!secret) {
      throw new AppError(`Secret not found: ${key}`, 404, ERROR_CODES.NOT_FOUND);
    }

    // Check if secret is reserved
    if (secret.isReserved) {
      throw new AppError(`Cannot delete reserved secret: ${key}`, 403, ERROR_CODES.FORBIDDEN);
    }

    // Mark as inactive instead of hard delete
    const success = await secretsService.updateSecret(secret.id, { isActive: false });

    if (!success) {
      throw new AppError(`Failed to delete secret: ${key}`, 500, ERROR_CODES.INTERNAL_ERROR);
    }

    // Log audit
    await auditService.log({
      actor: req.user?.email || 'api-key',
      action: 'DELETE_SECRET',
      module: 'SECRETS',
      details: { key },
      ip_address: req.ip,
    });

    res.json({
      success: true,
      message: `Secret ${key} has been deleted successfully`,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
