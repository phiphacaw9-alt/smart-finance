const express = require('express');
const Transaction = require('../models/Transaction');
const { protect } = require('../middleware/auth');

const router = express.Router();

// ─── GET /api/transactions ─── Lấy danh sách giao dịch
router.get('/', protect, async (req, res) => {
  try {
    const { type, category, month, year, limit = 20, page = 1 } = req.query;

    const filter = { user: req.user._id };
    if (type) filter.type = type;
    if (category) filter.category = category;

    // Lọc theo tháng/năm
    if (month && year) {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0, 23, 59, 59);
      filter.date = { $gte: start, $lte: end };
    } else if (year) {
      filter.date = {
        $gte: new Date(year, 0, 1),
        $lte: new Date(year, 11, 31, 23, 59, 59)
      };
    }

    const skip = (page - 1) * limit;
    const total = await Transaction.countDocuments(filter);
    const transactions = await Transaction.find(filter)
      .sort({ date: -1 })
      .skip(skip)
      .limit(Number(limit));

    res.json({
      success: true,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
      transactions
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── POST /api/transactions ─── Thêm giao dịch
router.post('/', protect, async (req, res) => {
  try {
    const { type, amount, category, description, date, emoji } = req.body;
    const tx = await Transaction.create({
      user: req.user._id,
      type, amount, category, description, date, emoji
    });
    res.status(201).json({ success: true, transaction: tx });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ─── PUT /api/transactions/:id ─── Sửa giao dịch
router.put('/:id', protect, async (req, res) => {
  try {
    const tx = await Transaction.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!tx) return res.status(404).json({ success: false, message: 'Không tìm thấy giao dịch' });
    res.json({ success: true, transaction: tx });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ─── DELETE /api/transactions/:id ─── Xóa giao dịch
router.delete('/:id', protect, async (req, res) => {
  try {
    const tx = await Transaction.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!tx) return res.status(404).json({ success: false, message: 'Không tìm thấy giao dịch' });
    res.json({ success: true, message: 'Đã xóa giao dịch' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
