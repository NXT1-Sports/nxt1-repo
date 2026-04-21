const fs = require('fs');
const file = 'src/modules/billing/budget.service.ts';
let content = fs.readFileSync(file, 'utf8');

const searchGetOrCreate = `  const budget =
    billingEntity === 'individual' ? DEFAULT_INDIVIDUAL_BUDGET : DEFAULT_ORGANIZATION_BUDGET;
  const starterWalletConfig = await getStarterWalletConfig(db);
  const starterWalletBalance =
    billingEntity === 'individual' ? starterWalletConfig.individualAmountCents : 0;
  const creditsAlertBaseline =
    billingEntity === 'individual' ? starterWalletConfig.individualAmountCents : 0;`;

const replaceGetOrCreate = `  const budget = DEFAULT_INDIVIDUAL_BUDGET;
  const starterWalletConfig = await getStarterWalletConfig(db);
  const starterWalletBalance = starterWalletConfig.individualAmountCents;
  const creditsAlertBaseline = starterWalletConfig.individualAmountCents;`;

content = content.replace(searchGetOrCreate, replaceGetOrCreate);

const searchCreateHoldTop = `export async function createWalletHold(
  db: Firestore,
  userId: string,
  estimatedCostCents: number,
  jobId: string,
  feature: string
): Promise<WalletHoldResult> {
  if (estimatedCostCents <= 0) {
    return { success: false, reason: 'Estimated cost must be positive' };
  }

  const collRef = db.collection(COLLECTIONS.BILLING_CONTEXTS);
  const snapshot = await collRef.where('userId', '==', userId).limit(1).get();

  if (snapshot.empty) {
    return { success: false, reason: 'Billing context not found' };
  }

  const docRef = snapshot.docs[0]!.ref;
  let holdId = '';
  let availableBalance = 0;

  try {
    await db.runTransaction(async (txn) => {
      const doc = await txn.get(docRef);
      const data = doc.data() as BillingContext;`;

const replaceCreateHoldTop = `export async function createWalletHold(
  db: Firestore,
  userId: string,
  estimatedCostCents: number,
  jobId: string,
  feature: string
): Promise<WalletHoldResult> {
  if (estimatedCostCents <= 0) {
    return { success: false, reason: 'Estimated cost must be positive' };
  }

  const target = await resolveBillingTarget(db, userId);

  const collRef = db.collection(COLLECTIONS.BILLING_CONTEXTS);
  const snapshot = await collRef.where('userId', '==', userId).limit(1).get();

  if (snapshot.empty) {
    return { success: false, reason: 'Billing context not found' };
  }

  const docRef = snapshot.docs[0]!.ref;
  let holdId = '';
  let availableBalance = 0;

  try {
    await db.runTransaction(async (txn) => {
      const doc = await txn.get(docRef);
      const data = doc.data() as BillingContext;`;

content = content.replace(searchCreateHoldTop, replaceCreateHoldTop);

const searchCreateHoldMiddle = `      let orgMasterRef: FirebaseFirestore.DocumentReference | null = null;
      let orgMasterData: BillingContext | null;
      if (data.billingEntity === 'organization') {
        // For org users, budget enforcement must be done against the org master
        // context (userId = 'org:<orgId>') to prevent concurrent job overdrafts.
        const orgUserId = data.organizationId ? \`org:\${data.organizationId}\` : null;
        if (!orgUserId) {
          throw new Error('Org user has no organizationId in billing context');
        }

        const orgSnap = await txn.get(
          db.collection(COLLECTIONS.BILLING_CONTEXTS).where('userId', '==', orgUserId).limit(1)
        );
        if (orgSnap.empty) {
          throw new Error(\`Org master billing context not found for \${orgUserId}\`);
        }
        orgMasterRef = orgSnap.docs[0]!.ref;
        orgMasterData = orgSnap.docs[0]!.data() as BillingContext;`;

const replaceCreateHoldMiddle = `      let orgMasterRef: FirebaseFirestore.DocumentReference | null = null;
      let orgMasterData: BillingContext | null;
      if (target.type === 'organization' && target.organizationId) {
        // Enforce budget against the org master context resolved upfront.
        const orgUserId = target.billingUserId; // org:<orgId>
        if (!orgUserId) {
          throw new Error('Org target has no billingUserId');
        }

        const orgSnap = await txn.get(
          db.collection(COLLECTIONS.BILLING_CONTEXTS).where('userId', '==', orgUserId).limit(1)
        );
        if (orgSnap.empty) {
          throw new Error(\`Org master billing context not found for \${orgUserId}\`);
        }
        orgMasterRef = orgSnap.docs[0]!.ref;
        orgMasterData = orgSnap.docs[0]!.data() as BillingContext;`;

content = content.replace(searchCreateHoldMiddle, replaceCreateHoldMiddle);

const fileWorker = 'src/modules/agent/queue/agent.worker.ts';
let contentWorker = fs.readFileSync(fileWorker, 'utf8');

const searchWorker = `    // ── IAP hold: show "Processing" amount in usage overview ─────────────
    // For prepaid wallet users, create a hold at job start so the UI can display
    // the estimated in-flight cost under "Processing". Released or captured at end.
    let iapHoldId: string | null = null;
    const billingCtxForHold = await getBillingContext(billingDb, payload.userId);
    if (
      (billingCtxForHold?.paymentProvider === 'iap' &&
        billingCtxForHold.billingEntity === 'individual') ||
      (billingCtxForHold?.billingEntity === 'organization' && billingCtxForHold?.hardStop)
    ) {`;

const replaceWorker = `    // ── IAP hold: show "Processing" amount in usage overview ─────────────
    // For prepaid wallet users, create a hold at job start so the UI can display
    // the estimated in-flight cost under "Processing". Released or captured at end.
    let iapHoldId: string | null = null;
    const target = await resolveBillingTarget(billingDb, payload.userId);
    const billingCtxForHold = target.context;

    // Create a hold for any prepaid user (org or individual IAP)
    if (
      (billingCtxForHold?.paymentProvider === 'iap' && target.type === 'individual') ||
      target.type === 'organization'
    ) {`;

contentWorker = contentWorker.replace(searchWorker, replaceWorker);

fs.writeFileSync(file, content);
fs.writeFileSync(fileWorker, contentWorker);

console.log('Patches applied successfully.');
