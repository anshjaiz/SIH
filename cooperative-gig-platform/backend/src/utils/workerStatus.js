const formatUntil = (d) => {
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const daysLeft = (d) => {
  const ms = new Date(d).getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86400000);
};

// Returns a suspension/termination status for a worker profile, or null if active.
const suspensionStatus = (wp) => {
  if (!wp || wp.isActive !== false) return null;
  if (wp.terminatedAt) {
    return {
      terminated: true,
      code: 'TERMINATED',
      message: 'Your account has been permanently terminated from the platform.',
    };
  }
  if (wp.suspendedUntil) {
    const left = daysLeft(wp.suspendedUntil);
    return {
      terminated: false,
      code: 'SUSPENDED',
      suspendedUntil: wp.suspendedUntil,
      message: left > 0
        ? `Your account is suspended until ${formatUntil(wp.suspendedUntil)} ${reasonSuffix(wp)}(${left} day${left === 1 ? '' : 's'} remaining).`
        : `Your account is suspended. ${reasonSuffix(wp)}Contact support if you believe this is a mistake.`,
    };
  }
  return {
    terminated: false,
    code: 'SUSPENDED',
    message: 'Your account is currently suspended. Contact support if you believe this is a mistake.',
  };
};

const reasonSuffix = (wp) => (wp.suspensionNote ? `Reason: ${wp.suspensionNote}. ` : '');

module.exports = {
  suspensionStatus,
  formatUntil,
  daysLeft,
  reasonSuffix,
};