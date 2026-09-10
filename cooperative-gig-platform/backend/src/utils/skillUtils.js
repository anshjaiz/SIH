const Skill = require('../models/Skill');

/**
 * Canonical acceptable-skill mapping per service.
 * A service is delivered by workers who hold ANY of the listed skills
 * (by stable Skill _id). This replaces loose substring matching.
 */
const ACCEPTABLE_SKILLS = {
  'Pipe Leak Repair': ['Plumbing', 'Basic Plumbing'],
  'Tap Installation': ['Plumbing', 'Basic Plumbing'],
  'Toilet Repair': ['Plumbing', 'Basic Plumbing'],
  'Electrical Wiring': ['Electrical Wiring', 'Advanced Electrical', 'CCTV Installation', 'Solar Panel Installation'],
  'Fan/Appliance Fix': ['Electrical Wiring', 'Advanced Electrical', 'CCTV Installation', 'Solar Panel Installation'],
  'Switch & Socket Repair': ['Electrical Wiring', 'Advanced Electrical', 'CCTV Installation', 'Solar Panel Installation'],
  'Furniture Assembly': ['Carpentry'],
  'Cabinet Repair': ['Carpentry'],
  'Wall Painting': ['Painting'],
  'Deep House Cleaning': ['Cleaning', 'Domestic Help'],
  'Garden Maintenance': ['Gardening'],
  'Home Shifting / Driving': ['Driving'],
  'Washing Machine Repair': ['Washing Machine Repair', 'Appliance Repair'],
  'Refrigerator Repair': ['Refrigerator Repair', 'Appliance Repair'],
  'AC Repair': ['AC Repair', 'HVAC Technician', 'Appliance Repair'],
  'Domestic Helper Service': ['Domestic Help', 'Cleaning'],
  'Elderly Care (Day)': ['Caregiving'],
  'Child Care': ['Caregiving'],
  'Community Event Support': ['Cleaning', 'Gardening', 'Domestic Help'],
};

// Category-level fallback for services not listed above.
const CATEGORY_SKILLS = {
  Plumbing: ['Plumbing', 'Basic Plumbing'],
  Electrical: ['Electrical Wiring', 'Advanced Electrical', 'CCTV Installation', 'Solar Panel Installation'],
  Carpentry: ['Carpentry'],
  Painting: ['Painting'],
  Cleaning: ['Cleaning', 'Domestic Help'],
  Gardening: ['Gardening'],
  Driving: ['Driving'],
  'Appliance Repair': ['Appliance Repair'],
  'Domestic Help': ['Domestic Help', 'Cleaning'],
  Caregiving: ['Caregiving'],
  'Other community services': ['Cleaning', 'Gardening', 'Domestic Help'],
};

const serviceSkillNames = (service) => {
  if (!service) return [];
  if (ACCEPTABLE_SKILLS[service.name]) return ACCEPTABLE_SKILLS[service.name].slice();
  if (CATEGORY_SKILLS[service.category]) return CATEGORY_SKILLS[service.category].slice();
  return (service.requiredSkills || []).map((s) => String(s).trim()).filter(Boolean);
};

/**
 * True when the worker holds at least one VERIFIED skill whose _id is among
 * the required skill ids for the job.
 */
const hasEligibleSkill = (worker, requiredSkillIds = []) => {
  const ids = requiredSkillIds.map(String);
  if (ids.length === 0) return true;
  return (worker.skills || []).some(
    (s) => s.verified === true && ids.includes(String(s.skill))
  );
};

/**
 * Skill match percentage (0-100) based only on verified skill _id equality.
 * A worker holding at least one required skill is floored at 40 so that
 * partial coverage of a multi-skill requirement never drops below the
 * matching eligibility threshold (<30). Full coverage = 100.
 */
const skillMatchPercent = (worker, requiredSkillIds = []) => {
  const ids = requiredSkillIds.map(String);
  if (ids.length === 0) return 100;
  const workerIds = (worker.skills || [])
    .filter((s) => s.verified === true)
    .map((s) => String(s.skill));
  if (workerIds.length === 0) return 0;
  const matched = ids.filter((id) => workerIds.includes(id)).length;
  if (matched === 0) return 0;
  return Math.min(100, Math.max(40, Math.round((matched / ids.length) * 100)));
};

/* eslint-disable no-await-in-loop */
const ensureSkillsExist = async (names) => {
  const clean = [...new Set((names || []).map((n) => String(n).trim()).filter(Boolean))];
  const out = [];
  for (const name of clean) {
    if (!name) continue;
    const existing = await Skill.findOne({ name });
    if (existing) {
      out.push(existing);
      continue;
    }
    const created = await Skill.create({
      name,
      category: name,
      description: `${name} service skill`,
      isActive: true,
    });
    out.push(created);
  }
  return out;
};

const resolveSkillRefs = async (names) => {
  const skills = await ensureSkillsExist(names);
  return { ids: skills.map((s) => s._id), names: skills.map((s) => s.name) };
};

const syncServiceSkillRefs = async (service) => {
  const names = serviceSkillNames(service);
  const { ids, names: foundNames } = await resolveSkillRefs(names);
  service.requiredSkillRefs = ids;
  service.requiredSkills = foundNames;
  return service;
};

module.exports = {
  ACCEPTABLE_SKILLS,
  CATEGORY_SKILLS,
  serviceSkillNames,
  hasEligibleSkill,
  skillMatchPercent,
  ensureSkillsExist,
  resolveSkillRefs,
  syncServiceSkillRefs,
};