// Pricing utility - computes price breakdown and worker earnings

/**
 * Compute price breakdown for a service
 * @param {Number} labourCost - base labour
 * @param {Number} materialsCost - estimated materials
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
  // Platform fee on subtotal
  const subtotal = labour + materials;
  const platformFee = (subtotal * platformFeePercent) / 100;

  const total = Math.round((labour + materials + cooperativeContribution + platformFee) * 100) / 100;

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
