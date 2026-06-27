# Auth Service

A secure authentication service built with Node.js, Express, TypeScript, and Prisma. This service provides JWT-based authentication with refresh token rotation, PKCE support, email verification, password reset, and Redis-based token revocation.

## Features

- **JWT Access Tokens**: RS256 signed tokens with 10-minute expiry
- **Opaque Refresh Tokens**: Cryptographically secure tokens with rotation
- **PKCE Support**: OAuth 2.0 PKCE flow for mobile clients
- **Email Verification**: Secure email verification with tokens
- **Password Reset**: Secure password reset flow
- **Role-Based Access Control**: LISTENER, AUTHOR, GLOBAL_ADMIN, ORG_ADMIN, and ORG_COORDINATOR roles
- **Redis Blocklist**: Token revocation and emergency revoke
- **JWKS Endpoint**: Public key endpoint for JWT verification
- **Rate Limiting**: Protection against brute force attacks
- **Security Headers**: Helmet.js and custom security middleware
- **TypeScript**: Full type safety throughout the application
- **Subscriptions**: Plan catalog and per-user subscriptions; see [docs/SUBSCRIPTIONS.md](./docs/SUBSCRIPTIONS.md)

## API documentation

When the service is running:

- **Swagger UI**: `http://localhost:{PORT}/api-docs` — interactive API documentation
- **OpenAPI spec**: `http://localhost:{PORT}/api-docs.json` — machine-readable specification

The root `GET /` response also lists `apiDocs` and `openApiSpec` paths.

## Architecture

```
auth-service/
├── src/
│   ├── config/          # Configuration management
│   ├── controllers/     # Route handlers
│   ├── middleware/      # Auth, rate limiting, error handling
│   ├── services/        # Business logic (auth, redis)
│   ├── utils/           # Crypto utilities (argon2, jwt, pkce)
│   ├── types/           # TypeScript interfaces
│   ├── routes/          # Express routes
│   ├── app.ts           # Express app setup
│   └── server.ts        # Server entry point
├── prisma/
│   └── schema.prisma    # Database schema
├── tests/               # Test files
└── package.json
```

## Prerequisites

- Node.js **26.4.0**
- PostgreSQL 13+
- Redis 6+
- npm **11.17.0** (run `nvm use` / `fnm use` in this directory to match `.nvmrc`)

## Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd auth-service
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

```bash
# For development
cp .env.example .env.development
# Edit .env.development with your configuration

# For test server (deployed testing environment; localhost allowed)
cp .env.testing.example .env.testing
# Edit .env.testing with your configuration

# For staging
cp .env.staging.example .env.staging
# Edit .env.staging with your configuration (no localhost URLs)

# For production
cp .env.production.example .env.production
# Edit .env.production with your configuration (no localhost URLs)
```

4. Set up the database:

```bash
# Generate Prisma client
npm run db:generate

# Push schema to database (automatically uses correct environment)
npm run db:push

# Run migrations
npm run db:migrate
```

5. Generate JWT key pair (if not provided):

```bash
# Generate RSA key pair using Node.js
node -e "
const crypto = require('crypto');
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});
console.log('Private Key:');
console.log(privateKey);
console.log('Public Key:');
console.log(publicKey);
"
```

6. Seed the database with test users:

```bash
npm run db:seed
```

## Environment Variables

| Variable                   | Description                                                                                            | Required |
| -------------------------- | ------------------------------------------------------------------------------------------------------ | -------- |
| `NODE_ENV`                 | Environment (`development`, `testing`, `staging`, `production`; Jest uses `test` via `tests/setup.ts`) | Yes      |
| `PORT`                     | Server port                                                                                            | Yes      |
| `DATABASE_URL`             | PostgreSQL connection string (auth service)                                                            | Yes      |
| `SUBSCRIPTION_CURRENCY`    | Currency code for seeded subscription plans                                                            | Yes      |
| `REDIS_URL`                | Redis connection string                                                                                | Yes      |
| `RABBITMQ_URL`             | RabbitMQ connection string                                                                             | Yes      |
| `RABBITMQ_EXCHANGE`        | RabbitMQ exchange name                                                                                 | Yes      |
| `JWT_PRIVATE_KEY`          | RSA private key for JWT signing                                                                        | Yes      |
| `JWT_PUBLIC_KEY`           | RSA public key for JWT verification                                                                    | Yes      |
| `JWT_KEY_ID`               | Key identifier for JWKS                                                                                | Yes      |
| `JWT_ISSUER`               | JWT issuer claim                                                                                       | Yes      |
| `JWT_ACCESS_TOKEN_EXPIRY`  | Access token expiry (e.g. `7d`)                                                                        | Yes      |
| `JWT_REFRESH_TOKEN_EXPIRY` | Refresh token expiry (e.g. `7d`)                                                                       | Yes      |
| `RATE_LIMIT_WINDOW_MS`     | Rate limit window in milliseconds                                                                      | Yes      |
| `RATE_LIMIT_MAX_REQUESTS`  | Max requests per window                                                                                | Yes      |
| `EMAIL_FROM`               | Sender email address                                                                                   | Yes      |
| `EMAIL_SERVICE_URL`        | Email service URL (empty if unused)                                                                    | Yes      |
| `GOOGLE_CLIENT_ID`         | Google OAuth client ID (empty if unused)                                                               | Yes      |
| `ARGON2_MEMORY`            | Argon2 memory cost                                                                                     | Yes      |
| `ARGON2_ITERATIONS`        | Argon2 time cost                                                                                       | Yes      |
| `ARGON2_PARALLELISM`       | Argon2 parallelism                                                                                     | Yes      |
| `LOG_LEVEL`                | Log level                                                                                              | Yes      |

All variables must be set in the environment file. There are no code-level defaults. In `staging` and `production`, `localhost` and `127.0.0.1` are rejected in `DATABASE_URL`, Redis/RabbitMQ URLs, and non-empty `EMAIL_SERVICE_URL`. CORS allows any origin. Refresh-token and CSRF cookies use `secure: true` and `sameSite: strict` in staging, testing, and production.

## Running the Application

### Development

```bash
# Development with hot reload
npm run dev

# Or start built application
npm run build
npm run start:dev
```

### Testing (deployed test server)

```bash
npm run build
npm run start:testing
```

Uses `NODE_ENV=testing` and `.env.testing`. Localhost URLs are allowed. This is separate from Jest (`NODE_ENV=test`).

### Staging

```bash
npm run build
npm run start:staging
```

### Production

```bash
npm run build
npm run start:prod
```

## Logging

Logs are written under `logs/` (created at startup, gitignored). Each file only contains messages for that area:

| File           | Contents                                                               |
| -------------- | ---------------------------------------------------------------------- |
| `app.log`      | HTTP requests, server lifecycle, auth/business errors, JWKS generation |
| `rabbitmq.log` | RabbitMQ connection and publish events                                 |
| `redis.log`    | Redis client, token revocation, PKCE, JWKS cache in Redis              |
| `email.log`    | OTP/email send and email logging                                       |
| `sse.log`      | SSE cache-invalidation events (published and forwarded to clients)     |

Logging uses [Pino](https://getpino.io/) ([`src/utils/logger.ts`](src/utils/logger.ts)). Level is controlled by `LOG_LEVEL` in your env file. In `development` and `testing`, logs also print to the console (pretty-printed). Jest (`NODE_ENV=test`) uses silent loggers so no files are written during `npm test`.

For production, configure log rotation externally (e.g. logrotate) if needed.

## Environment Management

The application uses an environment loader ([`src/config/env.ts`](src/config/env.ts)) that:

- Loads `.env.development` for development, `.env.testing` for the test server, or `.env.{NODE_ENV}` for staging/production
- Requires all configuration values to be present in the environment file (no code defaults)
- Rejects `localhost` and `127.0.0.1` in staging and production for service URLs
- CORS allows requests from any origin (`origin: true` with credentials)

### Environment Files

- **Development**: `.env.development` - Local development (see `.env.example`)
- **Testing server**: `.env.testing` - Deployed test environment with localhost (see `.env.testing.example`)
- **Staging**: `.env.staging` - Pre-production (see `.env.staging.example`)
- **Production**: `.env.production` - Production (see `.env.production.example`)
- **Jest / CI**: `NODE_ENV=test`; variables set in `tests/setup.ts` (no env file loaded)

### Environment Commands

```bash
# Development
npm run dev                    # Start dev server
npm run db:push               # Push schema
npm run db:migrate            # Run migrations
npm run db:seed               # Seed subscription plans

# Testing server
npm run dev:testing           # Start test server locally with .env.testing
npm run start:testing         # Start built app on test server

# Staging
npm run dev:staging           # Start staging server

# Production
npm run start:prod            # Start production server
npm run db:migrate:prod       # Deploy migrations to production
```

## Subscription plans (seed)

After running `npm run db:seed`, the database includes Base, Standard, and Premium plans (skipped if plans already exist). See [docs/SUBSCRIPTIONS.md](./docs/SUBSCRIPTIONS.md).

Both users are pre-verified and ready for testing authentication endpoints.

## RabbitMQ Integration

The auth service publishes user creation events to RabbitMQ for external services to consume.

### Configuration

- **Exchange**: `users` (topic exchange)
- **Routing Key**: `user.created`
- **Message Format**: `{"userId": "user-id-string"}`

### Event Publishing

When a user registers successfully, the service publishes a `user.created` event containing the user ID to the RabbitMQ exchange. External services can consume these events by:

1. Connecting to the same RabbitMQ instance
2. Declaring a queue bound to the `users` exchange with routing key `user.created`
3. Consuming messages from the queue

### Example Consumer Setup

```javascript
// External service consumer example
const amqp = require("amqplib");

async function consumeUserCreatedEvents() {
  const connection = await amqp.connect("amqp://localhost:5672");
  const channel = await connection.createChannel();

  // Declare queue
  const queue = "user-notifications";
  await channel.assertQueue(queue, { durable: true });

  // Bind to exchange
  await channel.bindQueue(queue, "users", "user.created");

  // Consume messages
  channel.consume(queue, (msg) => {
    if (msg) {
      const userData = JSON.parse(msg.content.toString());
      console.log("New user created:", userData.userId);
      // Process user creation event
      channel.ack(msg);
    }
  });
}
```

## API Endpoints

### Public Endpoints

#### CSRF Token (Browser clients)

Browser clients that use cookie-based refresh tokens must obtain a CSRF token before `POST /auth/login` (with `clientType: "browser"`), `POST /auth/google` (browser), `POST /auth/refresh` (when using the refresh cookie), or `POST /auth/logout` (when using the refresh cookie). Mobile clients and body-only refresh/logout are unchanged.

```http
GET /auth/csrf-token
```

Response sets an `httpOnly` `csrfToken` cookie and returns the same value in JSON. Store the token from the response body (not `document.cookie`) and send it on protected POSTs as the `X-CSRF-Token` header with `credentials: 'include'`. Re-fetch after 24 hours or on `403` with code `CSRF_VALIDATION_FAILED`.

#### Register User

Registration uses `multipart/form-data`. Text fields are sent as form fields; images are optional file uploads.

**LISTENER registration** (JSON body; required: `email`, `password`, `address`, `contact`; optional: `firstName`, `lastName`, `avatar`):

```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123",
  "role": "LISTENER",
  "address": "456 Oak Ave",
  "contact": "+91-9876543210"
}
```

**ORG_ADMIN / ORG_COORDINATOR registration** (same fields as LISTENER; must use a separate email from any existing listener account):

```http
POST /auth/register
Content-Type: application/json

{
  "email": "org-admin@example.com",
  "password": "securePassword123",
  "role": "ORG_ADMIN",
  "address": "456 Oak Ave",
  "contact": "+91-9876543210"
}
```

**AUTHOR registration** (required: `multipart/form-data` with `role=AUTHOR`, `firstName`, `lastName`, `address`; optional: `contact`, `profileImage` file):

```http
POST /auth/register
Content-Type: multipart/form-data

email=author@example.com
password=securePassword123
role=AUTHOR
firstName=Jane
lastName=Doe
address=123 Main St
contact=+91-9876543210
profileImage=<optional image file>
```

After registration, verify OTP via `POST /auth/verify-registration-otp`. Device is **required** for `LISTENER` registrations and **optional** for `AUTHOR`, `ORG_ADMIN`, and `ORG_COORDINATOR`. LISTENER clients may pass optional `firstName` and `lastName` at OTP verification.

#### Login (Browser)

Requires a valid CSRF token (see [CSRF Token](#csrf-token-browser-clients)).

```http
POST /auth/login
Content-Type: application/json
X-CSRF-Token: <csrf-token-from-get-auth-csrf-token>

{
  "email": "user@example.com",
  "password": "securePassword123",
  "clientType": "browser"
}
```

The refresh token is returned in an `httpOnly` cookie, not in the response body.

#### Login (Mobile with PKCE)

```http
POST /auth/login/mobile
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123",
  "codeChallenge": "base64url-encoded-sha256-hash",
  "codeChallengeMethod": "S256"
}
```

#### Refresh Token

**Browser (cookie):** send `X-CSRF-Token` and include credentials; no body required if the refresh cookie is set.

```http
POST /auth/refresh
X-CSRF-Token: <csrf-token>
```

**Mobile (body):** no CSRF header required.

```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "opaque-refresh-token"
}
```

#### Verify Email

```http
POST /auth/verify-email
Content-Type: application/json

{
  "token": "email-verification-token"
}
```

#### Forgot Password

```http
POST /auth/forgot-password
Content-Type: application/json

{
  "email": "user@example.com"
}
```

#### Reset Password

```http
POST /auth/reset-password
Content-Type: application/json

{
  "token": "password-reset-token",
  "newPassword": "newSecurePassword123"
}
```

#### JWKS Endpoint

```http
GET /auth/.well-known/jwks.json
```

### Protected Endpoints

#### Get Current User

```http
GET /auth/me
Authorization: Bearer <access-token>
```

#### Change Password

```http
POST /auth/change-password
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "currentPassword": "currentPassword123",
  "newPassword": "newPassword123"
}
```

### Admin Endpoints

#### Revoke Token

```http
POST /auth/revoke
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{
  "jti": "jwt-id-to-revoke"
}
```

#### Emergency Revoke All User Tokens

```http
POST /auth/emergency-revoke
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{
  "userId": "user-id-to-revoke"
}
```

## JWT Token Structure

### Access Token Payload

```json
{
  "sub": "user-id",
  "email": "user@example.com",
  "role": "LISTENER",
  "iat": 1640995200,
  "exp": 1640995800,
  "jti": "unique-token-id",
  "iss": "auth-service"
}
```

### Access Token Header

```json
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "auth-service-key-1"
}
```

## Security Features

### Rate Limiting

- Login attempts: 5 per 15 minutes
- Password reset: 3 per hour
- Registration: 10 per hour
- General API: 100 per 15 minutes

### Password Security

- Argon2id hashing with secure defaults
- Memory: 65536 KB
- Iterations: 3
- Parallelism: 4

### Token Security

- Access tokens: 10-minute expiry
- Refresh tokens: 7-day expiry with rotation
- Token reuse detection and family revocation
- Redis-based revocation list

### PKCE Flow

1. Client generates `code_verifier` (random 32 bytes)
2. Client generates `code_challenge` (SHA256 of verifier, base64url encoded)
3. Client sends challenge with login request
4. Server stores challenge and user session
5. Client exchanges verifier for tokens

## Testing

Run tests:

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

## Database Schema

### User Model

```prisma
model User {
  id            String    @id @default(uuid())
  email         String    @unique
  password      String    // Hashed password
  role          Role      @default(LISTENER)
  emailVerified Boolean   @default(false)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}
```

### Refresh Token Model

```prisma
model RefreshToken {
  id          String    @id @default(uuid())
  token       String    @unique
  userId      String
  expiresAt   DateTime
  createdAt   DateTime  @default(now())
  isRevoked   Boolean   @default(false)
  replacedBy  String?   // Token rotation tracking
}
```

## Integration with Other Services

### JWT Verification

Other services can verify JWT tokens by:

1. Fetching the JWKS endpoint: `GET /auth/.well-known/jwks.json`
2. Extracting the `kid` from the JWT header
3. Finding the matching public key in the JWKS
4. Verifying the JWT signature using the public key

### Example Verification (Node.js)

```javascript
const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");

const client = jwksClient({
  jwksUri: "http://localhost:3000/auth/.well-known/jwks.json",
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    const signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  });
}

jwt.verify(
  token,
  getKey,
  {
    issuer: "auth-service",
    algorithms: ["RS256"],
  },
  (err, decoded) => {
    if (err) {
      console.error("Token verification failed:", err);
    } else {
      console.log("Token verified:", decoded);
    }
  },
);
```

## Monitoring and Logging

The service includes:

- Request logging with response times
- Error logging with stack traces
- Security event logging (token revocation, failed logins)
- Health check at `GET /api/auth/health` (database, Redis, RabbitMQ); returns `503` when any dependency is down

## Deployment

### Docker (Example)

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Setup

- Ensure PostgreSQL and Redis are accessible
- Set all required environment variables
- Generate and configure JWT key pair
- Run database migrations

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

MIT License - see LICENSE file for details.
