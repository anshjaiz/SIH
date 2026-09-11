// Pricing utility - computes price breakdown and worker earnings

/**
 * Compute price breakdown for a service.
 *
 * The customer-facing price (total) is ALL-INCLUSIVE: it equals
 * labour + materials only. The platform fee and cooperative contribution are
 * carved out internally from the service charge (shown as "Included"), never
 * added on top of what the customer sees.
 *
 * @param {Number} labourCost - base labour (service charge)
 * @param {Number} materialsCost - approved material cost (0 at booking creation)
 * @param {Object} cooperativeConfig - { cooperativeContributionPercent, platformFeePercent, gstPercent }
 */
const computePriceBreakdown = (
  labourCost,
  materialsCost,
  cooperativeConfig = { cooperativeContributionPercent: 2, platformFeePercent: 5, gstPercent: 0 }
) => {
  const { cooperativeContributionPercent = 2, platformFeePercent = 5 } = cooperativeConfig;

  const labour = Number(labourCost) || 0;
  const materials = Number(materialsCost) || 0;

  // Cooperative contribution is typically a fixed percentage of labour
  const cooperativeContribution = (labour * cooperativeContributionPercent) / 100;
  // Platform fee on subtotal (informational share of the all-inclusive price)
  const subtotal = labour + materials;
  const platformFee = (subtotal * platformFeePercent) / 100;

  // All-inclusive: service charge + approved materials. No fee on top.
  const total = Math.round((labour + materials) * 100) / 100;

  return {
    labour,
    materials,
    cooperativeContribution: Math.round(cooperativeContribution * 100) / 100,
    platformFee: Math.round(platformFee * 100) / 100,
    total,
  };
};

/**
 * Compute worker earnings from a payment.
 *
 * PRICING MODEL (Option B, matches the existing all-inclusive logic):
 *   Customer pays the service price (₹500). The platform fee (5%) and the
 *   cooperative contribution (2%) are carved out internally — they are NEVER
 *   added on top of the customer's price. The worker therefore receives:
 *       gross − platformFee − cooperativeContribution   (e.g. ₹475 on ₹500
 *     when the cooperative contribution is 0%, ₹465 at the default 2%).
 *
 * @param {Number} gross - worker's gross = labour (service charge)
 * @param {Number} platformFee
 * @param {Number} cooperativeContributionPercent
 */
const computeWorkerEarnings = (
  gross,
  platformFee,
  cooperativeContributionPercent = 2
) => {
  const labour = Number(gross) || 0;
  const fee = Number(platformFee) || 0;
  const cooperativeDeduction = (labour * cooperativeContributionPercent) / 100;
  const netEarnings = labour - fee - cooperativeDeduction;

  return {
    workerGross: round(labour),
    platformFee: round(fee),
    cooperativeDeduction: round(cooperativeDeduction),
    workerNetEarnings: round(netEarnings),
  };
};

/**
 * Full split for the payment receipt — all figures backend-computed.
 * @param {Number} labour - service charge
 * @param {Number} materials - approved material cost (usually 0 at payment)
 * @param {Object} cooperativeConfig { cooperativeContributionPercent, platformFeePercent }
 */
const computeEarningsSplit = (
  labour,
  materials,
  cooperativeConfig = { cooperativeContributionPercent: 2, platformFeePercent: 5 }
) => {
  const breakdown = computePriceBreakdown(labour, materials, cooperativeConfig);
  const worker = computeWorkerEarnings(
    labour,
    breakdown.platformFee,
    cooperativeConfig.cooperativeContributionPercent
  );

  return {
    customerTotal: breakdown.total,
    labour: breakdown.labour,
    materials: breakdown.materials,
    platformFee: breakdown.platformFee,
    cooperativeContribution: breakdown.cooperativeContribution,
    workerGross: worker.workerGross,
    cooperativeDeduction: worker.cooperativeDeduction,
    workerNetEarnings: worker.workerNetEarnings,
  };
};

const round = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

module.exports = { computePriceBreakdown, computeWorkerEarnings, computeEarningsSplit };
