import { Router, Request, Response, NextFunction } from 'express';
import { AuthService } from '@/core/auth/auth.js';
import { AuditService } from '@/core/audit/audit.js';
import { AppError } from '@/api/middleware/error.js';
import { ERROR_CODES } from '@/types/error-constants.js';
import { successResponse } from '@/utils/response.js';
import { AuthRequest, verifyAdmin } from '@/api/middleware/auth.js';
import logger from '@/utils/logger.js';
import jwt from 'jsonwebtoken';
import {
  userIdSchema,
  createUserRequestSchema,
  createSessionRequestSchema,
  createAdminSessionRequestSchema,
  deleteUsersRequestSchema,
  listUsersRequestSchema,
  type CreateUserResponse,
  type CreateSessionResponse,
  type CreateAdminSessionResponse,
  type GetCurrentSessionResponse,
  type ListUsersResponse,
  type DeleteUsersResponse,
  exchangeAdminSessionRequestSchema,
} from '@insforge/shared-schemas';

const router = Router();
const authService = AuthService.getInstance();
const auditService = AuditService.getInstance();

// POST /api/auth/users - Create a new user (registration)
router.post('/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = createUserRequestSchema.safeParse(req.body);
    if (!validationResult.success) {
      throw new AppError(
        validationResult.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        ERROR_CODES.INVALID_INPUT
      );
    }

    const { email, password, name } = validationResult.data;
    const result: CreateUserResponse = await authService.register(email, password, name);

    successResponse(res, result);
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/sessions - Create a new session (login)
router.post('/sessions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = createSessionRequestSchema.safeParse(req.body);
    if (!validationResult.success) {
      throw new AppError(
        validationResult.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        ERROR_CODES.INVALID_INPUT
      );
    }

    const { email, password } = validationResult.data;
    const result: CreateSessionResponse = await authService.login(email, password);

    successResponse(res, result);
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/admin/sessions/exchange - Create admin session
router.post('/admin/sessions/exchange', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = exchangeAdminSessionRequestSchema.safeParse(req.body);
    if (!validationResult.success) {
      throw new AppError(
        validationResult.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        ERROR_CODES.INVALID_INPUT
      );
    }

    const { code } = validationResult.data;
    const result: CreateAdminSessionResponse =
      await authService.adminLoginWithAuthorizationCode(code);

    successResponse(res, result);
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      // Convert other errors (like JWT verification errors) to 400
      next(
        new AppError(
          'Failed to exchange admin session' + (error instanceof Error ? `: ${error.message}` : ''),
          400,
          ERROR_CODES.INVALID_INPUT
        )
      );
    }
  }
});

// POST /api/auth/admin/sessions - Create admin session
router.post('/admin/sessions', (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = createAdminSessionRequestSchema.safeParse(req.body);
    if (!validationResult.success) {
      throw new AppError(
        validationResult.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        ERROR_CODES.INVALID_INPUT
      );
    }

    const { email, password } = validationResult.data;
    const result: CreateAdminSessionResponse = authService.adminLogin(email, password);

    successResponse(res, result);
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/sessions/current - Get current session user
router.get('/sessions/current', (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('No token provided', 401, ERROR_CODES.AUTH_INVALID_CREDENTIALS);
    }

    const token = authHeader.substring(7);
    const payload = authService.verifyToken(token);

    const response: GetCurrentSessionResponse = {
      user: {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      },
    };

    res.json(response);
  } catch {
    next(new AppError('Invalid token', 401, ERROR_CODES.AUTH_INVALID_CREDENTIALS));
  }
});

// GET /api/auth/users - List all users (admin only)
router.get('/users', verifyAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const queryValidation = listUsersRequestSchema.safeParse(req.query);
    const queryParams = queryValidation.success ? queryValidation.data : req.query;
    const { limit = '10', offset = '0', search } = queryParams || {};
    const db = authService.getDb();

    let query = `
      SELECT 
        u.id, 
        u.email, 
        u.name, 
        u.email_verified, 
        u.created_at, 
        u.updated_at,
        u.password,
        STRING_AGG(a.provider, ',') as providers
      FROM _accounts u
      LEFT JOIN _oauth_connections a ON u.id = a.user_id
    `;
    const params: any[] = [];

    if (search) {
      query += ' WHERE u.email LIKE ? OR u.name LIKE ?';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' GROUP BY u.id ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit as string), parseInt(offset as string));

    const dbUsers = await db.prepare(query).all(...params);

    // Simple transformation - just format the provider as identities
    const users = dbUsers.map((dbUser: any) => {
      const identities = [];
      const providers: string[] = [];

      // Add social providers if any
      if (dbUser.providers) {
        dbUser.providers.split(',').forEach((provider: string) => {
          identities.push({ provider });
          providers.push(provider);
        });
      }

      // Add email provider if password exists
      if (dbUser.password) {
        identities.push({ provider: 'email' });
        providers.push('email');
      }

      // Use first provider to determine type: 'email' or 'social'
      const firstProvider = providers[0];
      const provider_type = firstProvider === 'email' ? 'email' : 'social';

      // Return snake_case for frontend compatibility
      return {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        email_verified: dbUser.email_verified,
        created_at: dbUser.created_at,
        updated_at: dbUser.updated_at,
        identities: identities,
        provider_type: provider_type,
      };
    });

    let countQuery = 'SELECT COUNT(*) as count FROM _accounts';
    const countParams: any[] = [];
    if (search) {
      countQuery += ' WHERE email LIKE ? OR name LIKE ?';
      countParams.push(`%${search}%`, `%${search}%`);
    }
    const { count } = await db.prepare(countQuery).get(...countParams);

    const response: ListUsersResponse = {
      data: users,
      pagination: {
        offset: parseInt(offset as string),
        limit: parseInt(limit as string),
        total: count,
      },
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/users/:id - Get specific user (admin only)
router.get(
  '/users/:userId',
  verifyAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate userId path parameter directly
      const userIdValidation = userIdSchema.safeParse(req.params.userId);
      if (!userIdValidation.success) {
        throw new AppError('Invalid user ID format', 400, ERROR_CODES.INVALID_INPUT);
      }

      const userId = userIdValidation.data;
      const db = authService.getDb();

      const dbUser = await db
        .prepare(
          `
      SELECT 
        u.id, 
        u.email, 
        u.name, 
        u.email_verified, 
        u.created_at, 
        u.updated_at,
        u.password,
        STRING_AGG(a.provider, ',') as providers
      FROM _accounts u
      LEFT JOIN _oauth_connections a ON u.id = a.user_id
      WHERE u.id = ?
      GROUP BY u.id
    `
        )
        .get(userId);

      if (!dbUser) {
        throw new AppError('User not found', 404, ERROR_CODES.NOT_FOUND);
      }

      // Simple transformation - just format the provider as identities
      const identities = [];
      const providers: string[] = [];

      // Add social providers if any
      if (dbUser.providers) {
        dbUser.providers.split(',').forEach((provider: string) => {
          identities.push({ provider });
          providers.push(provider);
        });
      }

      // Add email provider if password exists
      if (dbUser.password) {
        identities.push({ provider: 'Email' });
        providers.push('email');
      }

      // Use first provider to determine type: 'email' or 'social'
      const firstProvider = providers[0];
      const provider_type = firstProvider === 'email' ? 'Email' : 'Social';

      // Return snake_case for frontend compatibility
      const user = {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        email_verified: dbUser.email_verified,
        created_at: dbUser.created_at,
        updated_at: dbUser.updated_at,
        identities: identities,
        provider_type: provider_type,
      };

      res.json(user);
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/auth/users - Delete users (batch operation, admin only)
router.delete(
  '/users',
  verifyAdmin,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const validationResult = deleteUsersRequestSchema.safeParse(req.body);
      if (!validationResult.success) {
        throw new AppError(
          validationResult.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
          400,
          ERROR_CODES.INVALID_INPUT
        );
      }

      const { userIds } = validationResult.data;

      const db = authService.getDb();
      const placeholders = userIds.map(() => '?').join(',');

      await db.prepare(`DELETE FROM _accounts WHERE id IN (${placeholders})`).run(...userIds);

      // Log audit for user deletion
      await auditService.log({
        actor: req.user?.email || 'api-key',
        action: 'DELETE_USERS',
        module: 'AUTH',
        details: {
          userIds,
          deletedCount: userIds.length,
        },
        ip_address: req.ip,
      });

      const response: DeleteUsersResponse = {
        message: 'Users deleted successfully',
        deletedCount: userIds.length,
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// OAuth endpoints following naming convention: /oauth/:provider and /oauth/:provider/callback
router.get('/oauth/google', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { redirect_uri } = req.query;
    if (!redirect_uri) {
      throw new AppError('Redirect URI is required', 400, ERROR_CODES.INVALID_INPUT);
    }

    const jwtPayload = {
      provider: 'google',
      redirectUrl: redirect_uri ? (redirect_uri as string) : undefined,
      createdAt: Date.now(),
    };
    const state = jwt.sign(jwtPayload, process.env.JWT_SECRET || 'default_secret', {
      algorithm: 'HS256',
      expiresIn: '1h', // Set expiration time for the state token
    });
    const authUrl = await authService.generateGoogleAuthUrl(state);

    res.json({ authUrl });
  } catch (error) {
    logger.error('Google OAuth error', { error });
    next(
      new AppError(
        'Google OAuth is not properly configured. Please check environment variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI',
        500,
        ERROR_CODES.AUTH_OAUTH_CONFIG_ERROR
      )
    );
  }
});

router.get('/oauth/github', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { redirect_uri } = req.query;
    if (!redirect_uri) {
      throw new AppError('Redirect URI is required', 400, ERROR_CODES.INVALID_INPUT);
    }

    const jwtPayload = {
      provider: 'github',
      redirectUrl: redirect_uri ? (redirect_uri as string) : undefined,
      createdAt: Date.now(),
    };
    const state = jwt.sign(jwtPayload, process.env.JWT_SECRET || 'default_secret', {
      algorithm: 'HS256',
      expiresIn: '1h', // Set expiration time for the state token
    });

    const authUrl = await authService.generateGitHubAuthUrl(state);

    res.json({ authUrl });
  } catch (error) {
    logger.error('GitHub OAuth error', { error });
    next(
      new AppError(
        'GitHub OAuth is not properly configured. Please check environment variables: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_REDIRECT_URI',
        500,
        ERROR_CODES.AUTH_OAUTH_CONFIG_ERROR
      )
    );
  }
});

router.get(
  '/oauth/shared/callback/:state',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { state } = req.params;
      const { success, error, payload } = req.query;

      if (!state) {
        logger.warn('Shared OAuth callback called without state parameter');
        throw new AppError('State parameter is required', 400, ERROR_CODES.INVALID_INPUT);
      }

      let redirectUrl: string;
      let provider: string;
      try {
        const decodedState = jwt.verify(state, process.env.JWT_SECRET || 'default_secret') as {
          provider: string;
          redirectUrl: string;
        };
        redirectUrl = decodedState.redirectUrl || '/';
        provider = decodedState.provider || '';
      } catch {
        logger.warn('Invalid state parameter', { state });
        throw new AppError('Invalid state parameter', 400, ERROR_CODES.INVALID_INPUT);
      }

      if (!['google', 'github'].includes(provider)) {
        logger.warn('Invalid provider in state', { provider });
        throw new AppError('Invalid provider in state', 400, ERROR_CODES.INVALID_INPUT);
      }
      if (!redirectUrl) {
        throw new AppError('Redirect URL is required', 400, ERROR_CODES.INVALID_INPUT);
      }

      if (success !== 'true') {
        const errorMessage = error || 'OAuth authentication failed';
        logger.warn('Shared OAuth callback failed', { error: errorMessage, provider });
        return res.redirect(`${redirectUrl}?error=${encodeURIComponent(String(errorMessage))}`);
      }
      if (!payload) {
        throw new AppError('No payload provided in callback', 400, ERROR_CODES.INVALID_INPUT);
      }

      const payloadData = JSON.parse(Buffer.from(payload as string, 'base64').toString('utf8'));
      let result;
      if (provider === 'google') {
        // Handle Google OAuth payload
        const googleUserInfo = {
          sub: payloadData.providerId,
          email: payloadData.email,
          name: payloadData.name || '',
          userName: payloadData.userName || '',
          picture: payloadData.avatar || '',
        };
        result = await authService.findOrCreateGoogleUser(googleUserInfo);
      } else if (provider === 'github') {
        // Handle GitHub OAuth payload
        const githubUserInfo = {
          id: payloadData.providerId,
          email: payloadData.email,
          name: payloadData.name || '',
          avatar_url: payloadData.avatar || '',
        };
        result = await authService.findOrCreateGitHubUser(githubUserInfo);
      }

      const finalRedirectUrl = new URL(redirectUrl);
      finalRedirectUrl.searchParams.set('access_token', result!.accessToken);
      finalRedirectUrl.searchParams.set('user_id', result!.user.id);
      finalRedirectUrl.searchParams.set('email', result!.user.email);
      finalRedirectUrl.searchParams.set('name', result!.user.name || '');
      res.redirect(finalRedirectUrl.toString());
    } catch (error) {
      logger.error('Shared OAuth callback error', { error });
      next(error);
    }
  }
);

router.get('/oauth/:provider/callback', async (req: Request, res: Response, _: NextFunction) => {
  try {
    const { provider } = req.params;
    const { code, state, token } = req.query;

    let redirectUrl = '/';

    if (state) {
      try {
        const stateData = jwt.verify(
          state as string,
          process.env.JWT_SECRET || 'default_secret'
        ) as {
          provider: string;
          redirectUrl: string;
        };
        redirectUrl = stateData.redirectUrl || '/';
      } catch {
        // Invalid state
      }
    }

    if (!['google', 'github'].includes(provider)) {
      throw new AppError('Invalid provider', 400, ERROR_CODES.INVALID_INPUT);
    }

    let result;

    if (provider === 'google') {
      let id_token: string;

      if (token) {
        id_token = token as string;
      } else if (code) {
        const tokens = await authService.exchangeCodeToTokenByGoogle(code as string);
        id_token = tokens.id_token;
      } else {
        throw new AppError(
          'No authorization code or token provided',
          400,
          ERROR_CODES.INVALID_INPUT
        );
      }

      const googleUserInfo = await authService.verifyGoogleToken(id_token);
      result = await authService.findOrCreateGoogleUser(googleUserInfo);
    } else if (provider === 'github') {
      if (!code) {
        throw new AppError('No authorization code provided', 400, ERROR_CODES.INVALID_INPUT);
      }

      const accessToken = await authService.exchangeGitHubCodeForToken(code as string);
      const githubUserInfo = await authService.getGitHubUserInfo(accessToken);
      result = await authService.findOrCreateGitHubUser(githubUserInfo);
    }

    // Create URL with JWT token and user info (like the working example)
    const finalRedirectUrl = new URL(redirectUrl);
    finalRedirectUrl.searchParams.set('access_token', result!.accessToken);
    finalRedirectUrl.searchParams.set('user_id', result!.user.id);
    finalRedirectUrl.searchParams.set('email', result!.user.email);
    finalRedirectUrl.searchParams.set('name', result!.user.name || '');

    logger.info('OAuth callback successful, redirecting with token', {
      redirectUrl: finalRedirectUrl.toString(),
      hasAccessToken: !!result!.accessToken,
      userId: result!.user.id,
    });

    // Redirect directly to the app with token in URL
    return res.redirect(finalRedirectUrl.toString());
  } catch (error) {
    logger.error('OAuth callback error', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      provider: req.params.provider,
      hasCode: !!req.query.code,
      hasState: !!req.query.state,
      hasToken: !!req.query.token,
    });

    // Redirect to app with error message
    const { state } = req.query;
    const redirectUrl = state
      ? (() => {
          try {
            const stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
            return stateData.redirectUrl || '/';
          } catch {
            return '/';
          }
        })()
      : '/';

    const errorMessage = error instanceof Error ? error.message : 'OAuth authentication failed';

    // Redirect with error in URL parameters
    const errorRedirectUrl = new URL(redirectUrl);
    errorRedirectUrl.searchParams.set('error', errorMessage);

    return res.redirect(errorRedirectUrl.toString());
  }
});

// POST /api/auth/tokens/anon - Generate anonymous JWT token (never expires)
router.post('/tokens/anon', verifyAdmin, (_req: Request, res: Response, next: NextFunction) => {
  try {
    const token = authService.generateAnonToken();

    successResponse(res, {
      accessToken: token,
      message: 'Anonymous token generated successfully (never expires)',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
