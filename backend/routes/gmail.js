const express = require('express');
const { google } = require('googleapis');
const Transaction = require('../models/Transaction');
const { protect } = require('../middleware/auth');

const router = express.Router();

// ─── OAuth2 Client ───
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// ─── GET /api/gmail/auth-url ─── Lấy URL đăng nhập Google
router.get('/auth-url', protect, (req, res) => {
  const scopes = ['https://www.googleapis.com/auth/gmail.readonly'];
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    state: req.user._id.toString() // truyền userId qua state
  });
  res.json({ success: true, url });
});

// ─── GET /api/gmail/callback ─── Nhận code từ Google
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    // Lưu tokens vào cookie tạm (production nên lưu DB)
    res.cookie('gmail_tokens', JSON.stringify(tokens), {
      httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000
    });
    res.redirect(`/gmail.html?connected=true&userId=${state}`);
  } catch (err) {
    res.redirect('/gmail.html?error=auth_failed');
  }
});

// ─── POST /api/gmail/sync ─── Đồng bộ email ngân hàng
router.post('/sync', protect, async (req, res) => {
  try {
    const { tokens, bank = 'vcb', maxEmails = 50 } = req.body;
    if (!tokens) return res.status(400).json({ success: false, message: 'Cần xác thực Gmail trước' });

    oauth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Tìm kiếm email từ ngân hàng
    const bankQueries = {
      vcb: 'from:vcb@vietcombank.com.vn OR from:info@vietcombank.com.vn OR subject:"Thong bao giao dich" from:vietcombank',
      acb: 'from:acb.com.vn OR subject:"ACB" subject:"giao dich"',
      tcb: 'from:techcombank.com.vn OR subject:"Techcombank" subject:"giao dich"',
      mbbank: 'from:mbbank.com.vn OR subject:"MB" subject:"giao dich"',
      bcel: 'from:bcelone.com.la OR subject:"BCEL" subject:"transaction"',
    };

    const query = bankQueries[bank] || bankQueries.vcb;

    const listRes = await gmail.users.messages.list({
      userId: 'me', q: query, maxResults: maxEmails
    });

    const messages = listRes.data.messages || [];
    if (messages.length === 0) {
      return res.json({ success: true, imported: 0, message: 'Không tìm thấy email ngân hàng' });
    }

    const transactions = [];
    const errors = [];

    for (const msg of messages) {
      try {
        const detail = await gmail.users.messages.get({
          userId: 'me', id: msg.id, format: 'full'
        });

        const parsed = parseEmailTransaction(detail.data, bank);
        if (parsed) transactions.push(parsed);
      } catch (e) {
        errors.push(msg.id);
      }
    }

    // Lưu vào database (tránh trùng lặp bằng emailId)
    let imported = 0;
    for (const tx of transactions) {
      try {
        const exists = await Transaction.findOne({
          user: req.user._id, emailId: tx.emailId
        });
        if (!exists) {
          await Transaction.create({ ...tx, user: req.user._id });
          imported++;
        }
      } catch (e) { /* skip */ }
    }

    res.json({
      success: true,
      found: transactions.length,
      imported,
      skipped: transactions.length - imported,
      errors: errors.length
    });

  } catch (err) {
    if (err.code === 401) {
      return res.status(401).json({ success: false, message: 'Token hết hạn, vui lòng đăng nhập lại Google' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/gmail/preview ─── Xem trước email (không lưu)
router.post('/preview', protect, async (req, res) => {
  try {
    const { tokens, bank = 'vcb', maxEmails = 10 } = req.body;
    if (!tokens) return res.status(400).json({ success: false, message: 'Cần xác thực Gmail trước' });

    oauth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const bankQueries = {
      vcb: 'from:vietcombank subject:"giao dich" OR subject:"thanh toan"',
      acb: 'from:acb subject:"giao dich"',
      tcb: 'from:techcombank subject:"giao dich"',
      mbbank: 'from:mbbank subject:"giao dich"',
      bcel: 'from:bcelone subject:"transaction"',
    };

    const query = bankQueries[bank] || bankQueries.vcb;
    const listRes = await gmail.users.messages.list({
      userId: 'me', q: query, maxResults: maxEmails
    });

    const messages = listRes.data.messages || [];
    const previews = [];

    for (const msg of messages.slice(0, 10)) {
      const detail = await gmail.users.messages.get({
        userId: 'me', id: msg.id, format: 'full'
      });
      const parsed = parseEmailTransaction(detail.data, bank);
      if (parsed) previews.push(parsed);
    }

    res.json({ success: true, count: messages.length, previews });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PARSER: VCB Email ───
function parseEmailTransaction(emailData, bank) {
  try {
    const headers = emailData.payload.headers;
    const subject = headers.find(h => h.name === 'Subject')?.value || '';
    const from = headers.find(h => h.name === 'From')?.value || '';
    const date = headers.find(h => h.name === 'Date')?.value || '';

    // Get email body
    let body = '';
    const getBody = (parts) => {
      for (const part of (parts || [])) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          body += Buffer.from(part.body.data, 'base64').toString('utf-8');
        } else if (part.mimeType === 'text/html' && part.body?.data) {
          const html = Buffer.from(part.body.data, 'base64').toString('utf-8');
          body += html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
        } else if (part.parts) {
          getBody(part.parts);
        }
      }
    };

    if (emailData.payload.body?.data) {
      body = Buffer.from(emailData.payload.body.data, 'base64').toString('utf-8');
    }
    getBody(emailData.payload.parts);

    // Parse based on bank
    let result = null;
    if (bank === 'vcb') result = parseVCB(body, subject, date);
    else if (bank === 'acb') result = parseACB(body, subject, date);
    else if (bank === 'tcb') result = parseTCB(body, subject, date);
    else if (bank === 'mbbank') result = parseMBBank(body, subject, date);
    else if (bank === 'bcel') result = parseBCEL(body, subject, date);
    else result = parseGeneric(body, subject, date);

    if (result) result.emailId = emailData.id;
    return result;
  } catch (e) {
    return null;
  }
}

// ─── VCB Parser ───
function parseVCB(body, subject, date) {
  // VCB format: "So du TK ... +/- X,XXX,XXX VND. ND: ..."
  const amtMatch = body.match(/([+-]?\d{1,3}(?:[.,]\d{3})*(?:\.\d+)?)\s*(?:VND|đ|vnd)/i);
  const ndMatch = body.match(/ND[:\s]+([^\n.]+)/i) ||
                  body.match(/Noi dung[:\s]+([^\n.]+)/i) ||
                  body.match(/Mo ta[:\s]+([^\n.]+)/i);
  const balMatch = body.match(/So du[:\s]+([0-9,. ]+)\s*(?:VND|đ)/i);

  if (!amtMatch) return null;

  const rawAmt = amtMatch[1].replace(/[,. ]/g, '').replace(/[^0-9-+]/g, '');
  const amount = Math.abs(parseInt(rawAmt)) || 0;
  if (amount === 0) return null;

  const isCredit = body.includes('+') || body.toLowerCase().includes('ghi co') || body.toLowerCase().includes('chuyen tien den');
  const type = isCredit ? 'income' : 'expense';
  const description = ndMatch ? ndMatch[1].trim().substring(0, 100) : 'Giao dịch VCB';
  const category = guessCategory(description, type);

  return {
    type, amount, description, category,
    date: parseEmailDate(date),
    emoji: emojiMap[category] || '💰',
    source: 'gmail_vcb',
    balance: balMatch ? parseInt(balMatch[1].replace(/[,. ]/g,'')) : null
  };
}

// ─── ACB Parser ───
function parseACB(body, subject, date) {
  const amtMatch = body.match(/([0-9]{1,3}(?:[.,][0-9]{3})*)\s*(?:VND|đ|vnd)/i);
  const descMatch = body.match(/(?:Noi dung|ND|Mo ta)[:\s]+([^\n.]+)/i);
  if (!amtMatch) return null;
  const amount = parseInt(amtMatch[1].replace(/[,.]/g,'')) || 0;
  if (amount === 0) return null;
  const isCredit = body.toLowerCase().includes('ghi co') || body.includes('+');
  const type = isCredit ? 'income' : 'expense';
  const description = descMatch ? descMatch[1].trim() : 'Giao dịch ACB';
  const category = guessCategory(description, type);
  return { type, amount, description, category, date: parseEmailDate(date), emoji: emojiMap[category]||'💰', source:'gmail_acb' };
}

// ─── Techcombank Parser ───
function parseTCB(body, subject, date) {
  const amtMatch = body.match(/([0-9]{1,3}(?:[.,][0-9]{3})*(?:\.[0-9]+)?)\s*(?:VND|đ)/i);
  const descMatch = body.match(/(?:Noi dung|Dien giai)[:\s]+([^\n.]+)/i);
  if (!amtMatch) return null;
  const amount = parseInt(amtMatch[1].replace(/[,.]/g,'')) || 0;
  if (amount === 0) return null;
  const isCredit = body.toLowerCase().includes('nhan') || body.includes('+');
  const type = isCredit ? 'income' : 'expense';
  const description = descMatch ? descMatch[1].trim() : 'Giao dịch Techcombank';
  const category = guessCategory(description, type);
  return { type, amount, description, category, date: parseEmailDate(date), emoji: emojiMap[category]||'💰', source:'gmail_tcb' };
}

// ─── MB Bank Parser ───
function parseMBBank(body, subject, date) {
  const amtMatch = body.match(/([0-9]{1,3}(?:[.,][0-9]{3})*)\s*(?:VND|đ|vnd)/i);
  const descMatch = body.match(/(?:Noi dung|ND)[:\s]+([^\n.]+)/i);
  if (!amtMatch) return null;
  const amount = parseInt(amtMatch[1].replace(/[,.]/g,'')) || 0;
  if (amount === 0) return null;
  const isCredit = body.toLowerCase().includes('+') || body.toLowerCase().includes('nhan tien');
  const type = isCredit ? 'income' : 'expense';
  const description = descMatch ? descMatch[1].trim() : 'Giao dịch MB Bank';
  const category = guessCategory(description, type);
  return { type, amount, description, category, date: parseEmailDate(date), emoji: emojiMap[category]||'💰', source:'gmail_mb' };
}

// ─── BCEL Parser ───
function parseBCEL(body, subject, date) {
  const amtMatch = body.match(/([0-9]{1,3}(?:[.,][0-9]{3})*(?:\.[0-9]+)?)\s*(?:LAK|USD|THB)/i);
  const descMatch = body.match(/(?:Description|Remark)[:\s]+([^\n.]+)/i);
  if (!amtMatch) return null;
  const amount = parseInt(amtMatch[1].replace(/[,.]/g,'')) || 0;
  if (amount === 0) return null;
  const isCredit = body.toLowerCase().includes('credit') || body.toLowerCase().includes('deposit');
  const type = isCredit ? 'income' : 'expense';
  const description = descMatch ? descMatch[1].trim() : 'BCEL Transaction';
  const category = guessCategory(description, type);
  return { type, amount, description, category, date: parseEmailDate(date), emoji: emojiMap[category]||'💰', source:'gmail_bcel' };
}

// ─── Generic Parser ───
function parseGeneric(body, subject, date) {
  const amtMatch = body.match(/([0-9]{1,3}(?:[.,][0-9]{3})*(?:\.[0-9]+)?)\s*(?:VND|LAK|USD|đ)/i);
  if (!amtMatch) return null;
  const amount = parseInt(amtMatch[1].replace(/[,.]/g,'')) || 0;
  if (amount === 0) return null;
  const isCredit = body.includes('+') || body.toLowerCase().includes('credit');
  const type = isCredit ? 'income' : 'expense';
  return { type, amount, description: subject.substring(0,80)||'Email transaction', category: type==='income'?'Khác (Thu)':'Khác (Chi)', date: parseEmailDate(date), emoji:'💰', source:'gmail_generic' };
}

function parseEmailDate(dateStr) {
  try {
    return new Date(dateStr).toISOString().split('T')[0];
  } catch { return new Date().toISOString().split('T')[0]; }
}

function guessCategory(desc, type) {
  const d = (desc||'').toLowerCase();
  if (type === 'income') {
    if (d.includes('luong') || d.includes('salary') || d.includes('lương')) return 'Lương';
    if (d.includes('thuong') || d.includes('bonus') || d.includes('thưởng')) return 'Thưởng';
    if (d.includes('freelance')) return 'Freelance';
    return 'Khác (Thu)';
  }
  if (d.includes('vinmart') || d.includes('baemin') || d.includes('grab food') || d.includes('an uong') || d.includes('nha hang')) return 'Ăn uống';
  if (d.includes('grab') || d.includes('xang') || d.includes('be ') || d.includes('taxi')) return 'Di chuyển';
  if (d.includes('cgv') || d.includes('netflix') || d.includes('spotify') || d.includes('giai tri')) return 'Giải trí';
  if (d.includes('shopee') || d.includes('lazada') || d.includes('tiki') || d.includes('mua sam')) return 'Mua sắm';
  if (d.includes('benh vien') || d.includes('thuoc') || d.includes('phong kham')) return 'Y tế';
  if (d.includes('hoc') || d.includes('truong') || d.includes('khoa hoc')) return 'Giáo dục';
  if (d.includes('dien') || d.includes('nuoc') || d.includes('internet')) return 'Hóa đơn';
  return 'Khác (Chi)';
}

const emojiMap = {
  'Ăn uống':'🍜','Di chuyển':'🚗','Giải trí':'🎬','Mua sắm':'🛒',
  'Y tế':'🏥','Giáo dục':'📚','Lương':'💼','Thưởng':'🏆',
  'Freelance':'💻','Đầu tư':'📈','Hóa đơn':'💡',
  'Khác (Thu)':'💰','Khác (Chi)':'💸'
};

module.exports = router;
