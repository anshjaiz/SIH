import { useEffect, useState, useCallback } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';

const LEVEL_COLOR = {
  GOOD: 'badge-success',
  WARNING: 'badge-warning',
  LOW_RELIABILITY: 'badge-info',
  TEMPORARILY_SUSPENDED: 'badge-danger',
  DEACTIVATION_REVIEW: 'badge-danger',
};

const STATUS_LABEL = {
  ACTIVE: 'Active',
  WARNING: 'Warning',
  LOW_RELIABILITY: 'Low Reliability',
  TEMPORARILY_SUSPENDED: 'Temporarily Suspended',
  DEACTIVATION_REVIEW: 'Deactivation Review',
};

export default function AdminReliability() {
  const [tab, setTab] = useState('workers');
  const [workers, setWorkers] = useState([]);
  const [meta, setMeta] = useState({});
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState(null);
  const [loadingList, setLoadingList] = useState(false);
  const [modal, setModal] = useState(null); // {type:'adjust'|'suspend'|'reactivate', worker}
  const [form, setForm] = useState({ points: 0, reason: '', note: '', durationDays: 7, accountStatus: 'TEMPORARILY_SUSPENDED' });
  const [appeals, setAppeals] = useState({ appeals: [], meta: {} });
  const [settings, setSettings] = useState(null);

  const loadWorkers = useCallback(async (p = page, s = search) => {
    setLoadingList(true);
    try {
      const params = new URLSearchParams();
      if (s) params.append('search', s);
      params.append('page', p);
      const res = await api.get(`/admin/reliability/workers?${params}`);
      setWorkers(res.data?.workers || []);
      setMeta(res.data?.meta || {});
    } catch (e) { console.error(e); }
    setLoadingList(false);
  }, [page, search]);

  useEffect(() => {
    if (tab === 'workers') loadWorkers(page, search);
  }, [tab, page, search, loadWorkers]);

  const loadDetail = async (id) => {
    try {
      const res = await api.get(`/admin/reliability/workers/${id}`);
      setDetail(res.data);
    } catch (e) { toast.error(e.message || 'Failed'); }
  };

  const loadAppeals = useCallback(async () => {
    try {
      const res = await api.get('/admin/reliability/appeals?limit=50');
      setAppeals(res.data || { appeals: [], meta: {} });
    } catch (e) { console.error(e); }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const res = await api.get('/admin/reliability/settings');
      setSettings(res.data);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    if (tab === 'appeals') loadAppeals();
    if (tab === 'settings') loadSettings();
  }, [tab, loadAppeals, loadSettings]);

  const submitAdjust = async () => {
    if (!form.reason) return toast.error('Reason is required');
    try {
      await api.post(`/admin/reliability/workers/${modal.worker._id}/adjust`, {
        points: Number(form.points) || 0,
        reason: form.reason,
        adminNote: form.note,
      });
      toast.success('Score adjusted');
      setModal(null); setForm({ points: 0, reason: '', note: '', durationDays: 7, accountStatus: 'TEMPORARILY_SUSPENDED' });
      loadWorkers(); loadDetail(modal.worker._id);
    } catch (e) { toast.error(e.message || 'Failed'); }
  };

  const submitSuspend = async () => {
    try {
      await api.post(`/admin/reliability/workers/${modal.worker._id}/suspend`, {
        accountStatus: form.accountStatus,
        durationDays: form.accountStatus === 'DEACTIVATION_REVIEW' ? undefined : Number(form.durationDays) || undefined,
        reason: form.reason || 'Admin suspension',
        adminNote: form.note,
      });
      toast.success('Worker suspended from earning');
      setModal(null); setForm({ points: 0, reason: '', note: '', durationDays: 7, accountStatus: 'TEMPORARILY_SUSPENDED' });
      loadWorkers(); loadDetail(modal.worker._id);
    } catch (e) { toast.error(e.message || 'Failed'); }
  };

  const submitReactivate = async () => {
    try {
      await api.post(`/admin/reliability/workers/${modal.worker._id}/reactivate`, { reason: form.reason || 'Reactivated by admin' });
      toast.success('Worker reactivated');
      setModal(null); setForm({ points: 0, reason: '', note: '', durationDays: 7, accountStatus: 'TEMPORARILY_SUSPENDED' });
      loadWorkers(); loadDetail(modal.worker._id);
    } catch (e) { toast.error(e.message || 'Failed'); }
  };

  const decideAppeal = async (appeal, action) => {
    const note = window.prompt(`${action} note:`);
    try {
      await api.post(`/admin/reliability/appeals/${appeal._id}/${action.toLowerCase()}`, { note: note || '' });
      toast.success(`Appeal ${action.toLowerCase()}`);
      loadAppeals();
    } catch (e) { toast.error(e.message || 'Failed'); }
  };

  const saveSettings = async () => {
    const body = {
      points: {
        noShow: Number(settings.points.noShow),
        repeatedNoShowExtra: Number(settings.points.repeatedNoShowExtra),
        lateArrival: Number(settings.points.lateArrival),
        cancelAfterAccept: Number(settings.points.cancelAfterAccept),
        completeJob: Number(settings.points.completeJob),
        onTime: Number(settings.points.onTime),
        goodRating: Number(settings.points.goodRating),
        collaboration: Number(settings.points.collaboration),
      },
      noShowGraceMinutes: Number(settings.noShowGraceMinutes),
      jobExpiryGraceMinutes: Number(settings.jobExpiryGraceMinutes),
      lateToleranceMinutes: Number(settings.lateToleranceMinutes),
      reminderLeadMinutes: Number(settings.reminderLeadMinutes),
      maxReassignmentAttempts: Number(settings.maxReassignmentAttempts),
    };
    try {
      await api.put('/admin/reliability/settings', body);
      toast.success('Settings saved');
    } catch (e) { toast.error(e.message || 'Failed'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Reliability & Merit</h2>
        <div className="flex gap-2">
          {[['workers', 'Workers'], ['appeals', 'Penalty Appeals'], ['settings', 'Settings']].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium ${tab === k ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ---------------- WORKERS TAB ---------------- */}
      {tab === 'workers' && (
        <>
          <div className="flex items-center gap-3">
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by name / email / city…"
              className="input-field max-w-sm"
            />
            <span className="text-sm text-gray-500">{meta.total} workers</span>
          </div>

          {loadingList ? (
            <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div></div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="pb-3 font-medium">Worker</th>
                    <th className="pb-3 font-medium">Skills</th>
                    <th className="pb-3 font-medium">Score</th>
                    <th className="pb-3 font-medium">Level</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {workers.map((w) => (
                    <tr key={w._id} className="hover:bg-gray-50">
                      <td className="py-3">
                        <p className="font-medium">{w.name || '—'}</p>
                        <p className="text-xs text-gray-500">{w.email}</p>
                      </td>
                      <td className="py-3 text-gray-600">{w.skillsCount}</td>
                      <td className="py-3">
                        <span className={`font-bold ${w.reliability >= 80 ? 'text-green-600' : w.reliability >= 60 ? 'text-yellow-600' : w.reliability >= 40 ? 'text-orange-600' : 'text-red-600'}`}>
                          {w.reliability}
                        </span>
                      </td>
                      <td className="py-3"><span className={`badge ${LEVEL_COLOR[w.level]}`}>{w.level?.replace(/_/g, ' ')}</span></td>
                      <td className="py-3"><span className="badge badge-gray">{STATUS_LABEL[w.accountStatus]}</span></td>
                      <td className="py-3 text-right">
                        <button onClick={() => loadDetail(w._id)} className="btn-secondary text-xs px-3 py-1.5">Manage</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {meta.pages > 1 && (
                <div className="flex justify-center gap-2 mt-4">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="btn-secondary text-sm">← Prev</button>
                  <span className="text-sm text-gray-500 py-2">Page {page} of {meta.pages}</span>
                  <button onClick={() => setPage(p => p + 1)} disabled={page >= meta.pages} className="btn-secondary text-sm">Next →</button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ---------------- APPEALS TAB ---------------- */}
      {tab === 'appeals' && (
        <div className="space-y-3">
          {appeals.appeals.length === 0 ? (
            <div className="text-center py-16 text-gray-400">No appeals</div>
          ) : appeals.appeals.map((a) => (
            <div key={a._id} className="card">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-medium">{a.worker?.user?.name || 'Worker'}</p>
                  <p className="text-xs text-gray-500">Booking {a.booking?.bookingNumber || 'N/A'} • {new Date(a.createdAt).toLocaleString()}</p>
                </div>
                <span className={`badge ${
                  a.status === 'PENDING' ? 'badge-warning' : a.status === 'APPROVED' ? 'badge-success' : 'badge-danger'
                }`}>{a.status}</span>
              </div>
              <p className="text-sm text-gray-700"><b>Reason:</b> {a.reason}</p>
              {a.explanation && <p className="text-sm text-gray-500 mt-1">{a.explanation}</p>}
              {a.status === 'PENDING' && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => decideAppeal(a, 'APPROVE')} className="btn-success text-sm">✓ Approve</button>
                  <button onClick={() => decideAppeal(a, 'REJECT')} className="btn-danger text-sm">✕ Reject</button>
                </div>
              )}
              {a.decisionNote && <p className="text-xs text-gray-400 mt-2">Admin note: {a.decisionNote}</p>}
            </div>
          ))}
        </div>
      )}

      {/* ---------------- SETTINGS TAB ---------------- */}
      {tab === 'settings' && settings && (
        <div className="max-w-2xl card space-y-4">
          <h3 className="font-semibold">Points & Penalties</h3>
          <div className="grid grid-cols-2 gap-4">
            {[
              ['noShow', 'No-show penalty'],
              ['repeatedNoShowExtra', 'Repeated no-show extra'],
              ['lateArrival', 'Late arrival'],
              ['cancelAfterAccept', 'Cancel after accept'],
              ['completeJob', 'Job completion'],
              ['onTime', 'On-time completion'],
              ['goodRating', 'Good rating'],
              ['collaboration', 'Collaboration'],
            ].map(([key, label]) => (
              <div key={key}>
                <label className="label-text">{label}</label>
                <input
                  type="number"
                  className="input-field"
                  value={settings.points?.[key]}
                  onChange={(e) => setSettings({ ...settings, points: { ...settings.points, [key]: e.target.value } })}
                />
              </div>
            ))}
          </div>
          <h3 className="font-semibold pt-2">Enforcement (minutes / attempts)</h3>
          <div className="grid grid-cols-2 gap-4">
            {[
              ['noShowGraceMinutes', 'No-show grace'],
              ['jobExpiryGraceMinutes', 'Job expiry grace'],
              ['lateToleranceMinutes', 'Late tolerance'],
              ['reminderLeadMinutes', 'Reminder lead'],
              ['maxReassignmentAttempts', 'Max reassign attempts'],
            ].map(([key, label]) => (
              <div key={key}>
                <label className="label-text">{label}</label>
                <input
                  type="number"
                  className="input-field"
                  value={settings[key]}
                  onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <button onClick={saveSettings} className="btn-primary">Save Settings</button>
        </div>
      )}

      {/* ---------------- DETAIL MODAL ---------------- */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-gray-900">{detail.worker?.user?.name}</h3>
                <p className="text-xs text-gray-500">{detail.worker?.user?.email}</p>
              </div>
              <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-xl text-center">
                  <p className="text-3xl font-black text-brand-600">{detail.reliability?.score}</p>
                  <p className="text-xs text-gray-500">Reliability score</p>
                  <p className={`badge mt-2 ${LEVEL_COLOR[detail.reliability?.level] || 'badge-gray'}`}>{detail.reliability?.level}</p>
                  <p className="text-xs text-gray-500 mt-1">{STATUS_LABEL[detail.worker?.accountStatus]}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-sm font-medium">Counters</p>
                  <p className="text-xs text-gray-600">No-shows: {detail.reliability?.noShowCount || 0}</p>
                  <p className="text-xs text-gray-600">Late: {detail.reliability?.lateCount || 0}</p>
                  <p className="text-xs text-gray-600">Cancelled after accept: {detail.reliability?.cancelledAfterAcceptCount || 0}</p>
                  <p className="text-xs text-gray-600">Completed: {detail.reliability?.completedCount || 0}</p>
                  <p className="text-xs text-gray-600 mt-1">Active bookings: {detail.stats?.activeBookings} • Failed: {detail.stats?.failedBookings}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button onClick={() => setModal({ type: 'adjust', worker: detail.worker })} className="btn-primary text-sm">Adjust Score</button>
                <button onClick={() => setModal({ type: 'suspend', worker: detail.worker })} className="btn-danger text-sm">Suspend</button>
                <button onClick={() => setModal({ type: 'reactivate', worker: detail.worker })} className="btn-success text-sm">Reactivate</button>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Recent Events</h4>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {(detail.events || []).length === 0 && <p className="text-sm text-gray-400">No events yet</p>}
                  {detail.events.map((ev) => (
                    <div key={ev._id} className="flex items-center justify-between text-xs bg-gray-50 rounded px-2 py-1">
                      <span className="text-gray-600">{ev.eventType} — {ev.reason}</span>
                      <span className={`font-medium ${ev.points >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {ev.points >= 0 ? '+' : ''}{ev.points} ({ev.previousScore ?? '—'} → {ev.newScore ?? '—'})
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Appeals</h4>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {(detail.appeals || []).length === 0 && <p className="text-sm text-gray-400">No appeals</p>}
                  {detail.appeals.map((a) => (
                    <div key={a._id} className="text-xs bg-gray-50 rounded px-2 py-1">
                      <span className="text-gray-600">{a.reason}</span>
                      <span className={`badge ml-2 ${a.status === 'PENDING' ? 'badge-warning' : a.status === 'APPROVED' ? 'badge-success' : 'badge-danger'}`}>{a.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- ACTION MODALS ---------------- */}
      {modal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">
                {modal.type === 'adjust' ? 'Adjust Reliability Score' : modal.type === 'suspend' ? 'Suspend from Earning' : 'Reactivate Account'}
              </h3>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-6 space-y-4">
              {modal.type === 'adjust' && (
                <>
                  <div>
                    <label className="label-text">Points change</label>
                    <input type="number" className="input-field" value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })} />
                    <p className="text-xs text-gray-400 mt-1">Negative penalises, positive rewards.</p>
                  </div>
                  <div>
                    <label className="label-text">Reason *</label>
                    <input className="input-field" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Repeated no-show, exceptional service…" />
                  </div>
                  <div>
                    <label className="label-text">Admin note</label>
                    <input className="input-field" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                  </div>
                </>
              )}
              {modal.type === 'suspend' && (
                <>
                  <div>
                    <label className="label-text">Suspension type</label>
                    <select className="input-field" value={form.accountStatus} onChange={(e) => setForm({ ...form, accountStatus: e.target.value })}>
                      <option value="TEMPORARILY_SUSPENDED">Temporarily suspended</option>
                      <option value="DEACTIVATION_REVIEW">Deactivation review</option>
                    </select>
                  </div>
                  {form.accountStatus === 'TEMPORARILY_SUSPENDED' && (
                    <div>
                      <label className="label-text">Duration (days)</label>
                      <input type="number" className="input-field" value={form.durationDays} onChange={(e) => setForm({ ...form, durationDays: e.target.value })} />
                    </div>
                  )}
                  <div>
                    <label className="label-text">Reason *</label>
                    <input className="input-field" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
                  </div>
                </>
              )}
              {modal.type === 'reactivate' && (
                <div>
                  <p className="text-sm text-gray-600 mb-3">Re-enable earning for this worker. The score is unchanged (use Adjust Score if a penalty should be reversed).</p>
                  <label className="label-text">Reason</label>
                  <input className="input-field" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button onClick={() => setModal(null)} className="btn-secondary text-sm">Cancel</button>
                {modal.type === 'adjust' && <button onClick={submitAdjust} className="btn-primary text-sm">Apply</button>}
                {modal.type === 'suspend' && <button onClick={submitSuspend} className="btn-danger text-sm">Suspend</button>}
                {modal.type === 'reactivate' && <button onClick={submitReactivate} className="btn-success text-sm">Reactivate</button>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}