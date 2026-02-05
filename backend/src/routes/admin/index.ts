/**
 * @fileoverview Admin Routes Index
 * @module @nxt1/backend/routes/admin
 *
 * Main admin router that aggregates all admin sub-routes.
 * Organized by functional modules for better maintainability.
 */

import { Router } from 'express';
import dashboardRoutes from './dashboard.routes.js';
import usersRoutes from './users.routes.js';
import collegesRoutes from './colleges.routes.js';
import contactsRoutes from './contacts.routes.js';
import conferencesRoutes from './conferences.routes.js';
import videosRoutes from './videos.routes.js';
import faqRoutes from './faq.routes.js';
import sportsRoutes from './sports.routes.js';
import accountsRoutes from './accounts.routes.js';
import emailsRoutes from './emails.routes.js';
import filesRoutes from './files.routes.js';
import plansRoutes from './plans.routes.js';
import templatesRoutes from './templates.routes.js';
import nxt1centerRoutes from './nxt1center.routes.js';
import graphicProRoutes from './graphic-pro.routes.js';
import mixtapesProRoutes from './mixtapes-pro.routes.js';
import prospectProfileRoutes from './prospect-profile.routes.js';
import teamCodesRoutes from './team-codes.routes.js';
import generalRoutes from './general.routes.js';

const router = Router();

// Dashboard & Migration
router.use('/', dashboardRoutes);

// User Management
router.use('/users', usersRoutes);

// College Management
router.use('/', collegesRoutes); // Handles /coach, /college, /generate, /:id

// Contacts
router.use('/contacts', contactsRoutes);

// Conferences
router.use('/conference', conferencesRoutes);

// Videos
router.use('/video', videosRoutes);
router.use('/', videosRoutes); // For /video-collection, /thumbnail

// FAQ
router.use('/faq', faqRoutes);

// Sports
router.use('/sports', sportsRoutes);

// Admin Accounts
router.use('/accounts', accountsRoutes);
router.use('/', accountsRoutes); // For /password

// Emails
router.use('/emails', emailsRoutes);

// Files & Assets
router.use('/file', filesRoutes);
router.use('/', filesRoutes); // For /logo

// Plans & Packages
router.use('/plan', plansRoutes);
router.use('/package', plansRoutes);
router.use('/credit', plansRoutes);

// Templates & Academic
router.use('/templates', templatesRoutes);
router.use('/template', templatesRoutes);
router.use('/academic', templatesRoutes);

// NXT1 Center
router.use('/nxt1center', nxt1centerRoutes);

// Graphic Pro
router.use('/graphic-pro', graphicProRoutes);

// Mixtapes Pro
router.use('/mixtapes-pro', mixtapesProRoutes);

// Prospect Profile
router.use('/prospect-profile', prospectProfileRoutes);

// Team Codes
router.use('/team-code', teamCodesRoutes);

// General Settings
router.use('/general', generalRoutes);
router.use('/prices', generalRoutes);

export default router;
