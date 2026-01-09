/**
 * @fileoverview Stripe Payment Routes
 * @module @nxt1/backend
 *
 * Payment processing routes for subscriptions and one-time payments.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import Stripe from 'stripe';

import type { ApiResponse, SubscriptionTier, PaymentIntent, SubscriptionStatus } from '@nxt1/core';
import { SUBSCRIPTION_TIERS, PREMIUM_FEATURES } from '@nxt1/core';

import { db } from '../utils/firebase.js';
import { appGuard } from '../middleware/auth.middleware.js';

const router = Router();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
});

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

/**
 * GET /stripe/products
 * Get available subscription products
 */
router.get('/products', async (_req: Request, res: Response) => {
  try {
    const products = Object.values(SUBSCRIPTION_TIERS).map((tier) => ({
      id: tier.id,
      name: tier.name,
      description: tier.description || '',
      price: tier.price,
      period: tier.period,
      features: tier.features,
      popular: tier.id === 'pro',
    }));

    res.json({
      success: true,
      data: { products },
    });
  } catch (error) {
    console.error('[Stripe] get products error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch products',
    });
  }
});

/**
 * POST /stripe/create-checkout-session
 * Create a Stripe checkout session
 */
router.post('/create-checkout-session', appGuard, async (req: Request, res: Response) => {
  try {
    const { uid, email } = req.user!;
    const { priceId, tierId, successUrl, cancelUrl } = req.body;

    if (!priceId || !successUrl || !cancelUrl) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: priceId, successUrl, cancelUrl',
      });
    }

    // Check if user already has a Stripe customer ID
    const userDoc = await db.collection('Users').doc(uid).get();
    let customerId = userDoc.data()?.stripeCustomerId;

    // Create customer if doesn't exist
    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: {
          firebaseUID: uid,
        },
      });
      customerId = customer.id;

      await db.collection('Users').doc(uid).update({
        stripeCustomerId: customerId,
      });
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        firebaseUID: uid,
        tierId: tierId || '',
      },
      subscription_data: {
        metadata: {
          firebaseUID: uid,
          tierId: tierId || '',
        },
      },
    });

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url,
      },
    });
  } catch (error) {
    console.error('[Stripe] create checkout session error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create checkout session',
    });
  }
});

/**
 * POST /stripe/create-portal-session
 * Create a Stripe customer portal session
 */
router.post('/create-portal-session', appGuard, async (req: Request, res: Response) => {
  try {
    const { uid } = req.user!;
    const { returnUrl } = req.body;

    if (!returnUrl) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: returnUrl',
      });
    }

    const userDoc = await db.collection('Users').doc(uid).get();
    const customerId = userDoc.data()?.stripeCustomerId;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        error: 'No subscription found',
      });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    res.json({
      success: true,
      data: {
        url: session.url,
      },
    });
  } catch (error) {
    console.error('[Stripe] create portal session error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create portal session',
    });
  }
});

/**
 * GET /stripe/subscription-status
 * Get current user's subscription status
 */
router.get('/subscription-status', appGuard, async (req: Request, res: Response) => {
  try {
    const { uid } = req.user!;

    const userDoc = await db.collection('Users').doc(uid).get();
    const userData = userDoc.data();

    if (!userData) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const subscriptionStatus: SubscriptionStatus = {
      isActive: userData.isPremium || false,
      tier: userData.subscriptionTier || 'free',
      expiresAt: userData.subscriptionExpiresAt,
      willRenew: userData.subscriptionWillRenew ?? false,
      stripeCustomerId: userData.stripeCustomerId,
      stripeSubscriptionId: userData.stripeSubscriptionId,
    };

    res.json({
      success: true,
      data: { subscription: subscriptionStatus },
    });
  } catch (error) {
    console.error('[Stripe] get subscription status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch subscription status',
    });
  }
});

/**
 * POST /stripe/webhook
 * Handle Stripe webhooks
 */
router.post('/webhook', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[Stripe] webhook signature verification failed:', err);
    return res.status(400).send(`Webhook Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutComplete(session);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionCanceled(subscription);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }

      default:
        console.log(`[Stripe] Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('[Stripe] webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * Handle successful checkout
 */
async function handleCheckoutComplete(session: Stripe.Checkout.Session): Promise<void> {
  const uid = session.metadata?.firebaseUID;
  const tierId = session.metadata?.tierId || 'pro';

  if (!uid) {
    console.error('[Stripe] No firebaseUID in checkout session metadata');
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(session.subscription as string);

  await db.collection('Users').doc(uid).update({
    isPremium: true,
    subscriptionTier: tierId,
    stripeSubscriptionId: subscription.id,
    subscriptionExpiresAt: new Date(subscription.current_period_end * 1000).toISOString(),
    subscriptionWillRenew: !subscription.cancel_at_period_end,
    lastActivatedPlan: tierId,
    updatedAt: new Date().toISOString(),
  });

  console.log(`[Stripe] User ${uid} subscribed to ${tierId}`);
}

/**
 * Handle subscription updates
 */
async function handleSubscriptionUpdate(subscription: Stripe.Subscription): Promise<void> {
  const uid = subscription.metadata?.firebaseUID;

  if (!uid) {
    // Try to find by customer ID
    const userSnapshot = await db
      .collection('Users')
      .where('stripeCustomerId', '==', subscription.customer)
      .limit(1)
      .get();

    if (userSnapshot.empty) {
      console.error('[Stripe] No user found for subscription update');
      return;
    }

    const userDoc = userSnapshot.docs[0];
    await userDoc.ref.update({
      isPremium: subscription.status === 'active',
      subscriptionExpiresAt: new Date(subscription.current_period_end * 1000).toISOString(),
      subscriptionWillRenew: !subscription.cancel_at_period_end,
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  await db.collection('Users').doc(uid).update({
    isPremium: subscription.status === 'active',
    subscriptionExpiresAt: new Date(subscription.current_period_end * 1000).toISOString(),
    subscriptionWillRenew: !subscription.cancel_at_period_end,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Handle subscription cancellation
 */
async function handleSubscriptionCanceled(subscription: Stripe.Subscription): Promise<void> {
  const uid = subscription.metadata?.firebaseUID;

  if (!uid) {
    const userSnapshot = await db
      .collection('Users')
      .where('stripeSubscriptionId', '==', subscription.id)
      .limit(1)
      .get();

    if (userSnapshot.empty) {
      console.error('[Stripe] No user found for canceled subscription');
      return;
    }

    const userDoc = userSnapshot.docs[0];
    await userDoc.ref.update({
      isPremium: false,
      subscriptionTier: 'free',
      stripeSubscriptionId: null,
      subscriptionWillRenew: false,
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  await db.collection('Users').doc(uid).update({
    isPremium: false,
    subscriptionTier: 'free',
    stripeSubscriptionId: null,
    subscriptionWillRenew: false,
    updatedAt: new Date().toISOString(),
  });

  console.log(`[Stripe] User ${uid} subscription canceled`);
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId = invoice.customer as string;

  const userSnapshot = await db
    .collection('Users')
    .where('stripeCustomerId', '==', customerId)
    .limit(1)
    .get();

  if (userSnapshot.empty) {
    console.error('[Stripe] No user found for failed payment');
    return;
  }

  const userDoc = userSnapshot.docs[0];

  // Log payment failure for notification
  await db.collection('PaymentFailures').add({
    userId: userDoc.id,
    invoiceId: invoice.id,
    amount: invoice.amount_due,
    failedAt: new Date().toISOString(),
  });

  console.log(`[Stripe] Payment failed for user ${userDoc.id}`);
}

export default router;
