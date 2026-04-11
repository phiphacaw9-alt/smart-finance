const mongoose = require('mongoose');

const savingsGoalSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Vui lòng nhập tên mục tiêu'],
    trim: true
  },
  emoji: {
    type: String,
    default: '🎯'
  },
  targetAmount: {
    type: Number,
    required: [true, 'Vui lòng nhập số tiền mục tiêu'],
    min: [1, 'Số tiền phải lớn hơn 0']
  },
  savedAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  deadline: {
    type: Date,
    default: null
  },
  color: {
    type: String,
    default: '#4F46E5'
  },
  isCompleted: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// Virtual: tính phần trăm hoàn thành
savingsGoalSchema.virtual('percentage').get(function () {
  if (this.targetAmount === 0) return 0;
  return Math.min(Math.round((this.savedAmount / this.targetAmount) * 100), 100);
});

savingsGoalSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('SavingsGoal', savingsGoalSchema);
