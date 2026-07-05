/**
 * OpenAPI path definitions — auth, profile, devices, health
 */

/**
 * @swagger
 * /auth/csrf-token:
 *   get:
 *     summary: Get CSRF token
 *     description: Returns a CSRF token required for cookie-based login, refresh, and logout.
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: CSRF token issued
 *         content:
 *           application/json:
 *             example:
 *               csrfToken: "abc123csrf"
 */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     description: |
 *       Creates a user account and sends an OTP for email verification.
 *       - JSON body defaults role to LISTENER.
 *       - multipart/form-data defaults role to AUTHOR (author registration requires multipart).
 *       - GLOBAL_ADMIN cannot be assigned during registration.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *           examples:
 *             listener:
 *               summary: Listener registration (JSON)
 *               value:
 *                 email: "listener@example.com"
 *                 password: "SecurePass123!"
 *                 confirmPassword: "SecurePass123!"
 *                 role: "LISTENER"
 *                 address: "123 Main St, Mumbai"
 *                 contact: "+919876543210"
 *             orgAdmin:
 *               summary: Organization admin registration (JSON)
 *               value:
 *                 email: "orgadmin@example.com"
 *                 password: "SecurePass123!"
 *                 confirmPassword: "SecurePass123!"
 *                 role: "ORG_ADMIN"
 *                 address: "456 Office Park, Delhi"
 *                 contact: "+919876543211"
 *                 firstName: "Alex"
 *                 lastName: "Admin"
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *           examples:
 *             author:
 *               summary: Author registration (multipart)
 *               value:
 *                 email: "author@example.com"
 *                 password: "SecurePass123!"
 *                 confirmPassword: "SecurePass123!"
 *                 role: "AUTHOR"
 *                 firstName: "Jane"
 *                 lastName: "Doe"
 *                 address: "789 Writer Lane, Bangalore"
 *                 contact: "+919876543212"
 *     responses:
 *       201:
 *         description: Registration initiated (OTP verification required)
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login with email and password
 *     description: |
 *       Authenticates a user. Requires CSRF header when using cookie-based refresh tokens.
 *
 *       **Slug rules (optional `slug` field):**
 *       - **LISTENER** — omit `slug`; response has no `appType`.
 *       - **ORG_ADMIN / ORG_COORDINATOR** — provide organization slug; user must be a member; response includes `appType: "organization"`.
 *       - **AUTHOR** — provide author slug; slug must belong to the authenticated user; response includes `appType: "author"`.
 *
 *       Set `clientType: "browser"` to receive refresh token as httpOnly cookie (omitted from body).
 *       Set `app: "partner"` for partner-portal login (restricts to org staff, authors, and global admins).
 *     tags: [Auth]
 *     parameters:
 *       - in: header
 *         name: X-CSRF-Token
 *         schema: { type: string }
 *         description: CSRF token from GET /auth/csrf-token (required for browser cookie flow)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *           examples:
 *             listener:
 *               summary: Listener login (no slug)
 *               value:
 *                 email: "listener@example.com"
 *                 password: "SecurePass123!"
 *                 clientType: "browser"
 *                 device:
 *                   deviceId: "browser-abc123"
 *                   deviceName: "Chrome on Windows"
 *                   platform: "web"
 *             organizationStaff:
 *               summary: Organization staff login (org slug)
 *               value:
 *                 email: "orgadmin@example.com"
 *                 password: "SecurePass123!"
 *                 slug: "acme-publishing"
 *                 clientType: "browser"
 *                 device:
 *                   deviceId: "browser-abc123"
 *                   deviceName: "Chrome on Windows"
 *                   platform: "web"
 *             authorWithSlug:
 *               summary: Author login (author slug)
 *               value:
 *                 email: "author@example.com"
 *                 password: "SecurePass123!"
 *                 slug: "jane-doe-a1b2c3d4"
 *                 clientType: "browser"
 *                 device:
 *                   deviceId: "browser-abc123"
 *                   deviceName: "Chrome on Windows"
 *                   platform: "web"
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *             examples:
 *               listener:
 *                 summary: Listener response (no appType)
 *                 value:
 *                   message: "Login successful"
 *                   accessToken: "eyJhbGciOiJSUzI1NiIs..."
 *                   user:
 *                     id: "cuser1234567890abcdefghij"
 *                     email: "listener@example.com"
 *                     role: "LISTENER"
 *                     emailVerified: true
 *               organizationStaff:
 *                 summary: Organization staff response
 *                 value:
 *                   message: "Login successful"
 *                   accessToken: "eyJhbGciOiJSUzI1NiIs..."
 *                   appType: "organization"
 *                   user:
 *                     id: "cuser1234567890abcdefghij"
 *                     email: "orgadmin@example.com"
 *                     role: "ORG_ADMIN"
 *                     emailVerified: true
 *               authorWithSlug:
 *                 summary: Author response
 *                 value:
 *                   message: "Login successful"
 *                   accessToken: "eyJhbGciOiJSUzI1NiIs..."
 *                   appType: "author"
 *                   user:
 *                     id: "cuser1234567890abcdefghij"
 *                     email: "author@example.com"
 *                     role: "AUTHOR"
 *                     emailVerified: true
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /auth/login/mobile:
 *   post:
 *     summary: Mobile login with PKCE
 *     description: |
 *       Same login semantics as POST /auth/login (including optional `slug` for org/author context),
 *       plus PKCE parameters. Refresh token is always returned in the response body.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MobileLoginRequest'
 *           examples:
 *             listener:
 *               summary: Mobile listener login
 *               value:
 *                 email: "listener@example.com"
 *                 password: "SecurePass123!"
 *                 clientType: "mobile"
 *                 codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
 *                 codeChallengeMethod: "S256"
 *                 device:
 *                   deviceId: "mobile-device-001"
 *                   deviceName: "iPhone 15"
 *                   platform: "ios"
 *             organizationStaff:
 *               summary: Mobile org staff login
 *               value:
 *                 email: "orgadmin@example.com"
 *                 password: "SecurePass123!"
 *                 slug: "acme-publishing"
 *                 clientType: "mobile"
 *                 codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
 *                 codeChallengeMethod: "S256"
 *                 device:
 *                   deviceId: "mobile-device-001"
 *                   deviceName: "iPhone 15"
 *                   platform: "ios"
 *             authorWithSlug:
 *               summary: Mobile author login
 *               value:
 *                 email: "author@example.com"
 *                 password: "SecurePass123!"
 *                 slug: "jane-doe-a1b2c3d4"
 *                 clientType: "mobile"
 *                 codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
 *                 codeChallengeMethod: "S256"
 *                 device:
 *                   deviceId: "mobile-device-001"
 *                   deviceName: "iPhone 15"
 *                   platform: "ios"
 *     responses:
 *       200:
 *         description: Mobile login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *             examples:
 *               listener:
 *                 summary: Listener response (no appType)
 *                 value:
 *                   message: "Mobile login successful"
 *                   accessToken: "eyJhbGciOiJSUzI1NiIs..."
 *                   refreshToken: "dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4..."
 *                   user:
 *                     id: "cuser1234567890abcdefghij"
 *                     email: "listener@example.com"
 *                     role: "LISTENER"
 *                     emailVerified: true
 *               organizationStaff:
 *                 summary: Organization staff response
 *                 value:
 *                   message: "Mobile login successful"
 *                   accessToken: "eyJhbGciOiJSUzI1NiIs..."
 *                   refreshToken: "dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4..."
 *                   appType: "organization"
 *                   user:
 *                     id: "cuser1234567890abcdefghij"
 *                     email: "orgadmin@example.com"
 *                     role: "ORG_ADMIN"
 *                     emailVerified: true
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /auth/google:
 *   post:
 *     summary: Google OAuth login or signup
 *     description: |
 *       Verifies a Google ID token. Existing users are logged in; new users are created as LISTENER.
 *       Set `clientType: "browser"` for httpOnly refresh cookie. Set `app: "partner"` for partner-portal access.
 *     tags: [Auth]
 *     parameters:
 *       - in: header
 *         name: X-CSRF-Token
 *         schema: { type: string }
 *         description: CSRF token from GET /auth/csrf-token (required for browser cookie flow)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GoogleOAuthRequest'
 *           examples:
 *             browser:
 *               summary: Browser Google OAuth
 *               value:
 *                 token: "ya29.a0AfH6SMB..."
 *                 clientType: "browser"
 *                 device:
 *                   deviceId: "browser-abc123"
 *                   deviceName: "Chrome on Windows"
 *                   platform: "web"
 *             mobile:
 *               summary: Mobile Google OAuth
 *               value:
 *                 token: "ya29.a0AfH6SMB..."
 *                 clientType: "mobile"
 *                 device:
 *                   deviceId: "mobile-device-001"
 *                   deviceName: "iPhone 15"
 *                   platform: "ios"
 *             partnerPortal:
 *               summary: Partner portal Google OAuth
 *               value:
 *                 token: "ya29.a0AfH6SMB..."
 *                 clientType: "browser"
 *                 app: "partner"
 *                 device:
 *                   deviceId: "browser-abc123"
 *                   deviceName: "Chrome on Windows"
 *                   platform: "web"
 *     responses:
 *       200:
 *         description: Google OAuth successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /auth/guest:
 *   post:
 *     summary: Create or resume anonymous guest session
 *     description: |
 *       Creates a new guest user or resumes an existing guest session for the same device.
 *       Returns JWT access and refresh tokens without requiring signup or login.
 *       Guest users can browse the catalog via GET (active content only).
 *       POST, PUT, PATCH, and DELETE return 403 except PUT /auth/user/profile
 *       when only `location` is being updated; streaming is not available for guests.
 *     tags: [Auth]
 *     parameters:
 *       - in: header
 *         name: X-CSRF-Token
 *         schema: { type: string }
 *         description: CSRF token from GET /auth/csrf-token (required for browser cookie flow)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GuestAuthRequest'
 *           examples:
 *             browser:
 *               summary: Browser guest session
 *               value:
 *                 clientType: "browser"
 *                 device:
 *                   deviceId: "browser-abc123"
 *                   deviceName: "Chrome on Windows"
 *                   platform: "web"
 *             mobile:
 *               summary: Mobile guest session
 *               value:
 *                 clientType: "mobile"
 *                 device:
 *                   deviceId: "mobile-device-001"
 *                   deviceName: "iPhone 15"
 *                   platform: "ios"
 *     responses:
 *       200:
 *         description: Guest session created or resumed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Invalid device context
 *       429:
 *         description: Too many guest session requests
 */

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     description: |
 *       Issues a new access token using the refresh token.
 *       Browser clients use the httpOnly `refreshToken` cookie; mobile clients may pass `refreshToken` in the body.
 *       Requires CSRF header for cookie-based flow.
 *     tags: [Auth]
 *     security:
 *       - csrfToken: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshTokenRequest'
 *           examples:
 *             mobile:
 *               summary: Mobile refresh (body token)
 *               value:
 *                 refreshToken: "dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4..."
 *             browser:
 *               summary: Browser refresh (cookie only)
 *               value: {}
 *     responses:
 *       200:
 *         description: Token refreshed
 *         content:
 *           application/json:
 *             example:
 *               message: "Token refreshed successfully"
 *               accessToken: "eyJhbGciOiJSUzI1NiIs..."
 *               user:
 *                 id: "cuser1234567890abcdefghij"
 *                 email: "user@example.com"
 *                 role: "LISTENER"
 *                 emailVerified: true
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout
 *     description: |
 *       Revokes the session and clears auth cookies.
 *       Browser clients use the httpOnly `refreshToken` cookie; mobile clients may pass `refreshToken` in the body.
 *       Requires CSRF header for cookie-based flow.
 *     tags: [Auth]
 *     security:
 *       - csrfToken: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshTokenRequest'
 *           examples:
 *             mobile:
 *               summary: Mobile logout (body token)
 *               value:
 *                 refreshToken: "dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4..."
 *             browser:
 *               summary: Browser logout (cookie only)
 *               value: {}
 *     responses:
 *       200:
 *         description: Logged out
 *         content:
 *           application/json:
 *             example:
 *               message: "Logout successful"
 */

/**
 * @swagger
 * /auth/.well-known/jwks.json:
 *   get:
 *     summary: JSON Web Key Set
 *     description: Public keys for JWT verification.
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: JWKS document
 */

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current authenticated user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user
 *         content:
 *           application/json:
 *             example:
 *               id: "cuser1234567890abcdefghij"
 *               email: "user@example.com"
 *               role: "ORG_ADMIN"
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /auth/user/profile:
 *   get:
 *     summary: Get current user profile
 *     description: Returns unified profile fields (demographics, username, avatar, preferences) on the auth User model.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/UserProfile'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   put:
 *     summary: Update current user profile
 *     description: |
 *       Updates demographic fields on the auth User model. Location is resolved from
 *       latitude/longitude coordinates to a human-readable place name.
 *
 *       **Guest users:** only `location` may be updated (including `null` to clear).
 *       Other profile fields require a registered account.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateUserProfileRequest'
 *           examples:
 *             locationOnly:
 *               summary: Update location (allowed for guests)
 *               value:
 *                 location:
 *                   latitude: 19.076
 *                   longitude: 72.8777
 *             clearLocation:
 *               summary: Clear stored location
 *               value:
 *                 location: null
 *     responses:
 *       200:
 *         description: Profile updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Profile updated successfully
 *                 user:
 *                   $ref: '#/components/schemas/UserProfile'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Guest attempted to update non-location profile fields
 */

/**
 * @swagger
 * /auth/users/{userId}/profile:
 *   get:
 *     summary: Get public user profile
 *     description: Returns username and avatar for a user by auth user ID.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: userId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Public profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 profile:
 *                   $ref: '#/components/schemas/PublicUserProfile'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */

/**
 * @swagger
 * /auth/user/{userId}:
 *   get:
 *     summary: Get user role and email by ID
 *     description: Used by app-service for cross-service user lookups.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: userId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *         example: "cuser1234567890abcdefghij"
 *     responses:
 *       200:
 *         description: User info
 *         content:
 *           application/json:
 *             example: { role: "AUTHOR", email: "author@example.com" }
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */

/**
 * @swagger
 * /auth/devices:
 *   get:
 *     summary: List my registered devices
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Device list
 *         content:
 *           application/json:
 *             example:
 *               devices:
 *                 - id: "cdevice1234567890abcdef"
 *                   deviceName: "iPhone 15"
 *                   platform: "ios"
 */

/**
 * @swagger
 * /auth/devices/{id}:
 *   delete:
 *     summary: Remove a registered device
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *         example: "cdevice1234567890abcdef"
 *     responses:
 *       200:
 *         description: Device removed
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */

/**
 * @swagger
 * /api/auth/health:
 *   get:
 *     summary: Service health check
 *     description: Returns dependency health (database, Redis, RabbitMQ). Requires support Basic auth.
 *     tags: [Health]
 *     security:
 *       - healthBasicAuth: []
 *     responses:
 *       200:
 *         description: Healthy
 *         content:
 *           application/json:
 *             example:
 *               status: healthy
 *               service: auth-service
 *               checks: { database: true, redis: true, rabbitmq: true }
 *       503:
 *         description: Unhealthy
 */

export {};
