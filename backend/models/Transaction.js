const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['income', 'expense'],
    required: [true, 'Vui lòng chọn loại giao dịch']
  },
  amount: {
    type: Number,
    required: [true, 'Vui lòng nhập số tiền'],
    min: [1, 'Số tiền phải lớn hơn 0']
  },
  category: {
    type: String,
    required: [true, 'Vui lòng chọn danh mục'],
    enum: [
      // Thu nhập
      'Lương', 'Thưởng', 'Freelance', 'Đầu tư', 'Khác (Thu)',
      // Chi tiêu
      'Ăn uống', 'Di chuyển', 'Giải trí', 'Mua sắm',
      'Y tế', 'Giáo dục', 'Hóa đơn', 'Khác (Chi)'
    ]
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  date: {
    type: Date,
    default: Date.now
  },
  emoji: {
    type: String,
    default: '💰'
  },
  emailId: {
    type: String,
    default: null  // Gmail message ID (ป้องกัน import ซ้ำ)
  },
  source: {
    type: String,
    default: 'manual'  // manual | gmail_vcb | gmail_acb | csv_import
  }
}, { timestamps: true });

// Index để query nhanh theo user và date
transactionSchema.index({ user: 1, date: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
