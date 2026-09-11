import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import toast from 'react-hot-toast';
import EvidenceList from '../../components/EvidenceList';
import { statusColors, priorityColors, label, COMPLAINT_CATEGORIES, refundStatusColors } from '../../utils/complaints';

export default function WorkerComplaints() {
  const { t } = useTranslation();
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [response, setResponse] = useState({ message: '', dispute: false, acceptResponsibility: false });
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      const res = await api.get('/complaints/mine');
      setComplaints(res.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const canRespond = (c) => !['RESOLVED', 'REJECTED', 'CANCELLED', 'ESCALATED'].includes(c.status);

  const submitResponse = async (c) => {
    if (!response.message.trim() && !response.acceptResponsibility && !response.dispute) {
      toast.error(t('toast.addMessageOrDispute', 'Add a message or accept/dispute'));
      return;
    }
    try {
      setSubmitting(true);
      const fd = new FormData();
      fd.append('message', response.message.trim());
      fd.append('acceptResponsibility', String(response.acceptResponsibility));
      fd.append('dispute', String(response.dispute));
      files.forEach((f) => fd.append('evidence', f));
      await api.post(`/complaints/${c._id}/respond`, fd);
      toast.success(t('toast.responseSubmitted', 'Response submitted'));
      setResponse({ message: '', dispute: false, acceptResponsibility: false });
      setFiles([]);
      load();
    } catch (err) {
      toast.error(err.message || t('toast.failed', 'Failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">{t('compl.title', 'Complaints Against Me')}</h2>
        <p className="text-sm text-gray-500">{t('compl.subtitle', 'Respond to or dispute complaints about your work')}</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div></div>
      ) : complaints.length === 0 ? (
        <div className="text-center py-20 text-gray-400">{t('compl.noComplaints', 'No complaints against you. Keep up the good work!')}</div>
      ) : (
        <div className="space-y-4">
          {complaints.map((c) => (
            <div key={c._id} className="card">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="font-semibold text-gray-900">{c.complaintNumber}</span>
                    <span className={`badge ${statusColors[c.status] || 'badge-gray'}`}>{c.status.replace('_', ' ')}</span>
                    <span className={`badge ${priorityColors[c.priority] || 'badge-gray'}`}>{c.priority}</span>
                    <span className="text-xs text-gray-400">{new Date(c.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm text-gray-700 mb-1"><span className="text-gray-400">{t('compl.category', 'Category:')}</span> {label(c.category, COMPLAINT_CATEGORIES)}</p>
                  <p className="text-sm text-gray-600">{c.description}</p>
                  <p className="text-xs text-gray-400 mt-2">{t('compl.bookingLabel', 'Booking:')} {c.booking?.bookingNumber || '—'} • {c.booking?.serviceSnapshot?.name || ''}</p>
                </div>
                <button onClick={() => setSelected(selected && selected._id === c._id ? null : c)} className="text-xs text-brand-600 font-medium shrink-0">
                  {selected && selected._id === c._id ? t('compl.hide', 'Hide') : t('compl.viewRespond', 'View / Respond')}
                </button>
              </div>

              {selected && selected._id === c._id && (
                <div className="mt-4 border-t border-gray-100 pt-4">
                  {c.customer?.name && <p className="text-xs text-gray-500 mb-2">{t('compl.filedByCustomer', 'Filed by customer')}</p>}

                  {c.evidence?.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-500 font-medium mb-1">{t('compl.customerEvidence', "Customer's evidence")}</p>
                      <EvidenceList items={c.evidence} max={6} />
                    </div>
                  )}

                  {c.responses?.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-500 font-medium mb-1">{t('compl.conversation', 'Conversation')}</p>
                      <div className="space-y-2">
                        {c.responses.map((r, i) => (
                          <div key={i} className="text-xs bg-gray-50 p-2 rounded-lg">
                            <span className="font-semibold text-gray-700">{r.role} · {new Date(r.submittedAt).toLocaleString()}</span>
                            {r.acceptResponsibility && <span className="ml-2 text-amber-600">{t('compl.acceptsResponsibility', 'accepts responsibility')}</span>}
                            {r.dispute && <span className="ml-2 text-red-600">{t('compl.disputes', 'disputes')}</span>}
                            {r.message && <p className="text-gray-600 mt-0.5">{r.message}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {c.resolutionDecision && (
                    <div className="text-xs bg-green-50 p-2 rounded-lg mb-3">
                      <span className="font-semibold text-green-700">{t('compl.decision', 'Decision:')} {c.resolutionDecision.decisionType?.replace('_', ' ')}</span>
                      {c.resolutionDecision.reason && <p className="text-green-700">{c.resolutionDecision.reason}</p>}
                    </div>
                  )}

                  {c.refund?.status && c.refund.status !== 'NOT_REQUIRED' && (
                    <div className="text-xs bg-blue-50 p-2 rounded-lg mb-3 flex items-center gap-2">
                      <span className="font-semibold text-blue-700">{t('compl.refundLabel', 'Refund')} {c.refund.refundNumber}</span>
                      <span className={`badge ${refundStatusColors[c.refund.status]}`}>{c.refund.status}</span>
                      <span>₹{c.refund.amount}</span>
                    </div>
                  )}

                  {canRespond(c) ? (
                    <div className="mt-2 space-y-3 border-t border-gray-100 pt-3">
                      <p className="text-xs text-gray-500 font-medium">{t('compl.yourResponse', 'Your response')}</p>
                      <textarea
                        value={response.message}
                        onChange={(e) => setResponse({ ...response, message: e.target.value })}
                        rows={3}
                        className="input-field"
                        placeholder={t('compl.shareSide', 'Share your side of the story…')}
                      />
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked={response.acceptResponsibility}
                          onChange={(e) => setResponse({ ...response, acceptResponsibility: e.target.checked, dispute: false })} />
                        {t('compl.acceptResponsibility', 'I accept responsibility for this issue')}
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked={response.dispute}
                          onChange={(e) => setResponse({ ...response, dispute: e.target.checked, acceptResponsibility: false })} />
                        {t('compl.disputeComplaint', 'I dispute this complaint')}
                      </label>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">{t('compl.supportingEvidence', 'Supporting evidence')}</label>
                        <input type="file" multiple accept="image/*,.pdf,video/mp4"
                          onChange={(e) => setFiles([...e.target.files])}
                          className="mt-1 w-full text-sm text-gray-500 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:text-sm file:font-medium" />
                      </div>
                      <button onClick={() => submitResponse(c)} disabled={submitting} className="btn-primary text-sm">
                        {submitting ? t('compl.submitting', 'Submitting…') : t('compl.submitResponse', 'Submit Response')}
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 border-t border-gray-100 pt-3 mt-2">{t('compl.closed', 'This complaint is closed.')}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
