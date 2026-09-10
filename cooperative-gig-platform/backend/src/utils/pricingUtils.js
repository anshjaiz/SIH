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
 * Compute worker earnings from a payment
 * @param {Number} amount - gross amount paid (labour portion typically)
 * @param {Number} cooperativeContributionPercent
 */
const computeWorkerEarnings = (amount, cooperativeContributionPercent = 2) => {
  const gross = Number(amount) || 0;
  const cooperativeDeduction = (gross * cooperativeContributionPercent) / 100;
  const netEarnings = gross - cooperativeDeduction;

  return {
    workerGross: Math.round(gross * 100) / 100,
    cooperativeDeduction: Math.round(cooperativeDeduction * 100) / 100,
    workerNetEarnings: Math.round(netEarnings * 100) / 100,
  };
};

module.exports = { computePriceBreakdown, computeWorkerEarnings };
