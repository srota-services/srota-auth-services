/**
 * OpenAPI path definitions — subscriptions and subscription plans
 */

/**
 * @swagger
 * /auth/subscription-plans:
 *   get:
 *     summary: List subscription plans
 *     tags: [SubscriptionPlans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         required: false
 *         description: Optional page number (defaults to 1)
 *         schema: { type: integer, default: 1 }
 *       - name: limit
 *         in: query
 *         required: false
 *         description: Optional items per page (defaults to 10)
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Paginated plans
 *   post:
 *     summary: Create subscription plan (admin)
 *     tags: [SubscriptionPlans]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, tierLevel, price, currency, interval]
 *             properties:
 *               name: { type: string, example: "Premium" }
 *               tierLevel: { type: string, enum: [BASE, STANDARD, PREMIUM], example: "PREMIUM" }
 *               price: { type: number, example: 9.99 }
 *               currency: { type: string, example: "USD" }
 *               interval: { type: string, example: "month" }
 *     responses:
 *       201:
 *         description: Plan created
 */

/**
 * @swagger
 * /auth/subscription-plans/{id}:
 *   get:
 *     summary: Get subscription plan by ID
 *     tags: [SubscriptionPlans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Plan details
 *   put:
 *     summary: Update subscription plan (admin)
 *     tags: [SubscriptionPlans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated
 *   delete:
 *     summary: Delete subscription plan (admin)
 *     tags: [SubscriptionPlans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deleted
 */

/**
 * @swagger
 * /auth/subscriptions/me:
 *   get:
 *     summary: Get my active subscription
 *     description: 'Returns the active subscription for LISTENER and GUEST users. Other roles receive subscription null without a database lookup.'
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current subscription
 *         content:
 *           application/json:
 *             example:
 *               subscription:
 *                 id: "csub1234567890abcdefghij"
 *                 status: "ACTIVE"
 *                 planId: "cplan1234567890abcdefghij"
 */

/**
 * @swagger
 * /auth/subscriptions/me/tier:
 *   get:
 *     summary: Get my highest active tier level
 *     description: 'Returns the highest active tier for LISTENER and GUEST users. Other roles receive tier null without a database lookup.'
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tier level
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tier:
 *                   type: string
 *                   enum: [BASE, STANDARD, PREMIUM]
 *                   nullable: true
 *                   example: STANDARD
 */

/**
 * @swagger
 * /auth/subscriptions:
 *   get:
 *     summary: List all subscriptions (admin)
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription list
 *   post:
 *     summary: Create user subscription
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, planId]
 *             properties:
 *               userId: { type: string }
 *               planId: { type: string }
 *     responses:
 *       201:
 *         description: Subscription created
 */

/**
 * @swagger
 * /auth/subscriptions/{id}:
 *   get:
 *     summary: Get subscription by ID
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Subscription details
 *   put:
 *     summary: Update subscription
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated
 *   delete:
 *     summary: Delete subscription (admin)
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deleted
 */

/**
 * @swagger
 * /auth/subscriptions/{id}/cancel:
 *   post:
 *     summary: Cancel subscription
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Cancelled
 */

export {};
