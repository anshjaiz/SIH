const Complaint = require('../../models/Complaint');
const Booking = require('../../models/Booking');
const Notification = require('../../models/Notification');
const User = require('../../models/User');
const { asyncHandler, ApiError } = require('../../middleware/errorMiddleware');

// Create complaint (customer)
const createComplaint = asyncHandler(async (req, res) => {
  const { bookingId, category, description, images, priority } = req.body;

  if (!description) throw new ApiError('Description is required', 400);

  const complaintData = {
    customer: req.user._id,
    category: category || 'OTHER',
    description,
    images: images || (req.files ? req.files.map((f) => f.path) : []),
    priority: priority || 'MEDIUM',
  };

  if (bookingId) {
    const booking = await Booking.findById(bookingId);
    if (!booking) throw new ApiError('Booking not found', 404);
    if (booking.customer.toString() !== req.user._id.toString()) {
      throw new ApiError('Not authorized for this booking', 403);
    }
    complaintData.booking = bookingId;
    complaintData.worker = booking.worker;
  }

  const complaint = await Complaint.create(complaintData);

  // Notify admins
  const admins = await User.find({ role: 'admin' });
  if (admins.length) {
    await Notification.create(
      admins.map((a) => ({
        user: a._id,
        type: 'NEW_COMPLAINT',
        title: 'New complaint',
        message: `${req.user.name} filed a ${category} complaint: ${description.slice(0, 100)}`,
        data: { complaintId: complaint._id },
      }))
    );
  }

  res.status(201).json({ success: true, message: 'Complaint filed', data: complaint });
});

// Customer's own complaints
const getMyComplaints = asyncHandler(async (req, res) => {
  const complaints = await Complaint.find({ customer: req.user._id })
    .populate('booking', 'bookingNumber serviceSnapshot')
    .sort({ createdAt: -1 });
  res.json({ success: true, data: complaints });
});

// Get complaint by id
const getComplaintById = asyncHandler(async (req, res) => {
  const complaint = await Complaint.findById(req.params.id)
    .populate('customer', 'name email phone')
    .populate('worker', 'verificationStatus')
    .populate('booking', 'bookingNumber serviceSnapshot status');
  if (!complaint) throw new ApiError('Complaint not found', 404);

  const isOwner = complaint.customer.toString() === req.user._id.toString();
  if (!isOwner && req.user.role !== 'admin') {
    throw new ApiError('Not authorized', 403);
  }

  res.json({ success: true, data: complaint });
});

module.exports = {
  createComplaint,
  getMyComplaints,
  getComplaintById,
};
