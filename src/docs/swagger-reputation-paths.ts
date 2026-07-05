/**
 * @swagger
 * /auth/organization-reviews:
 *   post:
 *     summary: Create an organization review
 *     tags: [OrganizationReviews]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateOrganizationReviewRequest'
 *     responses:
 *       201:
 *         description: Organization review created successfully
 *       409:
 *         description: Review already exists
 *   get:
 *     summary: List organization reviews
 *     tags: [OrganizationReviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           minimum: 1
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *       - name: organizationId
 *         in: query
 *         schema:
 *           type: string
 *       - name: reviewerType
 *         in: query
 *         schema:
 *           $ref: '#/components/schemas/ReviewerType'
 *       - name: reviewerId
 *         in: query
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Organization reviews retrieved successfully
 *
 * /auth/organization-reviews/{id}:
 *   get:
 *     summary: Get organization review by ID
 *     tags: [OrganizationReviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Organization review retrieved successfully
 *   put:
 *     summary: Update an organization review
 *     tags: [OrganizationReviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateOrganizationReviewRequest'
 *     responses:
 *       200:
 *         description: Organization review updated successfully
 *   delete:
 *     summary: Delete an organization review
 *     tags: [OrganizationReviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Organization review deleted successfully
 *
 * /auth/author-reviews:
 *   post:
 *     summary: Create an author review
 *     tags: [AuthorReviews]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateAuthorReviewRequest'
 *     responses:
 *       201:
 *         description: Author review created successfully
 *       409:
 *         description: Review already exists
 *   get:
 *     summary: List author reviews
 *     tags: [AuthorReviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           minimum: 1
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *       - name: authorId
 *         in: query
 *         schema:
 *           type: string
 *       - name: reviewerType
 *         in: query
 *         schema:
 *           $ref: '#/components/schemas/ReviewerType'
 *       - name: reviewerId
 *         in: query
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Author reviews retrieved successfully
 *
 * /auth/author-reviews/{id}:
 *   get:
 *     summary: Get author review by ID
 *     tags: [AuthorReviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Author review retrieved successfully
 *   put:
 *     summary: Update an author review
 *     tags: [AuthorReviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateAuthorReviewRequest'
 *     responses:
 *       200:
 *         description: Author review updated successfully
 *   delete:
 *     summary: Delete an author review
 *     tags: [AuthorReviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Author review deleted successfully
 */

export {};
