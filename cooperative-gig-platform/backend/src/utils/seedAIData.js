/**
 * seedAIData.js
 *
 * NON-DESTRUCTIVE historical-data loader for the AI module.
 * It only touches records it creates itself (description prefixed "Historical:") —
 * your real users, bookings, teams and requests are never modified or removed.
 *
 *   node src/utils/seedAIData.js
 *
 * The generated demand follows realistic patterns (weekend home services,
 * weekday repairs, ~12% emergencies, ~15% jobs needing a helper). Those
 * patterns are the HISTORICAL DATA; the trained ML models are what infer them.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Service = require('../models/Service');
const User = require('../models/User');
const Worker = require('../models/WorkerProfile');
const CollaborationRequest = require('../models/CollaborationRequest');
const Review = require('../models/Review');
const Complaint = require('../models/Complaint');

const AREAS = [
  { city: 'Hyderabad', area: 'Kukatpally', coords: [78.4118, 17.4849] },
  { city: 'Hyderabad', area: 'KPHB', coords: [78.3989, 17.4932] },
  { city: 'Hyderabad', area: 'Gachibowli', coords: [78.3535, 17.4401] },
  { city: 'Hyderabad', area: 'Banjara Hills', coords: [78.4322, 17.4149] },
  { city: 'Hyderabad', area: 'Madhapur', coords: [78.3965, 17.4489] },
  { city: 'Kolkata', area: 'Salt Lake', coords: [88.4091, 22.5873] },
  { city: 'Kolkata', area: 'Behala', coords: [88.3133, 22.5029] },
  { city: 'Kolkata', area: 'Howrah', coords: [88.2636, 22.5958] },
  { city: 'Kolkata', area: 'Tangra', coords: [88.3924, 22.5606] },
];

const WEEKLY_PROFILE = {
  'Plumbing': [0.8, 1.2, 1.2, 1.1, 1.1, 1.2, 1.0],
  'Electrical': [0.7, 1.2, 1.2, 1.1, 1.2, 1.1, 1.0],
  'Carpentry': [0.6, 1.1, 1.1, 1.3, 1.2, 1.0, 0.9],
  'Painting': [1.4, 0.8, 0.8, 0.9, 1.0, 1.1, 1.3],
  'Cleaning': [1.5, 0.8, 0.8, 0.9, 0.9, 1.0, 1.4],
  'Gardening': [1.6, 0.7, 0.8, 0.8, 0.9, 1.0, 1.5],
  'Appliance Repair': [0.6, 1.2, 1.3, 1.2, 1.2, 1.1, 0.9],
  'Domestic Help': [1.1, 1.0, 1.0, 1.0, 1.0, 1.1, 1.2],
  'Caregiving': [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.1],
  'Driving': [0.9, 1.1, 1.1, 1.1, 1.1, 1.1, 1.0],
};

const TIME_SLOTS = ['Morning', 'Afternoon (12PM-4PM)', 'Evening (4PM-8PM)'];
const MARKER = 'Historical:';
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const cleanupOwn = async (Booking, Review, Complaint, CollaborationRequest) => {
  const own = await Booking.find({ description: { $regex: `^${MARKER}` } }).select('_id').lean();
  const ids = own.map((b) => b._id);
  if (!ids.length) return 0;
  await Promise.all([
    Review.deleteMany({ booking: { $in: ids } }),
    Complaint.deleteMany({ booking: { $in: ids } }),
    CollaborationRequest.deleteMany({ booking: { $in: ids } }),
  ]);
  await Booking.deleteMany({ _id: { $in: ids } });
  return ids.length;
};

const main = async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cooperative_gig_platform');

  const services = await Service.find({ isActive: true }).lean();
  const customers = (await User.find({ role: 'customer' }).select('_id').lean()).map((u) => u._id);
  const workers = (await Worker.find({ isActive: true, verificationStatus: 'VERIFIED' }).select('_id user').lean()).filter((w) => w.user);
  if (!services.length || !customers.length || !workers.length) {
    console.log('✗ Need services, customers and verified workers first');
    await mongoose.disconnect();
    return;
  }

  const removed = await cleanupOwn(Booking, Review, Complaint, CollaborationRequest);
  if (removed) console.log(`↻ Removed ${removed} previously generated history records`);

  const stems = { count: 0, collab: 0, emergency: 0, reviews: 0, complaints: 0 };
  const DAY = 24 * 60 * 60 * 1000;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = process.env.AI_SEED_DAYS ? Number(process.env.AI_SEED_DAYS) : 60;
  const targetPerDay = 13;

  for (let d = 1; d <= days; d++) {
    const dayStart = new Date(today.getTime() - d * DAY);
    const dow = dayStart.getDay();
    for (let i = 0; i < targetPerDay; i++) {
      const area = pick(AREAS);
      const service = pick(services);
      const cat = service.category || '';
      const prof = (WEEKLY_PROFILE[cat] || WEEKLY_PROFILE['Cleaning'])[dow];
      if (Math.random() > prof / 1.2) continue;

      const isEmergency = Math.random() < 0.12;
      const worker = pick(workers);
      const createdAt = new Date(dayStart.getTime() + Math.floor(Math.random() * 20) * 3600000);
      const labour = service.basePrice * (0.6 + Math.random() * 0.8);
      const total = Math.round((labour + service.basePrice * 0.3) * 100) / 100;

      // retry on the rare bookingNumber collision
      let booking = null;
      for (let attempt = 0; attempt < 4 && !booking; attempt++) {
        const yymmdd =
          String(createdAt.getFullYear()).slice(-2) +
          String(createdAt.getMonth() + 1).padStart(2, '0') +
          String(createdAt.getDate()).padStart(2, '0');
        try {
          booking = await Booking.create({
            bookingNumber: `BK-${yymmdd}-${Math.floor(100000 + Math.random() * 900000)}`,
            customer: pick(customers),
            worker: worker._id,
            service: service._id,
            serviceSnapshot: { name: service.name, category: cat, basePrice: service.basePrice },
            description: `${MARKER} ${cat} service request in ${area.area}`,
            location: { type: 'Point', coordinates: [area.coords[0] + (Math.random() - 0.5) * 0.02, area.coords[1] + (Math.random() - 0.5) * 0.02] },
            address: `${area.area}, ${area.city}`,
            area: area.area,
            city: area.city,
            requestedDate: createdAt,
            timeSlot: pick(TIME_SLOTS),
            isEmergency,
            status: 'COMPLETED',
            priceBreakdown: { labour: Math.round(labour), materials: Math.round(service.basePrice * 0.3), cooperativeContribution: 0, platformFee: 0, total },
            matchedScore: 80 + Math.floor(Math.random() * 18),
            statusHistory: [
              { status: 'REQUESTED', updatedAt: new Date(createdAt.getTime() - 3600000) },
              { status: 'ASSIGNED', updatedAt: createdAt },
              { status: 'ACCEPTED', updatedAt: createdAt },
              { status: 'ON_THE_WAY', updatedAt: new Date(createdAt.getTime() + 3600000) },
              { status: 'STARTED', updatedAt: new Date(createdAt.getTime() + 2 * 3600000) },
              { status: 'COMPLETED', updatedAt: new Date(createdAt.getTime() + 4 * 3600000) },
            ],
            customerConfirmed: true,
            completedAt: new Date(createdAt.getTime() + 4 * 3600000),
            createdAt,
          });
        } catch (e) {
          if (e.code !== 11000) throw e;
        }
      }
      if (!booking) continue;
      stems.count++;
      if (isEmergency) stems.emergency++;

      // ~15% of jobs needed an extra helper → collaboration training history
      if (Math.random() < 0.15) {
        try {
        const helper = pick(workers);
        const roleMap = { 'Plumbing': 'Plumber', 'Electrical': 'Electrician', 'Carpentry': 'Carpenter', 'Painting': 'Painter', 'Driving': 'Driver' };
        const role = roleMap[cat] || 'Helper';
        await CollaborationRequest.create({
          booking: booking._id,
          leadWorker: worker._id,
          role,
          requiredSkills: [service.name],
          numberOfCollaborators: 1,
          date: createdAt,
          startTime: TIME_SLOTS[0],
          durationHours: 4,
          estimatedPayment: Math.round(total * 0.35),
          status: 'FILLED',
          candidates: [{ worker: helper._id, status: 'ACCEPTED', score: 70 + Math.floor(Math.random() * 25), respondedAt: createdAt }],
          createdAt,
        });
        stems.collab++;
        } catch (e) { if (e.code !== 11000) throw e; }
      }

      // reviews: mostly positive, some negative (matching labels)
      if (Math.random() < 0.6) {
        try {
        const raw = Math.random() < 0.15 ? 2.5 : 4.3;
        const q = Math.round(Math.min(5, Math.max(1, raw + (Math.random() - 0.5))) * 10) / 10;
        await Review.create({
          booking: booking._id,
          reviewer: booking.customer,
          reviewee: worker.user,
          reviewType: 'CUSTOMER_TO_WORKER',
          overallQuality: q,
          punctuality: q,
          behaviour: q,
          pricing: q,
          comment: '',
        });
        stems.reviews++;
        } catch (e) { if (e.code !== 11000) throw e; }
      }

      // a few complaints for negative outcome labels
      if (Math.random() < 0.015) {
        try {
        await Complaint.create({
          booking: booking._id,
          customer: booking.customer,
          worker: worker._id,
          category: 'SERVICE_QUALITY',
          description: 'Historic complaint for AI training',
          priority: 'MEDIUM',
          status: 'RESOLVED',
        });
        stems.complaints++;
        } catch (e) { if (e.code !== 11000) throw e; }
      }
    }
  }

  console.log(`✓ Seeded AI history: ${stems.count} completed bookings, ${stems.emergency} emergency, ${stems.collab} collab history, ${stems.reviews} reviews, ${stems.complaints} complaints`);
  await mongoose.disconnect();
};

main().catch((e) => { console.error(e); process.exit(1); });