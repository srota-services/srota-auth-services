/**
 * OpenAPI path definitions — organizations, authors, catalog
 */

/**
 * @swagger
 * /auth/organizations:
 *   get:
 *     summary: List my organizations
 *     description: Returns organizations the authenticated user is a member of.
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Organization list
 *         content:
 *           application/json:
 *             example:
 *               message: "Organizations retrieved"
 *               organizations:
 *                 - id: "corg1234567890abcdefghij"
 *                   name: "Acme Publishing"
 *                   slug: "acme-publishing"
 *   post:
 *     summary: Create organization
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: "Acme Publishing" }
 *               description: { type: string, example: "Independent publisher", description: "Optional organization description" }
 *               image: { type: string, format: binary, description: "Optional logo image upload" }
 *               preferredGenre: { type: string, example: "Fiction", description: "Optional preferred genre label" }
 *               websiteUrl: { type: string, example: "https://acme.example.com", description: "Optional organization website URL" }
 *               teamSize: { type: string, enum: ["1-10", "11-50", "51-200", "200+"], description: "Optional team size range" }
 *     responses:
 *       201:
 *         description: Organization created
 *         content:
 *           application/json:
 *             example:
 *               message: "Organization created"
 *               organization:
 *                 id: "corg1234567890abcdefghij"
 *                 name: "Acme Publishing"
 *                 slug: "acme-publishing"
 */

/**
 * @swagger
 * /auth/organizations/all:
 *   get:
 *     summary: List all organizations (admin)
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All organizations
 */

/**
 * @swagger
 * /auth/organizations/{id}:
 *   get:
 *     summary: Get organization by ID
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *         example: "corg1234567890abcdefghij"
 *     responses:
 *       200:
 *         description: Organization details
 *         content:
 *           application/json:
 *             example:
 *               message: "Organization retrieved"
 *               organization:
 *                 $ref: '#/components/schemas/Organization'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   put:
 *     summary: Update organization
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, description: "Optional updated organization name" }
 *               description: { type: string, description: "Optional updated description" }
 *               image: { type: string, format: binary, description: "Optional updated logo image upload" }
 *               preferredGenre: { type: string, description: "Optional preferred genre label" }
 *               websiteUrl: { type: string, description: "Optional website URL" }
 *               teamSize: { type: string, enum: ["1-10", "11-50", "51-200", "200+"], description: "Optional team size range" }
 *     responses:
 *       200:
 *         description: Updated
 *   delete:
 *     summary: Delete organization
 *     tags: [Organizations]
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
 * /auth/organizations/{id}/members:
 *   get:
 *     summary: List organization members
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Member list
 *   post:
 *     summary: Add organization member
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, role]
 *             properties:
 *               userId: { type: string, example: "cuser1234567890abcdefghij" }
 *               role: { type: string, enum: [OWNER, ADMIN, MEMBER], example: "ADMIN" }
 *     responses:
 *       201:
 *         description: Member added
 */

/**
 * @swagger
 * /auth/organizations/{id}/members/me:
 *   get:
 *     summary: Get my membership in organization
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Membership details
 *         content:
 *           application/json:
 *             example:
 *               membership: { role: "OWNER", organizationId: "corg1234567890abcdefghij" }
 */

/**
 * @swagger
 * /auth/authors/me:
 *   get:
 *     summary: Get my author profile
 *     tags: [Authors]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Author profile
 *         content:
 *           application/json:
 *             example:
 *               author:
 *                 id: "cauthor1234567890abcdefgh"
 *                 slug: "jane-doe-a1b2c3d4"
 *                 userId: "cuser1234567890abcdefghij"
 */

/**
 * @swagger
 * /auth/authors:
 *   get:
 *     summary: List all authors
 *     tags: [Authors]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Author list
 *   post:
 *     summary: Create author
 *     description: Requires GLOBAL_ADMIN or AUTHOR role.
 *     tags: [Authors]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId]
 *             properties:
 *               userId: { type: string, description: "Auth-service user ID to link as author" }
 *               firstName: { type: string, description: "Optional author first name" }
 *               lastName: { type: string, description: "Optional author last name" }
 *               organizationIds:
 *                 type: array
 *                 items: { type: string }
 *                 description: "Optional list of organization IDs to link the author to"
 *     responses:
 *       201:
 *         description: Author created
 */

/**
 * @swagger
 * /auth/authors/{id}:
 *   get:
 *     summary: Get author by ID
 *     tags: [Authors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *         example: "cauthor1234567890abcdefgh"
 *     responses:
 *       200:
 *         description: Author details
 *         content:
 *           application/json:
 *             example:
 *               author:
 *                 $ref: '#/components/schemas/Author'
 *   put:
 *     summary: Update author
 *     tags: [Authors]
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
 *     summary: Delete author
 *     tags: [Authors]
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
 * /auth/authors/{authorId}/organizations/{organizationId}/link:
 *   get:
 *     summary: Check author-organization link
 *     tags: [Authors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: authorId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *       - name: organizationId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Link status
 *         content:
 *           application/json:
 *             example: { linked: true }
 */

/**
 * @swagger
 * /auth/organizations/{organizationId}/author-invitations:
 *   get:
 *     summary: List author invitations for an organization
 *     tags: [AuthorInvitations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: organizationId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Invitations retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 invitations:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/AuthorOrganizationInvitationForOrg' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *   post:
 *     summary: Send an author invitation
 *     tags: [AuthorInvitations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: organizationId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateAuthorOrganizationInvitationRequest' }
 *     responses:
 *       201:
 *         description: Invitation created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 invitation: { $ref: '#/components/schemas/AuthorOrganizationInvitationForOrg' }
 *       409:
 *         description: Author already linked or invitation already pending
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */

/**
 * @swagger
 * /auth/organizations/{organizationId}/authors:
 *   get:
 *     summary: List authors linked to an organization
 *     description: Returns id, name, email, and contact only. Slugs are not included.
 *     tags: [AuthorInvitations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: organizationId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Linked authors retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 authors:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/OrganizationAuthorMember' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */

/**
 * @swagger
 * /auth/authors/me/organization-invitations:
 *   get:
 *     summary: List organization invitations for the logged-in author
 *     description: Organization summaries exclude slug fields.
 *     tags: [AuthorInvitations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Invitations retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 invitations:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/AuthorOrganizationInvitationForAuthor' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /auth/authors/me/organization-invitations/{invitationId}/reveal-contact:
 *   patch:
 *     summary: Author consent to share contact info with organization
 *     tags: [AuthorInvitations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: invitationId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/RevealContactRequest' }
 *     responses:
 *       200:
 *         description: Contact reveal decision recorded
 *       409:
 *         description: Invalid invitation state
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /auth/authors/me/organization-invitations/{invitationId}/confirm-contact:
 *   patch:
 *     summary: Author confirms whether the organization has contacted them
 *     tags: [AuthorInvitations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: invitationId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ConfirmOrgContactRequest' }
 *     responses:
 *       200:
 *         description: Contact confirmation recorded
 *       409:
 *         description: Invalid invitation state
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /auth/authors/me/organization-invitations/{invitationId}/join:
 *   patch:
 *     summary: Author accepts or declines joining the organization
 *     tags: [AuthorInvitations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: invitationId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/JoinOrganizationInvitationRequest' }
 *     responses:
 *       200:
 *         description: Join decision recorded
 *       409:
 *         description: Invalid invitation state
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /auth/catalog/organizations/{id}:
 *   get:
 *     summary: Get organization catalog entry
 *     description: Public catalog read for cross-service owner hydration (any authenticated caller).
 *     tags: [Catalog]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *         example: "corg1234567890abcdefghij"
 *     responses:
 *       200:
 *         description: Organization catalog details
 *         content:
 *           application/json:
 *             example:
 *               message: "Organization retrieved"
 *               organization:
 *                 id: "corg1234567890abcdefghij"
 *                 name: "Acme Publishing"
 *                 slug: "acme-publishing"
 *                 image: "/uploads/orgs/logo.jpg"
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */

/**
 * @swagger
 * /auth/catalog/authors/{id}:
 *   get:
 *     summary: Get author catalog entry
 *     description: Public catalog read for cross-service owner hydration (any authenticated caller).
 *     tags: [Catalog]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *         example: "cauthor1234567890abcdefgh"
 *     responses:
 *       200:
 *         description: Author catalog details
 *         content:
 *           application/json:
 *             example:
 *               message: "Author retrieved"
 *               author:
 *                 id: "cauthor1234567890abcdefgh"
 *                 slug: "jane-doe-a1b2c3d4"
 *                 userId: "cuser1234567890abcdefghij"
 *                 firstName: "Jane"
 *                 lastName: "Doe"
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */

/**
 * @swagger
 * /auth/authors/me/organization-collaborations:
 *   post:
 *     summary: Submit a collaboration request to an organization
 *     tags: [AuthorCollaborations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/CreateAuthorOrganizationCollaborationRequest'
 *     responses:
 *       201:
 *         description: Collaboration request created
 *   get:
 *     summary: List my organization collaboration requests
 *     tags: [AuthorCollaborations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Collaboration requests retrieved
 */

/**
 * @swagger
 * /auth/authors/me/organization-collaborations/{collaborationId}/counter:
 *   patch:
 *     summary: Counter with a new author budget during negotiation
 *     tags: [AuthorCollaborations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: collaborationId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CounterCollaborationBudgetRequest'
 *     responses:
 *       200:
 *         description: Budget counter submitted
 */

/**
 * @swagger
 * /auth/authors/me/organization-collaborations/{collaborationId}/abort:
 *   patch:
 *     summary: Abort a collaboration request
 *     tags: [AuthorCollaborations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: collaborationId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Collaboration request aborted
 */

/**
 * @swagger
 * /auth/organizations/{organizationId}/author-collaborations:
 *   get:
 *     summary: List collaboration requests for an organization
 *     tags: [AuthorCollaborations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: organizationId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Collaboration requests retrieved
 */

/**
 * @swagger
 * /auth/organizations/{organizationId}/author-collaborations/{collaborationId}/accept:
 *   patch:
 *     summary: Accept a collaboration request
 *     tags: [AuthorCollaborations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: organizationId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *       - name: collaborationId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Collaboration accepted
 */

/**
 * @swagger
 * /auth/organizations/{organizationId}/author-collaborations/{collaborationId}/reject:
 *   patch:
 *     summary: Reject a collaboration request
 *     tags: [AuthorCollaborations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: organizationId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *       - name: collaborationId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Collaboration rejected
 */

/**
 * @swagger
 * /auth/organizations/{organizationId}/author-collaborations/{collaborationId}/negotiate:
 *   patch:
 *     summary: Negotiate a collaboration request with an organization counter-offer
 *     tags: [AuthorCollaborations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: organizationId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *       - name: collaborationId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NegotiateCollaborationRequest'
 *     responses:
 *       200:
 *         description: Negotiation terms submitted
 */

export {};
