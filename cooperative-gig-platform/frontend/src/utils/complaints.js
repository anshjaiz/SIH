export const COMPLAINT_CATEGORIES = [
  { value: 'POOR_SERVICE_QUALITY', label: 'Poor service quality' },
  { value: 'WORKER_NOT_ARRIVED', label: 'Worker never arrived' },
  { value: 'WORKER_ARRIVED_LATE', label: 'Worker arrived late' },
  { value: 'WRONG_SERVICE', label: 'Wrong service performed' },
  { value: 'OVERCHARGING', label: 'Overcharging / pricing' },
  { value: 'PAYMENT_ISSUE', label: 'Payment issue' },
  { value: 'WORKER_BEHAVIOUR', label: 'Worker behaviour' },
  { value: 'SAFETY_CONCERN', label: 'Safety concern (urgent)' },
  { value: 'DAMAGE_TO_PROPERTY', label: 'Damage to property' },
  { value: 'INCOMPLETE_WORK', label: 'Incomplete work' },
  { value: 'OTHER', label: 'Other' },
];

export const PREFERRED_RESOLUTIONS = [
  { value: 'FULL_REFUND', label: 'Full refund' },
  { value: 'PARTIAL_REFUND', label: 'Partial refund' },
  { value: 'REWORK', label: 'Redo the job' },
  { value: 'APOLOGY', label: 'Apology only' },
  { value: 'NO_REFUND', label: 'No refund needed' },
  { value: 'OTHER', label: 'Other' },
];

export const RESOLUTION_TYPES = [
  { value: 'FULL_REFUND', label: 'Full refund' },
  { value: 'PARTIAL_REFUND', label: 'Partial refund' },
  { value: 'NO_REFUND', label: 'No refund' },
  { value: 'REWORK', label: 'Rework job' },
  { value: 'WORKER_WARNING', label: 'Worker warning' },
  { value: 'WORKER_PENALTY', label: 'Worker penalty' },
  { value: 'CUSTOMER_COMPENSATION', label: 'Customer compensation' },
  { value: 'ESCALATION', label: 'Escalation' },
  { value: 'OTHER', label: 'Other' },
];

export const STATUS_FLOW = ['SUBMITTED', 'UNDER_REVIEW', 'INVESTIGATING', 'RESOLUTION_PROPOSED', 'RESOLVED'];

export const TERMINAL_STATUSES = ['RESOLVED', 'REJECTED', 'CANCELLED', 'ESCALATED'];

export const statusColors = {
  SUBMITTED: 'bg-blue-100 text-blue-700',
  UNDER_REVIEW: 'bg-amber-100 text-amber-700',
  INVESTIGATING: 'bg-purple-100 text-purple-700',
  RESOLUTION_PROPOSED: 'bg-sky-100 text-sky-700',
  RESOLVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-gray-200 text-gray-600',
  ESCALATED: 'bg-red-100 text-red-700',
  OPEN: 'bg-blue-100 text-blue-700',
};

export const priorityColors = {
  LOW: 'bg-gray-100 text-gray-600',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  URGENT: 'bg-red-100 text-red-700',
};

export const refundStatusColors = {
  NOT_REQUIRED: 'bg-gray-100 text-gray-600',
  PENDING: 'bg-amber-100 text-amber-700',
  PROCESSING: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
};

export const label = (value, list) => (list.find((i) => i.value === value)?.label || value).replace(/_/g, ' ');

export const evidenceType = (item) => (item.path || item.url || '').match(/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i)
  ? 'IMAGE'
  : (item.path || item.url || '').toLowerCase().includes('.mp4') || item.type === 'VIDEO'
    ? 'VIDEO'
    : item.type === 'DOCUMENT' || (item.path || item.url || '').match(/\.pdf$/i)
      ? 'DOCUMENT'
      : 'IMAGE';

export const fullUrl = (path) => (path && path.startsWith('http') ? path : `${(import.meta.env.VITE_API_URL || '')}${path || ''}`);