import { useEffect, useRef, useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';

export default function WorkerProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef(null);
  const [form, setForm] = useState({
    bio: '', city: '', area: '', address: '', experienceYears: 0, serviceAreaRadiusKm: 15,
  });

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/workers/profile');
        setProfile(res.data);
        setForm({
          bio: res.data.bio || '',
          city: res.data.city || '',
          area: res.data.area || '',
          address: res.data.address || '',
          experienceYears: res.data.experienceYears || 0,
          serviceAreaRadiusKm: res.data.serviceAreaRadiusKm || 15,
        });
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    };
    load();
  }, []);

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      await api.put('/workers/profile', form);
      toast.success('Profile updated!');
    } catch (err) {
      toast.error(err.message || 'Failed');
    }
  };

  const handleAddSkill = async () => {
    const skillName = prompt('Enter skill name:');
    if (!skillName) return;
    try {
      await api.post('/workers/skills', { name: skillName, yearsOfExperience: 1 });
      toast.success('Skill added!');
      const res = await api.get('/workers/profile');
      setProfile(res.data);
    } catch (err) {
      toast.error(err.message || 'Failed');
    }
  };

  const handleUploadClick = () => {
    const title = prompt('Certificate title:');
    if (!title) return;
    fileInputRef.current._title = title;
    fileInputRef.current.click();
  };

  const handleCertificateFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    const title = fileInputRef.current._title || 'Certificate';
    e.target.value = '';
    try {
      const fd = new FormData();
      fd.append('title', title);
      fd.append('issuingAuthority', 'Self-declared');
      if (file) fd.append('file', file);
      await api.post('/workers/certificates', fd);
      toast.success('Certificate uploaded!');
      const res = await api.get('/workers/profile');
      setProfile(res.data);
    } catch (err) {
      toast.error(err.message || 'Failed');
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div></div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h2 className="text-xl font-bold text-gray-900">My Profile</h2>

      {/* Status badge */}
      <div className={`card ${
        profile?.verificationStatus === 'VERIFIED' ? 'bg-green-50 border-green-200' :
        profile?.verificationStatus === 'REJECTED' ? 'bg-red-50 border-red-200' :
        'bg-yellow-50 border-yellow-200'
      }`}>
        <p className="font-medium">
          Status: <span className="font-bold">{profile?.verificationStatus}</span>
          {profile?.verificationStatus === 'VERIFIED' && ' ✅'}
          {profile?.verificationStatus === 'PENDING' && ' ⏳'}
          {profile?.verificationStatus === 'REJECTED' && ' ❌'}
        </p>
        <p className="text-sm text-gray-600 mt-1">Profile completeness affects your matching score</p>
      </div>

      {/* Basic Info */}
      <form onSubmit={handleUpdate} className="card space-y-4">
        <h3 className="font-semibold">Basic Information</h3>
        <div>
          <label className="label-text">Bio</label>
          <textarea className="input-field" rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="Tell customers about your experience..." />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label-text">City</label>
            <input className="input-field" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Hyderabad" />
          </div>
          <div>
            <label className="label-text">Area</label>
            <input className="input-field" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="Kukatpally" />
          </div>
        </div>
        <div>
          <label className="label-text">Address</label>
          <input className="input-field" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Full address" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label-text">Experience (years)</label>
            <input type="number" className="input-field" value={form.experienceYears} onChange={(e) => setForm({ ...form, experienceYears: parseInt(e.target.value) || 0 })} />
          </div>
          <div>
            <label className="label-text">Service radius (km)</label>
            <input type="number" className="input-field" value={form.serviceAreaRadiusKm} onChange={(e) => setForm({ ...form, serviceAreaRadiusKm: parseInt(e.target.value) || 15 })} />
          </div>
        </div>
        <button type="submit" className="btn-primary">Save Profile</button>
      </form>

      {/* Skills */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Skills</h3>
          <button onClick={handleAddSkill} className="btn-primary text-sm">+ Add Skill</button>
        </div>
        {profile?.skills?.length > 0 ? (
          <div className="space-y-2">
            {profile.skills.map((sk, i) => (
              <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                <span className="text-sm font-medium">{sk.name}</span>
                <span className="text-xs text-gray-500">{sk.yearsOfExperience} years</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400 text-sm">No skills added yet</p>
        )}
      </div>

      {/* Certificates */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Certificates</h3>
          <div>
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleCertificateFile} />
            <button onClick={handleUploadClick} className="btn-primary text-sm">+ Upload Certificate</button>
          </div>
        </div>
        {profile?.certificates?.length > 0 ? (
          <div className="space-y-2">
            {profile.certificates.map((cert) => (
              <div key={cert._id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium">{cert.title}</p>
                  <p className="text-xs text-gray-500">{cert.issuingAuthority}</p>
                </div>
                <span className={`badge ${
                  cert.status === 'APPROVED' ? 'badge-success' :
                  cert.status === 'REJECTED' ? 'badge-danger' : 'badge-warning'
                }`}>{cert.status}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400 text-sm">No certificates uploaded</p>
        )}
      </div>
    </div>
  );
}
