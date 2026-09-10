import { useEffect, useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import EvidenceList from '../../components/EvidenceList';
import {
  COMPLAINT_CATEGORIES, RESOLUTION_TYPES, statusColors, priorityColors, refundStatusColors,
  label, TERMINAL_STATUSES,
} from '../../utils/complaints';

const NEXT = {
  SUBMITTED: ['UNDER_REVIEW', 'INVESTIGATING', 'REJECTED', 'ESCALATED'],
  OPEN: ['UNDER_REVIEW', 'INVESTIGATING', 'REJECTED'],
  UNDER_REVIEW: ['INVESTIGATING', 'REJECTED', 'ESCALATED'],
  INVESTIGATING: ['RESOLUTION_PROPOSED', 'ESCALATED'],
  RESOLUTION_PROPOSED: ['INVESTIGATING', 'ESCALATED'],
};

export default function AdminComplaints() {
  const [complaints, setComplaints] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 1, limit: 12 });
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [category, setCategory] = useState('');
  const [safety, setSafety] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);
  const [note, setNote] = useState('');
  const [proposal, setProposal] = useState({ decisionType: '', reason: '', amount: '' });
  const [escForm, setEscForm] = useState({ reason: '', to: 'Cooperative Dispute Committee' });
  const [suspForm, setSuspForm] = useState({ temporary: true, until: '', reason: '' });
  const [unsuspForm, setUnsuspForm] = useState({ reason: '' });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.append('status', status);
      if (priority) params.append('priority', priority);
      if (category) params.append('category', category);
      if (safety) params.append('safety', 'true');
      if (search) params.append('search', search);
      params.append('page', page);
      params.append('limit', 12);
      const res = await api.get(`/admin/complaints?${params}`);
      setComplaints(res.data || []);
      setMeta(res.meta || { total: 0, page: 1, totalPages: 1, limit: 12 });
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { setPage(1); }, [status, priority, category, safety]);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status, priority, category, safety, page]);
  useEffect(() => {
    const t = setTimeout(() => { if (search) setPage(1); load(); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const openDetail = async (id) => {
    try {
      setLoading(true);
      const res = await api.get(`/admin/complaints/${id}`);
      setDetail(res.data || res);
      setNote(''); setProposal({ decisionType: '', reason: '', amount: '' });
    } catch (e) {
      toast.error(e.message || 'Failed to load detail');
    }
    setLoading(false);
  };

  const act = async (path, body, okMsg, reloadDetail = true) => {
    try {
      setBusy(true);
      const res = await api.post(`/admin/complaints/${detail.complaint._id}${path}`, body);
      toast.success(res.message || okMsg || 'Done');
      if (reloadDetail) await openDetail(detail.complaint._id);
      load();
    } catch (e) {
      toast.error(e.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const transition = (nextStatus, noteText) => act('', { status: nextStatus, note: noteText }, `${nextStatus}, ${new Date().toLocaleString()}`);

  const setPriorityOverride = () => act('', { priority }, 'Priority updated');

  const c = (detail && detail.complaint) || null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Complaints & Disputes</h2>
        <span className="text-sm text-gray-500">{meta.total} total</span>
      </div>

      {/* Filters */}
      <div className="card flex flex-wrap items-center gap-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by ID / description / booking…" className="input-field flex-1 min-w-[200px]" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input-field">
          <option value="">All statuses</option>
          {['SUBMITTED', 'UNDER_REVIEW', 'INVESTIGATING', 'RESOLUTION_PROPOSED', 'RESOLVED', 'REJECTED', 'CANCELLED', 'ESCALATED', 'OPEN'].map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className="input-field">
          <option value="">All priorities</option>
          {['HIGH', 'MEDIUM', 'LOW'].map((p) => <option key={p}>{p}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-field">
          <option value="">All categories</option>
          {COMPLAINT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={safety} onChange={(e) => setSafety(e.target.checked)} /> Safety only
        </label>
      </div>

      {loading && !detail ? (
        <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div></div>
      ) : complaints.length === 0 ? (
        <div className="text-center py-20 text-gray-400">No complaints match your filters</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="py-2 pr-3">ID / Date</th>
                <th className="py-2 pr-3">Category</th>
                <th className="py-2 pr-3">Customer</th>
                <th className="py-2 pr-3">Worker</th>
                <th className="py-2 pr-3">Booking</th>
                <th className="py-2 pr-3">Priority</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Evidence</th>
                <th className="py-2">Refund</th>
              </tr>
            </thead>
            <tbody>
              {complaints.map((cmp) => (
                <tr key={cmp._id} onClick={() => openDetail(cmp._id)} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
                  <td className="py-2.5 pr-3">
                    <div className="font-semibold text-gray-800">{cmp.complaintNumber}</div>
                    <div className="text-xs text-gray-400">{new Date(cmp.createdAt).toLocaleDateString()}</div>
                  </td>
                  <td className="py-2.5 pr-3 text-gray-600">
                    {label(cmp.category, COMPLAINT_CATEGORIES)}
                    {cmp.isSafety && <span className="block text-[10px] text-red-600 font-semibold mt-0.5">⚠ SAFETY</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-gray-600">
                    <div>{cmp.customer?.name || '—'}</div>
                    <div className="text-xs text-gray-400">{cmp.customer?.email || ''}</div>
                  </td>
                  <td className="py-2.5 pr-3 text-gray-600">{cmp.workerName || '—'}</td>
                  <td className="py-2.5 pr-3 text-gray-600">{cmp.booking?.bookingNumber || '—'}</td>
                  <td className="py-2.5 pr-3"><span className={`badge ${priorityColors[cmp.priority] || 'badge-gray'}`}>{cmp.priority}</span></td>
                  <td className="py-2.5 pr-3"><span className={`badge ${statusColors[cmp.status] || 'badge-gray'}`}>{cmp.status.replace('_', ' ')}</span></td>
                  <td className="py-2.5 pr-3 text-gray-600">{cmp.evidence?.length || cmp.images?.length || 0}</td>
                  <td className="py-2.5 text-gray-600">
                    {cmp.refund?.status ? <span className={`badge ${refundStatusColors[cmp.refund.status]}`}>{cmp.refund.status}</span> : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {meta.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs text-gray-400">Page {meta.page} of {meta.totalPages}</span>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn-secondary text-xs">Prev</button>
                <button disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)} className="btn-secondary text-xs">Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Investigation drawer */}
      {detail && c && (
        <div className="fixed inset-0 z-50 bg-black/40 flex justify-end">
          <div className="bg-white w-full max-w-3xl h-full overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{c.complaintNumber}</h3>
                <p className="text-sm text-gray-500">Filed {new Date(c.createdAt).toLocaleString()}</p>
              </div>
              <div className="flex gap-2">
                <span className={`badge ${priorityColors[c.priority] || 'badge-gray'}`}>{c.priority}</span>
                <span className={`badge ${statusColors[c.status] || 'badge-gray'}`}>{c.status.replace('_', ' ')}</span>
                <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
              </div>
            </div>

            {c.isSafety && (
              <div className="p-3 bg-red-50 rounded-lg text-sm text-red-700 font-medium">
                ⚠ Safety-related complaint — reviewed with high priority.
              </div>
            )}

            {/* Complaint info */}
            <div className="card">
              <h4 className="font-semibold mb-2">Complaint</h4>
              <p className="text-xs text-gray-500">Category: <span className="text-gray-700">{label(c.category, COMPLAINT_CATEGORIES)}</span></p>
              <p className="text-sm text-gray-700 mt-1">{c.description}</p>
              {c.preferredResolution && <p className="text-xs text-gray-500 mt-2">Requested outcome: {label(c.preferredResolution, RESOLUTION_TYPES.concat([{ value: 'APOLOGY', label: 'Apology' }]).concat([{ value: 'NO_REFUND', label: 'No refund needed' }]))}</p>}
              {c.evidence?.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-gray-500 mb-1">Customer evidence</p>
                  <EvidenceList items={c.evidence} max={8} />
                </div>
              )}
            </div>

            {/* Parties */}
            <div className="grid grid-cols-2 gap-3">
              <div className="card">
                <h4 className="font-semibold mb-1">Customer</h4>
                <p className="text-sm text-gray-700">{c.customer?.name || '—'}</p>
                <p className="text-xs text-gray-500">{c.customer?.email} {c.customer?.phone && `• ${c.customer.phone}`}</p>
                <p className="text-xs text-gray-400 mt-1">Previous complaints by this customer: {complaints.filter((x) => x.customer?._id === c.customer?._id).length}</p>
              </div>
              <div className="card">
                <h4 className="font-semibold mb-1">Worker</h4>
                <p className="text-sm text-gray-700">{detail.workerProfile?.user?.name || '—'}</p>
                <p className="text-xs text-gray-500">
                  {detail.workerProfile?.user?.email} • {detail.workerProfile?.city || ''}
                </p>
                <div className="flex flex-wrap gap-2 mt-1 text-[11px]">
                  <span className={`badge ${detail.workerProfile?.isActive === false ? 'badge-danger' : 'badge-success'}`}>
                    {detail.workerProfile?.terminatedAt ? 'Terminated (permanent)' : detail.workerProfile?.isActive === false ? 'Suspended' : 'Active'}
                  </span>
                  <span className="badge badge-gray">Verification: {detail.workerProfile?.verificationStatus}</span>
                  <span className="badge badge-gray">{detail.workerProfile?.completedJobs || 0} jobs</span>
                  {detail.workerProfile?.rating > 0 && <span className="badge badge-gray">⭐ {detail.workerProfile.rating.toFixed(1)}</span>}
                  <span className={`badge ${(detail.workerProfile?.suspensionCount || 0) >= 3 ? 'badge-danger' : 'badge-warning'}`}>
                    {detail.workerProfile?.suspensionCount ? `Suspensions ${detail.workerProfile.suspensionCount}/3` : 'No prior suspensions'}
                  </span>
                  {detail.workerProfile?.suspendedUntil && !detail.workerProfile.terminatedAt && (
                    <span className="badge badge-warning">Until {new Date(detail.workerProfile.suspendedUntil).toLocaleDateString()}</span>
                  )}
                </div>
                {detail.workerProfile?.suspensionNote && (
                  <p className="text-xs text-red-600 mt-1">Note: {detail.workerProfile.suspensionNote}</p>
                )}
              </div>
            </div>

            {/* Booking */}
            <div className="card">
              <h4 className="font-semibold mb-2">Booking</h4>
              <p className="text-sm text-gray-700">{c.booking?.bookingNumber} • {c.booking?.serviceSnapshot?.name || ''}</p>
              <p className="text-xs text-gray-500">
                {c.booking?.area}, {c.booking?.city} • {c.booking?.requestedDate ? new Date(c.booking.requestedDate).toLocaleDateString() : ''} {c.booking?.timeSlot}
                {c.booking?.isEmergency && ' • ⚡ Emergency'}
              </p>
              {c.booking?.priceBreakdown && (
                <p className="text-sm text-gray-700 mt-1">Total: ₹{c.booking.priceBreakdown.total}</p>
              )}
              {c.booking?.cancellationReason && <p className="text-xs text-gray-400 mt-1">Cancellation: {c.booking.cancellationReason}</p>}
            </div>

            {/* Payments, invoice, reviews */}
            <div className="card space-y-2">
              <h4 className="font-semibold">Financials</h4>
              {(!detail.payments || detail.payments.length === 0) && <p className="text-xs text-gray-400">No payments found for this booking</p>}
              {detail.payments?.map((p) => (
                <div key={p._id} className="text-sm flex items-center gap-3">
                  <span className="text-gray-600">{p.paymentNumber || p.method}</span>
                  <span>₹{p.amount}</span>
                  <span className="text-xs text-gray-400">{p.status}</span>
                  {p.refundedAt && <span className="badge badge-success">Refunded {new Date(p.refundedAt).toLocaleDateString()}</span>}
                </div>
              ))}
              {detail.invoices?.map((inv) => (
                <div key={inv._id} className="text-sm flex items-center gap-3">
                  <span className="text-gray-600">{inv.invoiceNumber}</span>
                  <span>₹{inv.amount}</span>
                  <span className="text-xs text-gray-400">{inv.paymentStatus}</span>
                </div>
              ))}
              {detail.reviews?.map((r) => (
                <p key={r._id} className="text-xs text-gray-500">Review: {r.overallQuality}/5 — {r.comment}</p>
              ))}
            </div>

            {/* Resolution proposal / refund */}
            {c.resolutionDecision && (
              <div className="card border-green-200">
                <h4 className="font-semibold mb-1">Resolution</h4>
                <p className="text-sm text-gray-700">{c.resolutionDecision.decisionType?.replace('_', ' ')} {c.resolutionDecision.amount > 0 && `• ₹${c.resolutionDecision.amount}`}</p>
                {c.resolutionDecision.reason && <p className="text-xs text-gray-500">{c.resolutionDecision.reason}</p>}
                {c.refund?.status && (
                  <p className="text-xs mt-2 flex items-center gap-2">
                    Refund {c.refund.refundNumber}
                    <span className={`badge ${refundStatusColors[c.refund.status]}`}>{c.refund.status}</span>
                    <span>₹{c.refund.amount}</span>
                  </p>
                )}
              </div>
            )}

            {/* Conversation */}
            {c.responses?.length > 0 && (
              <div className="card">
                <h4 className="font-semibold mb-2">Conversation</h4>
                <div className="space-y-2">
                  {c.responses.map((r, i) => (
                    <div key={i} className="text-xs bg-gray-50 p-2 rounded-lg">
                      <span className="font-semibold text-gray-700">{r.role} · {new Date(r.submittedAt).toLocaleString()}</span>
                      {r.acceptResponsibility && <span className="ml-2 text-amber-600">accepts responsibility</span>}
                      {r.dispute && <span className="ml-2 text-red-600">disputes</span>}
                      {r.message && <p className="text-gray-600 mt-0.5">{r.message}</p>}
                      {r.evidence?.length > 0 && <div className="mt-1"><EvidenceList items={r.evidence} max={4} /></div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Status history */}
            {c.history?.length > 0 && (
              <div className="card">
                <h4 className="font-semibold mb-2">Timeline</h4>
                <div className="space-y-1.5">
                  {c.history.map((h, i) => (
                    <p key={i} className="text-xs text-gray-500">• {h.status.replace('_', ' ')} — {new Date(h.at || h.updatedAt).toLocaleString()} {h.note && `(${h.note})`}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            {!TERMINAL_STATUSES.includes(c.status) && (
              <div className="card space-y-4 border-amber-200">
                <h4 className="font-semibold">Admin actions</h4>

                <div className="flex flex-wrap items-center gap-3">
                  <select value={priority} onChange={(e) => setPriority(e.target.value)} className="input-field w-32">
                    <option value="">Priority…</option>
                    {['HIGH', 'MEDIUM', 'LOW', 'URGENT'].map((p) => <option key={p}>{p}</option>)}
                  </select>
                  <button onClick={setPriorityOverride} className="btn-secondary text-xs">Set priority</button>
                  {(NEXT[c.status] || []).map((s) => (
                    <button key={s} onClick={() => transition(s)} className="btn-primary text-xs">
                      {s === 'RESOLUTION_PROPOSED' ? 'Propose Resolution' : `→ ${s.replace('_', ' ')}`}
                    </button>
                  ))}
                </div>

                {c.status !== 'INVESTIGATING' && (
                  <button onClick={() => transition('INVESTIGATING')} className="btn-primary text-xs">Begin Investigation</button>
                )}

                <div>
                  <label className="text-xs font-medium text-gray-600">Add note on file</label>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="input-field mt-1" placeholder="Investigation notes…" />
                  <button onClick={() => act('/respond', { message: note }, 'Note added')} disabled={!note.trim() || busy} className="btn-secondary text-xs mt-2">Post note</button>
                </div>

                {(['INVESTIGATING', 'RESOLUTION_PROPOSED', 'UNDER_REVIEW', 'SUBMITTED'].includes(c.status)) && (
                  <div className="border-t border-gray-100 pt-3">
                    <label className="text-xs font-medium text-gray-600">Propose resolution</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      <select value={proposal.decisionType} onChange={(e) => setProposal({ ...proposal, decisionType: e.target.value })} className="input-field flex-1 min-w-[160px]">
                        <option value="">Decision…</option>
                        {RESOLUTION_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                      <input type="number" value={proposal.amount} onChange={(e) => setProposal({ ...proposal, amount: e.target.value })} placeholder="Amount ₹ (if any)" className="input-field w-36" />
                    </div>
                    <input value={proposal.reason} onChange={(e) => setProposal({ ...proposal, reason: e.target.value })} placeholder="Reason" className="input-field w-full mt-1" />
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => act('/propose-resolution', { ...proposal, amount: Number(proposal.amount) || 0 }, 'Resolution proposed')} disabled={!proposal.decisionType || busy} className="btn-primary text-xs">
                        {c.status === 'RESOLUTION_PROPOSED' ? 'Update Proposal' : 'Propose'}
                      </button>
                      {c.status === 'RESOLUTION_PROPOSED' && (
                        <button onClick={() => act('/finalize-resolution', {}, 'Complaint resolved')} disabled={busy} className="btn-success text-xs">
                          Finalize Resolution
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="border-t border-gray-100 pt-3">
                  <label className="text-xs font-medium text-gray-600">Escalate</label>
                  <select value={escForm.to} onChange={(e) => setEscForm({ ...escForm, to: e.target.value })} className="input-field w-full mt-1">
                    <option>Cooperative Dispute Committee</option>
                    <option>Local Police Liaison</option>
                    <option>Consumer Forum</option>
                    <option>Cooperative Board</option>
                  </select>
                  <input value={escForm.reason} onChange={(e) => setEscForm({ ...escForm, reason: e.target.value })} placeholder="Escalation reason" className="input-field w-full mt-1" />
                  <button onClick={() => act('/escalate', { reason: escForm.reason, to: escForm.to }, 'Escalated')} disabled={!escForm.reason.trim() || busy} className="btn-secondary text-xs mt-2">Escalate complaint</button>
                </div>

                <div className="border-t border-gray-100 pt-3">
                  <label className="text-xs font-medium text-gray-600 text-red-600">Suspend worker</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <select value={suspForm.temporary ? 'temp' : 'perm'} onChange={(e) => setSuspForm({ ...suspForm, temporary: e.target.value === 'temp' })} className="input-field w-40">
                      <option value="temp">Temporary</option>
                      <option value="perm">Permanent</option>
                    </select>
                    {suspForm.temporary ? (
                      <input type="datetime-local" value={suspForm.until} onChange={(e) => setSuspForm({ ...suspForm, until: e.target.value })} className="input-field w-48" />
                    ) : (
                      <span className="text-xs text-red-500 self-center">Worker blocked from new jobs</span>
                    )}
                  </div>
                  <input value={suspForm.reason} onChange={(e) => setSuspForm({ ...suspForm, reason: e.target.value })} placeholder="Suspension reason" className="input-field w-full mt-1" />
                  <button onClick={() => act('/suspend-worker', suspForm, 'Worker suspended')} disabled={!suspForm.reason.trim() || busy} className="btn-danger text-xs mt-2">Suspend worker</button>
                </div>

                {detail.workerProfile?.isActive === false && !detail.workerProfile?.terminatedAt && (
                  <div className="border-t border-gray-100 pt-3">
                    <label className="text-xs font-medium text-gray-600 text-green-700">Unsuspend worker</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      <input value={unsuspForm.reason} onChange={(e) => setUnsuspForm({ ...unsuspForm, reason: e.target.value })} placeholder="Unsuspension reason (optional)" className="input-field w-full" />
                      <button onClick={() => act('/unsuspend-worker', { reason: unsuspForm.reason }, 'Worker unsuspended')} disabled={busy} className="btn-success text-xs mt-1">Unsuspend worker</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {TERMINAL_STATUSES.includes(c.status) && (
              <p className="text-xs text-gray-400">This complaint is closed.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}