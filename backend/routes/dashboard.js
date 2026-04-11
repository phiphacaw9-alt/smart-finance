const express = require('express');
const Transaction = require('../models/Transaction');
const SavingsGoal = require('../models/SavingsGoal');
const { protect } = require('../middleware/auth');

const router = express.Router();

// ─── GET /api/dashboard ─── Tổng quan tháng hiện tại
router.get('/', protect, async (req, res) => {
  try {
    const now = new Date();
    const year = Number(req.query.year) || now.getFullYear();
    const month = Number(req.query.month) || now.getMonth() + 1;

    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);

    // Tổng thu nhập & chi tiêu trong tháng
    const [incomeResult, expenseResult] = await Promise.all([
      Transaction.aggregate([
        { $match: { user: req.user._id, type: 'income', date: { $gte: startOfMonth, $lte: endOfMonth } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Transaction.aggregate([
        { $match: { user: req.user._id, type: 'expense', date: { $gte: startOfMonth, $lte: endOfMonth } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    const totalIncome = incomeResult[0]?.total || 0;
    const totalExpense = expenseResult[0]?.total || 0;

    // Tổng số dư (toàn thời gian)
    const [allIncome, allExpense] = await Promise.all([
      Transaction.aggregate([
        { $match: { user: req.user._id, type: 'income' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Transaction.aggregate([
        { $match: { user: req.user._id, type: 'expense' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);
    const totalBalance = (allIncome[0]?.total || 0) - (allExpense[0]?.total || 0);

    // 5 giao dịch gần nhất
    const recentTransactions = await Transaction.find({ user: req.user._id })
      .sort({ date: -1 }).limit(5);

    // Mục tiêu tiết kiệm
    const goals = await SavingsGoal.find({ user: req.user._id, isCompleted: false })
      .sort({ createdAt: -1 }).limit(4);

    // Phân loại chi tiêu (cho biểu đồ tròn)
    const categoryBreakdown = await Transaction.aggregate([
      { $match: { user: req.user._id, type: 'expense', date: { $gte: startOfMonth, $lte: endOfMonth } } },
      { $group: { _id: '$category', total: { $sum: '$amount' } } },
      { $sort: { total: -1 } }
    ]);

    // Biểu đồ đường theo ngày trong tháng
    const dailyData = await Transaction.aggregate([
      { $match: { user: req.user._id, date: { $gte: startOfMonth, $lte: endOfMonth } } },
      {
        $group: {
          _id: { day: { $dayOfMonth: '$date' }, type: '$type' },
          total: { $sum: '$amount' }
        }
      },
      { $sort: { '_id.day': 1 } }
    ]);

    // Format daily data thành mảng 7 ngày gần nhất
    const daysInMonth = endOfMonth.getDate();
    const incomeByDay = Array(daysInMonth).fill(0);
    const expenseByDay = Array(daysInMonth).fill(0);
    dailyData.forEach(d => {
      const idx = d._id.day - 1;
      if (d._id.type === 'income') incomeByDay[idx] = d.total;
      else expenseByDay[idx] = d.total;
    });

    // Chỉ lấy 7 ngày gần nhất
    const last7 = Math.min(7, daysInMonth);
    const startDay = daysInMonth - last7;

    res.json({
      success: true,
      summary: {
        totalBalance,
        totalIncome,
        totalExpense,
        savings: totalBalance
      },
      recentTransactions,
      goals,
      charts: {
        categoryBreakdown,
        lineChart: {
          labels: Array.from({ length: last7 }, (_, i) => `${startDay + i + 1}/${month}`),
          income: incomeByDay.slice(startDay),
          expense: expenseByDay.slice(startDay)
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
