const Skill = require('../models/Skill');

/**
 * Canonical acceptable-skill mapping per service.
 * A service is delivered by workers who hold ANY of the listed skills
 * (by stable Skill _id). This replaces loose substring matching.
 *
 * This is the MATCHING superset — it deliberately includes allied skills so
 * eligible nearby workers are not excluded (e.g. a CCTV/Solar installer can be
 * matched for a basic electrical job). It is NOT what the job advertises as
 * "required": REQUIRED_SKILLS below is what workers see on the job card.
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

/**
 * What a job ACTUALLY requires — the skills advertised on the worker's job card.
 * Deliberately tight (single core skill per service) so a "Fan/Appliance Fix"
 * never advertises CCTV or Solar Panel installation, which are only MATCHING
 * aliases, not requirements.
 */
const REQUIRED_SKILLS = {
  'Pipe Leak Repair': ['Plumbing'],
  'Tap Installation': ['Plumbing'],
  'Toilet Repair': ['Plumbing'],
  'Electrical Wiring': ['Electrical Wiring'],
  'Fan/Appliance Fix': ['Electrical Wiring'],
  'Switch & Socket Repair': ['Electrical Wiring'],
  'Furniture Assembly': ['Carpentry'],
  'Cabinet Repair': ['Carpentry'],
  'Wall Painting': ['Painting'],
  'Deep House Cleaning': ['Cleaning'],
  'Garden Maintenance': ['Gardening'],
  'Home Shifting / Driving': ['Driving'],
  'Washing Machine Repair': ['Washing Machine Repair'],
  'Refrigerator Repair': ['Refrigerator Repair'],
  'AC Repair': ['AC Repair'],
  'Domestic Helper Service': ['Domestic Help'],
  'Elderly Care (Day)': ['Caregiving'],
  'Child Care': ['Caregiving'],
  'Community Event Support': ['Cleaning', 'Gardening', 'Domestic Help'],
};

const CATEGORY_REQUIRED_SKILLS = {
  Plumbing: ['Plumbing'],
  Electrical: ['Electrical Wiring'],
  Carpentry: ['Carpentry'],
  Painting: ['Painting'],
  Cleaning: ['Cleaning'],
  Gardening: ['Gardening'],
  Driving: ['Driving'],
  'Appliance Repair': ['Appliance Repair'],
  'Domestic Help': ['Domestic Help'],
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
 * The skills a job advertises as REQUIRED on the worker's job card. Uses the
 * tight REQUIRED_SKILLS mapping, never the matching superset. Falls back to the
 * acceptable list only for services we have not mapped yet.
 */
const requiredSkillNamesForService = (service) => {
  if (!service) return [];
  if (REQUIRED_SKILLS[service.name]) return REQUIRED_SKILLS[service.name].slice();
  if (CATEGORY_REQUIRED_SKILLS[service.category]) return CATEGORY_REQUIRED_SKILLS[service.category].slice();
  return serviceSkillNames(service);
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

/**
 * Keep the two different meanings separate:
 *  - requiredSkillRefs = ACCEPTABLE superset (used by the smart matcher so a
 *    worker with an allied skill is not wrongly excluded).
 *  - requiredSkills    = what the job advertises as REQUIRED (single core skill,
 *    shown on the worker's job card).
 */
const syncServiceSkillRefs = async (service) => {
  const acceptNames = serviceSkillNames(service);
  const { ids } = await resolveSkillRefs(acceptNames);
  service.requiredSkillRefs = ids;
  const displayNames = requiredSkillNamesForService(service);
  await resolveSkillRefs(displayNames); // ensure the advertised skills exist too
  service.requiredSkills = displayNames;
  return service;
};

module.exports = {
  ACCEPTABLE_SKILLS,
  CATEGORY_SKILLS,
  REQUIRED_SKILLS,
  CATEGORY_REQUIRED_SKILLS,
  serviceSkillNames,
  requiredSkillNamesForService,
  hasEligibleSkill,
  skillMatchPercent,
  ensureSkillsExist,
  resolveSkillRefs,
  syncServiceSkillRefs,
};