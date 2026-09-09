/**
 * Seed Database Script
 *
 * Populates the local MongoDB with demo data for SIH 2026 demo:
 *  - 1 admin
 *  - 10 customers
 *  - 20 workers
 *  - Multiple services, skills
 *  - 50+ historical bookings
 *  - Reviews, payments, complaints
 *  - Demand records & worker locations
 *
 * Run: npm run seed
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

require('dotenv').config();
const { mongoURI } = require('../config/env');

const User = require('../models/User');
const Worker = require('../models/WorkerProfile');
const Customer = require('../models/CustomerProfile');
const Service = require('../models/Service');
const Skill = require('../models/Skill');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const Invoice = require('../models/Invoice');
const Review = require('../models/Review');
const Complaint = require('../models/Complaint');
const Notification = require('../models/Notification');
const Certificate = require('../models/Certificate');
const Cooperative = require('../models/Cooperative');
const DemandRecord = require('../models/DemandRecord');

const SERVICE_CATEGORIES = [
  'Plumbing',
  'Electrical',
  'Carpentry',
  'Painting',
  'Cleaning',
  'Gardening',
  'Driving',
  'Appliance Repair',
  'Domestic Help',
  'Caregiving',
  'Other community services',
];

// Sample data
const SERVICES = [
  { name: 'Pipe Leak Repair', category: 'Plumbing', basePrice: 400, duration: 60, skills: ['Plumbing'], emergency: true },
  { name: 'Tap Installation', category: 'Plumbing', basePrice: 350, duration: 45, skills: ['Plumbing'], emergency: false },
  { name: 'Toilet Repair', category: 'Plumbing', basePrice: 500, duration: 90, skills: ['Plumbing'], emergency: true },
  { name: 'Electrical Wiring', category: 'Electrical', basePrice: 600, duration: 120, skills: ['Electrical'], emergency: true },
  { name: 'Fan/Appliance Fix', category: 'Electrical', basePrice: 350, duration: 60, skills: ['Electrical'], emergency: false },
  { name: 'Switch & Socket Repair', category: 'Electrical', basePrice: 300, duration: 45, skills: ['Electrical'], emergency: true },
  { name: 'Furniture Assembly', category: 'Carpentry', basePrice: 500, duration: 120, skills: ['Carpentry'], emergency: false },
  { name: 'Cabinet Repair', category: 'Carpentry', basePrice: 450, duration: 90, skills: ['Carpentry'], emergency: false },
  { name: 'Wall Painting', category: 'Painting', basePrice: 800, duration: 240, skills: ['Painting'], emergency: false },
  { name: 'Deep House Cleaning', category: 'Cleaning', basePrice: 600, duration: 180, skills: ['Cleaning'], emergency: false },
  { name: 'Garden Maintenance', category: 'Gardening', basePrice: 400, duration: 120, skills: ['Gardening'], emergency: false },
  { name: 'Home Shifting / Driving', category: 'Driving', basePrice: 700, duration: 180, skills: ['Driving'], emergency: false },
  { name: 'Washing Machine Repair', category: 'Appliance Repair', basePrice: 500, duration: 90, skills: ['Appliance Repair'], emergency: false },
  { name: 'Refrigerator Repair', category: 'Appliance Repair', basePrice: 600, duration: 90, skills: ['Appliance Repair'], emergency: false },
  { name: 'AC Repair', category: 'Appliance Repair', basePrice: 800, duration: 120, skills: ['Appliance Repair'], emergency: true },
  { name: 'Domestic Helper Service', category: 'Domestic Help', basePrice: 300, duration: 120, skills: ['Domestic Help', 'Cleaning'], emergency: false },
  { name: 'Elderly Care (Day)', category: 'Caregiving', basePrice: 500, duration: 300, skills: ['Caregiving'], emergency: false },
  { name: 'Child Care', category: 'Caregiving', basePrice: 400, duration: 240, skills: ['Caregiving'], emergency: false },
  { name: 'Community Event Support', category: 'Other community services', basePrice: 300, duration: 180, skills: ['Other community services'], emergency: false },
];

const SKILL_NAMES = [
  'Plumbing', 'Electrical Wiring', 'Carpentry', 'Painting', 'Cleaning',
  'Gardening', 'Driving', 'Appliance Repair', 'Domestic Help', 'Caregiving',
  'Basic Plumbing', 'Advanced Electrical', 'CCTV Installation', 'Solar Panel Installation',
  'AC Repair', 'HVAC Technician', 'Refrigerator Repair', 'Washing Machine Repair',
];

const ADMIN = {
  name: 'Coop Admin',
  email: 'admin@coop.in',
  phone: '9100000000',
  password: 'Admin@123',
};

const CUSTOMER_NAMES = [
  'Rahul Sharma', 'Priya Patel', 'Amit Verma', 'Sunita Reddy', 'Vikram Singh',
  'Neha Gupta', 'Rajesh Kumar', 'Anita Desai', 'Karan Mehta', 'Divya Rani',
];

const CUSTOMER_EMAILS = [
  'customer1@test.com', 'customer2@test.com', 'customer3@test.com', 'customer4@test.com', 'customer5@test.com',
  'customer6@test.com', 'customer7@test.com', 'customer8@test.com', 'customer9@test.com', 'customer10@test.com',
];

const WORKER_NAMES = [
  'Mohammed Ali', 'Suresh Rao', 'Ramesh Kumar', 'Gopal Reddy', 'Hari Krishna',
  'Arun Singh', 'Joseph Fernandes', 'David Sujith', 'Vijay Kumar', 'Shankar Pillai',
  'Ravi Teja', 'Mahesh Patel', 'Sunil Yadav', 'Santosh Kumar', 'Prakash Rao',
  'Manoj Verma', 'Deepak Sharma', 'Arjun Nair', 'Nikhil Joshi', 'Pradeep Menon',
];

const WORKER_EMAILS = [
  'worker1@test.com', 'worker2@test.com', 'worker3@test.com', 'worker4@test.com', 'worker5@test.com',
  'worker6@test.com', 'worker7@test.com', 'worker8@test.com', 'worker9@test.com', 'worker10@test.com',
  'worker11@test.com', 'worker12@test.com', 'worker13@test.com', 'worker14@test.com', 'worker15@test.com',
  'worker16@test.com', 'worker17@test.com', 'worker18@test.com', 'worker19@test.com', 'worker20@test.com',
];

// Hyderabad-ish coordinates for variety
const LOCATIONS = [
  { lat: 17.3850, lng: 78.4867, city: 'Hyderabad', area: 'Kukatpally', zone: 'Zone A' },
  { lat: 17.4381, lng: 78.3937, city: 'Hyderabad', area: 'Madhapur', zone: 'Zone B' },
  { lat: 17.4435, lng: 78.4063, city: 'Hyderabad', area: 'HITEC City', zone: 'Zone B' },
  { lat: 17.3606, lng: 78.4750, city: 'Hyderabad', area: 'Gachibowli', zone: 'Zone C' },
  { lat: 17.4127, lng: 78.4364, city: 'Hyderabad', area: 'Ameerpet', zone: 'Zone A' },
  { lat: 17.4121, lng: 78.5426, city: 'Hyderabad', area: 'Secunderabad', zone: 'Zone D' },
  { lat: 17.3668, lng: 78.5524, city: 'Hyderabad', area: 'Banjara Hills', zone: 'Zone C' },
  { lat: 17.3974, lng: 78.4478, city: 'Hyderabad', area: 'Somajiguda', zone: 'Zone A' },
  { lat: 17.3382, lng: 78.3944, city: 'Hyderabad', area: 'Madhura Nagar', zone: 'Zone B' },
];

const SEED = async () => {
  try {
    // Connect
    await mongoose.connect(mongoURI);
    console.log('Connected to MongoDB...');

    // Clean databases (careful: only seed tables)
    console.log('Clearing existing seed data...');
    await Promise.all([
      User.deleteMany({}),
      Worker.deleteMany({}),
      Customer.deleteMany({}),
      Service.deleteMany({}),
      Skill.deleteMany({}),
      Booking.deleteMany({}),
      Payment.deleteMany({}),
      Invoice.deleteMany({}),
      Review.deleteMany({}),
      Complaint.deleteMany({}),
      Notification.deleteMany({}),
      Certificate.deleteMany({}),
      Cooperative.deleteMany({}),
      DemandRecord.deleteMany({}),
    ]);

    console.log('✓ Cleared old data');

    // ===== Create skills =====
    const skills = [];
    for (const name of SKILL_NAMES) {
      const skill = await Skill.create({
        name,
        category: name,
        description: `${name} service skill`,
        isActive: true,
      });
      skills.push(skill);
    }
    console.log(`✓ Created ${skills.length} skills`);

    // ===== Create services =====
    const services = [];
    for (const s of SERVICES) {
      const service = await Service.create({
        name: s.name,
        description: `${s.category} service provided by verified skilled workers from our cooperative.`,
        category: s.category,
        basePrice: s.basePrice,
        estimatedDuration: s.duration,
        requiredSkills: s.skills,
        emergencyAvailable: s.emergency,
        isActive: true,
      });
      // Resolve canonical skill _ids used for the strict skill matching gate.
      const { syncServiceSkillRefs } = require('./skillUtils');
      await syncServiceSkillRefs(service);
      await service.save();
      services.push(service);
    }
    console.log(`✓ Created ${services.length} services`);

    // ===== Create admin =====
    const admin = await User.create({
      name: ADMIN.name,
      email: ADMIN.email,
      phone: ADMIN.phone,
      password: ADMIN.password,
      role: 'admin',
      languages: ['English', 'Hindi', 'Telugu'],
    });
    console.log('✓ Created admin:', ADMIN.email);

    // ===== Create cooperative settings =====
    await Cooperative.create({
      name: 'Aman Seva Cooperative Ltd.',
      platformFeePercent: 5,
      cooperativeContributionPercent: 2,
      gstPercent: 0,
      address: '123 Co-op Building, Kukatpally, Hyderabad',
      contactEmail: 'support@amanseva.coop',
      contactPhone: '1800-COOP-SEV',
      emergencyHelpline: '9000000001',
      allocationWeights: {
        skill: 30,
        distance: 20,
        availability: 15,
        rating: 15,
        experience: 10,
        workload: 10,
      },
    });
    console.log('✓ Created cooperative settings');

    // ===== Create customers =====
    const customers = [];
    for (let i = 0; i < CUSTOMER_NAMES.length; i++) {
      const user = await User.create({
        name: CUSTOMER_NAMES[i],
        email: CUSTOMER_EMAILS[i],
        phone: `9100000${String(i + 1).padStart(3, '0')}`,
        password: 'Pass@123',
        role: 'customer',
        languages: i % 2 === 0 ? ['English', 'Hindi'] : ['English', 'Telugu', 'Hindi'],
      });

      const loc = LOCATIONS[i % LOCATIONS.length];
      const customer = await Customer.create({
        user: user._id,
        address: `${i + 1}, ${loc.area}, ${loc.city}`,
        location: { type: 'Point', coordinates: [loc.lng, loc.lat] },
        city: loc.city,
        preferredLanguages: user.languages,
        bookingsCount: 0,
        totalSpent: 0,
      });

      customers.push({ user, profile: customer, loc });
    }
    console.log(`✓ Created ${customers.length} customers`);

    // ===== Create workers =====
    const workers = [];
    const workerUsers = [];
    for (let i = 0; i < WORKER_NAMES.length; i++) {
      const user = await User.create({
        name: WORKER_NAMES[i],
        email: WORKER_EMAILS[i],
        phone: `9200${String(i + 1).padStart(5, '0')}`,
        password: 'Pass@123',
        role: 'worker',
        languages: ['English', 'Hindi', 'Telugu'],
      });
      workerUsers.push(user);

      const loc = LOCATIONS[i % LOCATIONS.length];

      // Assign skills (rotate through categories)
      const workerSkills = [];
      const catIndex = i % SERVICE_CATEGORIES.length;
      const skillMapping = {
        'Plumbing': ['Basic Plumbing', 'Plumbing'],
        'Electrical': ['Electrical Wiring', 'Advanced Electrical'],
        'Carpentry': ['Carpentry'],
        'Painting': ['Painting'],
        'Cleaning': ['Cleaning', 'Domestic Help'],
        'Gardening': ['Gardening'],
        'Driving': ['Driving'],
        'Appliance Repair': ['Appliance Repair'],
        'Domestic Help': ['Domestic Help', 'Cleaning'],
        'Caregiving': ['Caregiving'],
        'Other community services': ['Cleaning', 'Gardening'],
      };
      const skillNamesForCat = skillMapping[SERVICE_CATEGORIES[catIndex]] || ['Cleaning'];

      skillNamesForCat.forEach((skillName) => {
        const skill = skills.find((sk) => sk.name === skillName);
        if (skill) {
          workerSkills.push({
            skill: skill._id,
            name: skillName,
            verified: true, // seeded skills start verified
            verifiedAt: new Date(),
            yearsOfExperience: (i % 15) + 1,
          });
        }
      });

      // Add secondary skill sometimes
      if (i % 3 === 0) {
        const secondarySkill = skills[(catIndex + 2) % skills.length];
        workerSkills.push({
          skill: secondarySkill._id,
          name: secondarySkill.name,
          verified: true,
          verifiedAt: new Date(),
          yearsOfExperience: (i % 5) + 1,
        });
      }

      const worker = await Worker.create({
        user: user._id,
        bio: `Experienced ${SERVICE_CATEGORIES[catIndex].toLowerCase()} worker with ${(i % 15) + 1} years of experience.`,
        location: { type: 'Point', coordinates: [loc.lng, loc.lat] },
        address: `${i + 1}, Worker Colony, ${loc.area}`,
        area: loc.area,
        city: loc.city,
        skills: workerSkills,
        experienceYears: (i % 15) + 1,
        languages: ['English', 'Hindi', 'Telugu'],
        serviceAreaRadiusKm: 15 + (i % 10),
        verificationStatus: i < 15 ? 'VERIFIED' : i === 17 ? 'PENDING' : i === 18 ? 'REJECTED' : 'VERIFIED',
        rating: i % 5 === 0 ? 4.8 : Math.min(5, Number((3.8 + (i % 14) / 10).toFixed(2))),
        ratingCount: 5 + (i * 2),
        completedJobs: i * 3 + 2,
        totalEarnings: (i * 5000) + 10000,
        insuranceActive: i % 3 === 0,
        welfareEnrolled: true,
        isActive: true,
        joinedDate: new Date(Date.now() - (i + 1) * 30 * 24 * 60 * 60 * 1000),
      });

      workers.push({ user, profile: worker, loc });
    }
    console.log(`✓ Created ${workers.length} workers`);

    // ===== Create certificates =====
    for (let i = 0; i < workers.length; i++) {
      const worker = workers[i];
      const cert = await Certificate.create({
        worker: worker.profile._id,
        title: `${worker.profile.skills[0]?.name || 'Skill'} Certification`,
        issuingAuthority: 'Aman Seva Cooperative',
        issueDate: new Date(),
        fileUrl: `/uploads/certificate-${i}.pdf`,
        status: i < 15 ? 'APPROVED' : i === 18 ? 'REJECTED' : 'PENDING',
      });
      worker.profile.certificates.push(cert._id);
      await worker.profile.save();
    }
    console.log('✓ Created certificates');

    // ===== Create bookings (historical + active) =====
    const bookings = [];
    const now = new Date();

    // Predefined statuses cycle for good demo data
    for (let i = 0; i < 60; i++) {
      const wi = workers[i % workers.length];
      const ci = customers[i % customers.length];
      const si = services[i % services.length];
      const loc = ci.loc;

      // Determine status based on index: mix of states
      let status;
      let completedAt;
      let requestedDate;
      const offsetDays = i % 12;

      if (i < 40) {
        // Historical completed
        status = 'COMPLETED';
        requestedDate = new Date(now.getTime() - (offsetDays + 2) * 24 * 60 * 60 * 1000);
        completedAt = new Date(requestedDate.getTime() + 3 * 60 * 60 * 1000);
      } else if (i < 45) {
        // In progress / active
        status = ['ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'STARTED'][i % 4];
        requestedDate = new Date(now.getTime() + (i % 3) * 60 * 60 * 1000);
      } else if (i < 50) {
        // Matching - awaiting worker
        status = 'MATCHING';
        requestedDate = new Date(now.getTime() + (i % 2) * 60 * 60 * 1000);
      } else if (i < 55) {
        // Cancelled
        status = 'CANCELLED';
        requestedDate = new Date(now.getTime() - offsetDays * 24 * 60 * 60 * 1000);
      } else {
        // Disputed / pending
        status = i % 2 === 0 ? 'DISPUTED' : 'REQUESTED';
        requestedDate = new Date(now.getTime() - offsetDays * 24 * 60 * 60 * 1000);
      }

      const labour = services[i % services.length].basePrice;
      const coopContribution = labour * 0.02;
      const platformFee = labour * 0.05;
      const total = Math.round((labour + coopContribution + platformFee) * 100) / 100;

      // Create booking
      const booking = await Booking.create({
        customer: ci.user._id,
        worker: status === 'CANCELLED' || status === 'MATCHING' || status === 'REQUESTED' ? undefined : wi.profile._id,
        service: si._id,
        serviceSnapshot: {
          name: si.name,
          category: si.category,
          basePrice: labour,
          unit: 'per visit',
        },
        requiredSkillIds: si.requiredSkillRefs || [],
        requiredSkillNames: si.requiredSkills || [],
        description: `Need ${si.name.toLowerCase()} service at my place`,
        problemImages: [],
        location: { type: 'Point', coordinates: [loc.lng, loc.lat] },
        address: ci.profile.address,
        area: loc.area,
        city: loc.city,
        requestedDate,
        timeSlot: ['Morning', 'Afternoon', 'Evening'][i % 3],
        isEmergency: i % 12 === 0, // some emergencies
        status,
        priceBreakdown: {
          labour,
          materials: 100,
          cooperativeContribution: coopContribution,
          platformFee: platformFee,
          total,
        },
        matchedScore: 85 + (i % 10),
        matchReasons: ['Good skill match', 'Close distance', 'Available'],
        candidateWorkers: [
          { worker: wi.profile._id, score: 90, reasons: ['Top skill', 'Nearby'] },
        ],
        statusHistory: [
          {
            status: 'REQUESTED',
            updatedAt: new Date(requestedDate.getTime() - 60 * 60 * 1000),
            note: 'Request created',
          },
          {
            status: status !== 'REQUESTED' ? status : 'REQUESTED',
            updatedAt: new Date(),
            note: 'Status updated',
          },
        ],
        customerConfirmed: status === 'COMPLETED',
        completedAt: status === 'COMPLETED' ? completedAt : undefined,
        createdAt: requestedDate,
      });

      bookings.push(booking);

      // Create payment for completed, cancelled (refunded), disputed
      if (status === 'COMPLETED') {
        const payment = await Payment.create({
          booking: booking._id,
          customer: ci.user._id,
          worker: wi.profile._id,
          amount: total,
          labourAmount: labour,
          materialsAmount: 100,
          cooperativeContribution: coopContribution,
          platformFee: platformFee,
          method: i % 3 === 0 ? 'UPI' : 'CASH',
          gateway: 'mock',
          transactionId: `TXN-${Date.now()}-${i}`,
          status: 'SUCCESS',
          paymentDate: completedAt,
          workerGross: labour,
          cooperativeDeduction: coopContribution,
          workerNetEarnings: labour - coopContribution,
        });

        // Link payment
        booking.payment = payment._id;
        await booking.save();

        // Create invoice
        await Invoice.create({
          invoiceNumber: `INV-2026-${1000 + i}`,
          booking: booking._id,
          customer: ci.user._id,
          worker: wi.profile._id,
          service: si.name,
          serviceDate: completedAt,
          issuedDate: completedAt,
          labourCost: labour,
          materials: 100,
          cooperativeContribution: coopContribution,
          fees: platformFee,
          total,
          paymentStatus: 'PAID',
          payment: payment._id,
        });
      } else if (status === 'CANCELLED') {
        // Create a refunded payment
        await Payment.create({
          booking: booking._id,
          customer: ci.user._id,
          worker: wi.profile._id,
          amount: total,
          labourAmount: labour,
          materialsAmount: 100,
          cooperativeContribution: coopContribution,
          platformFee: platformFee,
          method: 'UPI',
          gateway: 'mock',
          transactionId: `TXN-REFUND-${Date.now()}-${i}`,
          status: 'REFUNDED',
          paymentDate: new Date(),
          workerGross: labour,
          cooperativeDeduction: 0,
          workerNetEarnings: 0,
        });
        // No invoice for cancelled
      }
    }
    console.log(`✓ Created ${bookings.length} bookings`);

    // ===== Create reviews =====
    for (let i = 0; i < 40; i++) {
      const booking = bookings[i];
      const wi = workers[i % workers.length];
      if (booking.status === 'COMPLETED') {
        try {
          await Review.create({
            booking: booking._id,
            reviewer: booking.customer,
            reviewee: wi.user._id,
            reviewType: 'CUSTOMER_TO_WORKER',
            overallQuality: 4 + (i % 2), // 4-5 stars
            punctuality: 3 + (i % 3),
            behaviour: 4 + (i % 2 == 0 ? 1 : 0),
            pricing: 4,
            comment: ['Great work!', 'Very professional.', 'Punctual and skilled.', 'Happy with the service.', 'Good quality work.', 'Will recommend.'][i % 6],
          });

          // Worker to customer review
          await Review.create({
            booking: booking._id,
            reviewer: wi.user._id,
            reviewee: booking.customer,
            reviewType: 'WORKER_TO_CUSTOMER',
            customerBehaviour: 4,
            customerAccessibility: 4,
            customerPaymentReliability: 5,
            comment: 'Cooperative customer.',
          });
        } catch (e) {
          // Skip duplicate
        }
      }
    }
    console.log('✓ Created reviews');

    // ===== Create complaints =====
    for (let i = 0; i < 8; i++) {
      const booking = bookings[i + 55] || bookings[i];
      await Complaint.create({
        customer: booking.customer,
        worker: booking.worker,
        booking: booking._id,
        category: ['SERVICE_QUALITY', 'LATE_ARRIVAL', 'PRICING', 'PAYMENT_ISSUE', 'OTHER'][i % 5],
        description: `Complaint about ${booking.serviceSnapshot.name} service. Description placeholder #${i + 1}`,
        status: i < 4 ? ['OPEN', 'UNDER_REVIEW'][i % 2] : 'RESOLVED',
        priority: i % 3 === 0 ? 'HIGH' : 'MEDIUM',
        resolution: i >= 4 ? 'Issue resolved to customer satisfaction' : '',
      });
    }
    console.log('✓ Created complaints');

    // ===== Create demand records =====
    for (let d = 1; d <= 14; d++) {
      for (let s = 0; s < services.length; s += 2) {
        const loc = LOCATIONS[s % LOCATIONS.length];
        const count = 2 + ((s * d) % 10);
        await DemandRecord.create({
          date: new Date(now.getTime() - d * 24 * 60 * 60 * 1000),
          service: services[s]._id,
          serviceName: services[s].name,
          category: services[s].category,
          zone: loc.zone,
          area: loc.area,
          location: { type: 'Point', coordinates: [loc.lng, loc.lat] },
          requestCount: count,
          completedCount: Math.floor(count * 0.8),
          emergencyCount: s % 3 === 0 ? 1 : 0,
          revenue: count * services[s].basePrice,
        });
      }
    }
    console.log('✓ Created demand records');

    // ===== Notifications =====
    await Notification.create({
      user: admin._id,
      type: 'SYSTEM',
      title: 'Database seeded',
      message: 'Demo data successfully seeded. Welcome to Aman Seva Cooperative Gig Platform!',
    });
    await Notification.create({
      user: workers[0].user._id,
      type: 'NEW_JOB',
      title: 'Welcome!',
      message: 'You have new job requests waiting. Complete your profile for better matching.',
    });

    console.log('✓ Seed complete!');
    console.log('\n═════════════════════════════════════════');
    console.log('LOGIN CREDENTIALS:');
    console.log('Admin:    admin@coop.in / Admin@123');
    console.log('Customer: customer1@test.com / Pass@123');
    console.log('Worker:   worker1@test.com / Pass@123');
    console.log('═════════════════════════════════════════\n');
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
    process.exit(0);
  }
};

// Run seed
SEED();