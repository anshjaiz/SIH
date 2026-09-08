const Invoice = require('../../models/Invoice');
const Booking = require('../../models/Booking');
const Payment = require('../../models/Payment');
const { asyncHandler, ApiError } = require('../../middleware/errorMiddleware');

// Get invoice by booking id
const getInvoiceByBooking = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const invoice = await Invoice.findOne({ booking: bookingId })
    .populate('customer', 'name email phone')
    .populate('worker', 'verificationStatus completedJobs');

  if (!invoice) throw new ApiError('Invoice not found', 404);

  // Authorization
  const isOwner = invoice.customer._id.toString() === req.user._id.toString();
  if (!isOwner && req.user.role !== 'admin') {
    throw new ApiError('Not authorized', 403);
  }

  res.json({ success: true, data: invoice });
});

// Get customer invoices
const getCustomerInvoices = asyncHandler(async (req, res) => {
  const invoices = await Invoice.find({ customer: req.user._id })
    .sort({ createdAt: -1 });
  res.json({ success: true, data: invoices });
});

module.exports = {
  getInvoiceByBooking,
  getCustomerInvoices,
};
