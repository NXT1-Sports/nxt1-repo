const fs = require('fs');
const file = 'src/modules/billing/budget.service.ts';
let content = fs.readFileSync(file, 'utf8');

// Replace the top part of createWalletHold
content = content.replace(
  /export async function createWalletHold\([\s\S]*?let availableBalance = 0;/m,
  `export async function createWalletHold(
  db: Firestore,
  userId: string,
  estimatedCostCents: number,
  jobId: string,
  feature: string
): Promise<WalletHoldResult> {
  if (estimatedCostCents <= 0) {
    return { success: false, reason: 'Estimated cost must be positive' };
  }

  let holdId = '';
  let availableBalance = 0;
  
  // Resolve the billing target *outside* the transaction so we lock the exact org 
  // that will actually be billed at the end of the AI job.
  const target = await resolveBillingTarget(db, userId);`
);

// Now replace the transaction body
content = content.replace(
  /      const billingRecord = await getBillingContextRecordForTransaction\(txn, db, userId\);\s*if \(\!billingRecord\) {\s*throw new Error\('Billing context not found'\);\s*}\s*const docRef = billingRecord.ref;\s*const data = billingRecord.data;\s*const walletBalance = data.walletBalanceCents \?\? 0;\s*const pendingHolds = data.pendingHoldsCents \?\? 0;\s*const currentSpend = data.currentPeriodSpend \?\? 0;\s*const monthlyBudget = data.monthlyBudget \?\? 0;\s*let orgMasterRef: FirebaseFirestore.DocumentReference \| null = null;\s*let orgMasterData: BillingContext \| null;\s*if \(data.billingEntity === 'organization'\) {[\s\S]*?await getBillingContextRecordForTransaction\(txn, db, orgUserId\);\s*if \(\!orgRecord\) {[\s\S]*?orgMasterData = orgRecord.data;\s*const orgWalletBalance = orgMasterData.walletBalanceCents \?\? 0;/m,
  `      // Always lock the individual's context for personal UI tracking
      const billingRecord = await getBillingContextRecordForTransaction(txn, db, userId);
      if (!billingRecord) throw new Error('Billing context not found');
      
      const docRef = billingRecord.ref;
      const data = billingRecord.data;

      const walletBalance = data.walletBalanceCents ?? 0;
      const pendingHolds = data.pendingHoldsCents ?? 0;
      const currentSpend = data.currentPeriodSpend ?? 0;
      const monthlyBudget = data.monthlyBudget ?? 0;

      let orgMasterRef: FirebaseFirestore.DocumentReference | null = null;
      let orgMasterData: BillingContext | null;
      
      if (target.type === 'organization' && target.organizationId) {
        // Enforce budget against the org master context discovered by resolveBillingTarget
        const orgUserId = target.billingUserId; // 'org:<orgId>'
        const orgRecord = await getBillingContextRecordForTransaction(txn, db, orgUserId);
        if (!orgRecord) throw new Error(\`Org master billing context not found for \$\{orgUserId\}\`);
        
        orgMasterRef = orgRecord.ref;
        orgMasterData = orgRecord.data;

        const orgWalletBalance = orgMasterData.walletBalanceCents ?? 0;`
);

fs.writeFileSync(file, content);
console.log('Patched createWalletHold');
