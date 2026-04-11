const express = require('express');
const SavingsGoal = require('../models/SavingsGoal');
const { protect } = require('../middleware/auth');

const router = express.Router();

// ─── GET /api/goals ─── Lấy tất cả mục tiêu
router.get('/', protect, async (req, res) => {
  try {
    const goals = await SavingsGoal.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, goals });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── POST /api/goals ─── Tạo mục tiêu mới
router.post('/', protect, async (req, res) => {
  try {
    const { name, emoji, targetAmount, savedAmount, deadline, color } = req.body;
    const goal = await SavingsGoal.create({
      user: req.user._id,
      name, emoji, targetAmount, savedAmount, deadline, color
    });
    res.status(201).json({ success: true, goal });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ─── PUT /api/goals/:id ─── Cập nhật mục tiêu
router.put('/:id', protect, async (req, res) => {
  try {
    const goal = await SavingsGoal.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!goal) return res.status(404).json({ success: false, message: 'Không tìm thấy mục tiêu' });

    // Tự động đánh dấu hoàn thành
    if (goal.savedAmount >= goal.targetAmount) {
      goal.isCompleted = true;
      await goal.save();
    }

    res.json({ success: true, goal });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ─── PATCH /api/goals/:id/deposit ─── Nạp tiền vào mục tiêu
router.patch('/:id/deposit', protect, async (req, res) => {
  try {
    const { amount } = req.body;
    const goal = await SavingsGoal.findOne({ _id: req.params.id, user: req.user._id });
    if (!goal) return res.status(404).json({ success: false, message: 'Không tìm thấy mục tiêu' });

    goal.savedAmount = Math.min(goal.savedAmount + Number(amount), goal.targetAmount);
    if (goal.savedAmount >= goal.targetAmount) goal.isCompleted = true;
    await goal.save();

    res.json({ success: true, goal });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ─── DELETE /api/goals/:id ─── Xóa mục tiêu
router.delete('/:id', protect, async (req, res) => {
  try {
    const goal = await SavingsGoal.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!goal) return res.status(404).json({ success: false, message: 'Không tìm thấy mục tiêu' });
    res.json({ success: true, message: 'Đã xóa mục tiêu' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
