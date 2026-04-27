const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const fs = require('fs');
const http = require('http');
require('dotenv').config();

// Create a dummy server for Koyeb health checks
const PORT = process.env.PORT || 8000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Pocket Ledger Bot is running\n');
}).listen(PORT, () => {
    console.log(`🚀 Health check server listening on port ${PORT}`);
});


// Get tokens from environment variable
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;

if (!BOT_TOKEN || !MONGODB_URI) {
    console.error('❌ BOT_TOKEN or MONGODB_URI missing in .env!');
    process.exit(1);
}

// Connect to MongoDB
mongoose.connect(MONGODB_URI, { dbName: 'pocketLedger' })
    .then(() => {
        console.log('✅ Connected to MongoDB');
        migrateData();
    })
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// Define Schema & Model
const expenseSchema = new mongoose.Schema({
    chatId: { type: Number, required: true, index: true },
    amount: { type: Number, required: true },
    description: { type: String, required: true },
    category: { type: String, default: 'Other 📦' },
    timestamp: { type: Date, default: Date.now }
});
const Expense = mongoose.model('Expense', expenseSchema);

// Auto-Categorization Logic
function categorize(description) {
    const desc = description.toLowerCase();
    if (desc.match(/egg|bread|milk|grocery|food|meat|fruit|veg|market|walmart|aldi/)) return 'Groceries 🛒';
    if (desc.match(/coffee|cafe|tea|starbucks|boba|latte/)) return 'Coffee ☕';
    if (desc.match(/lunch|dinner|restaurant|pizza|burger|sushi|mcdonalds|kfc|eat/)) return 'Dining Out 🍔';
    if (desc.match(/bus|train|uber|taxi|gas|petrol|fuel|car|transit/)) return 'Transport 🚗';
    if (desc.match(/rent|bill|water|electricity|internet|wifi|phone|mobile/)) return 'Bills 🧾';
    if (desc.match(/movie|game|steam|netflix|spotify|cinema|concert/)) return 'Entertainment 🎮';
    if (desc.match(/gym|health|doctor|medicine|pharmacy|pill/)) return 'Health 🏥';
    if (desc.match(/shirt|shoe|clothes|mall|shopping|jacket/)) return 'Shopping 🛍️';
    return 'Other 📦';
}

// Migration Script
async function migrateData() {
    if (fs.existsSync('expenses.json')) {
        console.log('📦 Found old expenses.json. Migrating to MongoDB...');
        try {
            const data = JSON.parse(fs.readFileSync('expenses.json', 'utf8'));
            let count = 0;
            for (const [chatIdStr, userExpenses] of Object.entries(data)) {
                const chatId = parseInt(chatIdStr);
                const existing = await Expense.findOne({ chatId });
                if (!existing && userExpenses.length > 0) {
                    const docs = userExpenses.map(exp => ({
                        chatId,
                        amount: exp.amount,
                        description: exp.description,
                        category: categorize(exp.description),
                        timestamp: new Date(exp.timestamp)
                    }));
                    await Expense.insertMany(docs);
                    count += docs.length;
                }
            }
            console.log(`✅ Migrated ${count} expenses successfully!`);
            fs.renameSync('expenses.json', 'expenses.json.migrated'); // Backup
        } catch (error) {
            console.error('❌ Migration failed:', error);
        }
    }
}

// Create bot instance
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log('🤖 Expense Tracker Bot is running...');

// --- Command Handlers ---

// /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 
        `💎 *Pocket Ledger Pro* 💎\n\n` +
        `*How to use:*\n` +
        `Simply send your expenses:\n` +
        `\`300-egg🥚\` or \`300 egg🥚\`\n` +
        `\`400 bread🍞\`\n\n` +
        `*Analytics & Commands:*\n` +
        `📊 /stats - See smart spending breakdowns\n` +
        `📜 /history - View recent transactions\n` +
        `💡 /suggest - Get AI cost-saving tips\n` +
        `🗑️ /clear - Wipe your history\n\n` +
        `*Reports:* 📅\n` +
        `Automatic summaries sent Daily (9 PM) and Weekly (Sun 8 PM).`,
        { parse_mode: 'Markdown' }
    );
});

// /history (formerly /bills)
bot.onText(/\/(history|bills)/, async (msg) => {
    const chatId = msg.chat.id;
    
    const expenses = await Expense.find({ chatId }).sort({ timestamp: -1 }).limit(15);
    
    if (expenses.length === 0) {
        bot.sendMessage(chatId, '📭 *No expenses recorded yet!*', { parse_mode: 'Markdown' });
        return;
    }
    
    let message = '📜 *Recent 15 Expenses:*\n\n';
    
    expenses.forEach((expense) => {
        const date = expense.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        message += `\`${date}\` • *${expense.amount}* • ${expense.description} (${expense.category})\n`;
    });
    
    message += `\n💡 Use /stats for a breakdown`;
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// /stats
bot.onText(/\/stats/, async (msg) => {
    const chatId = msg.chat.id;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Aggregate by category for this month
    const stats = await Expense.aggregate([
        { $match: { chatId, timestamp: { $gte: startOfMonth } } },
        { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } }
    ]);
    
    if (stats.length === 0) {
        bot.sendMessage(chatId, '📊 No data this month for stats!');
        return;
    }
    
    let totalSpend = 0;
    let message = `📊 *This Month's Spending breakdown:*\n\n`;
    
    stats.forEach(stat => {
        message += `*${stat._id}:* ${stat.total} (${stat.count} items)\n`;
        totalSpend += stat.total;
    });
    
    message += `\n━━━━━━━━━━━━━━\n`;
    message += `💰 *TOTAL MONTH:* ${totalSpend}`;
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// /suggest
bot.onText(/\/suggest/, async (msg) => {
    const chatId = msg.chat.id;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const stats = await Expense.aggregate([
        { $match: { chatId, timestamp: { $gte: thirtyDaysAgo } } },
        { $group: { _id: '$category', total: { $sum: '$amount' } } },
        { $sort: { total: -1 } },
        { $limit: 1 }
    ]);
    
    if (stats.length === 0) {
        bot.sendMessage(chatId, '💡 Need more data to give suggestions!');
        return;
    }
    
    const topCategory = stats[0]._id;
    const topAmount = stats[0].total;
    
    let tip = '';
    if (topCategory.includes('Dining Out')) tip = "Try meal prepping on Sundays. You could save up to 40% of this cost!";
    else if (topCategory.includes('Coffee')) tip = "Consider a home coffee maker or a thermos. Cafe visits add up fast!";
    else if (topCategory.includes('Groceries')) tip = "Check for bulk buys or generic brands to optimize your grocery bill.";
    else if (topCategory.includes('Transport')) tip = "Look into monthly transit passes or carpooling to reduce transport costs.";
    else if (topCategory.includes('Shopping')) tip = "Implement a '48-hour rule' before buying clothes or items online to avoid impulse purchases.";
    else if (topCategory.includes('Health')) tip = "Review any unused health subscriptions or look for generic pharmacy alternatives.";
    else tip = `You spend the most on ${topCategory}. Take a look at your recent transactions there to see if you can cut back.`;

    bot.sendMessage(chatId, 
        `💡 *Smart Ledger Suggestion*\n\n` +
        `Your highest expense area is *${topCategory}* (${topAmount} in 30 days).\n\n` +
        `*Tip:* ${tip}`,
        { parse_mode: 'Markdown' }
    );
});

// /clear
bot.onText(/\/clear/, async (msg) => {
    const chatId = msg.chat.id;
    await Expense.deleteMany({ chatId });
    bot.sendMessage(chatId, '🗑️ *All your expenses have been permanently deleted from the database.*', { parse_mode: 'Markdown' });
});

// Message Handler for adding expenses
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    if (!text || text.startsWith('/')) return;
    
    const match = text.match(/^(\d+)[-–—\s]+\s*(.+)$/);
    
    if (!match) {
        bot.sendMessage(chatId, 
            `❌ *Invalid format!*\n\n` +
            `Please use: \`amount item\` or \`amount-item\`\n` +
            `Example: \`300 egg🥚\` or \`400-bread🍞\`\n\n` +
            `Type /start for help.`,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    const amount = parseInt(match[1]);
    const description = match[2].trim();
    
    if (isNaN(amount) || amount <= 0) {
        bot.sendMessage(chatId, '❌ Please enter a valid positive number!');
        return;
    }
    
    const category = categorize(description);
    
    try {
        const expense = new Expense({ chatId, amount, description, category });
        await expense.save();
        
        // Calculate today's total
        const today = new Date();
        today.setHours(0,0,0,0);
        
        const dailyTotal = await Expense.aggregate([
            { $match: { chatId, timestamp: { $gte: today } } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        
        const dTotal = dailyTotal.length > 0 ? dailyTotal[0].total : amount;
        
        bot.sendMessage(chatId, 
            `✅ *Added to ${category}*\n\n` +
            `💸 ${amount} - ${description}\n` +
            `📈 Today's Total: *${dTotal}*\n\n` +
            `_Use /stats to see breakdowns_`,
            { parse_mode: 'Markdown' }
        );
    } catch (error) {
        console.error('Error saving expense:', error);
        bot.sendMessage(chatId, '❌ Error saving to database.');
    }
});

// Interval for Daily/Weekly Summaries
setInterval(async () => {
    const now = new Date();
    
    // Daily summary at 9 PM
    if (now.getHours() === 21 && now.getMinutes() === 0) {
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        // Find all unique chatIds who had expenses in the last 24h
        const activeUsers = await Expense.distinct('chatId', { timestamp: { $gte: oneDayAgo } });
        
        for (const chatId of activeUsers) {
            const stats = await Expense.aggregate([
                { $match: { chatId, timestamp: { $gte: oneDayAgo } } },
                { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
            ]);
            
            if (stats.length > 0) {
                bot.sendMessage(chatId, 
                    `📊 *Daily Summary*\n\n` +
                    `Today's expenses: ${stats[0].count} items\n` +
                    `Total spent: ${stats[0].total}\n\n` +
                    `Type /history for details.`,
                    { parse_mode: 'Markdown' }
                );
            }
        }
    }
    
    // Weekly summary on Sunday at 8 PM
    if (now.getDay() === 0 && now.getHours() === 20 && now.getMinutes() === 0) {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        
        const activeUsers = await Expense.distinct('chatId', { timestamp: { $gte: sevenDaysAgo } });
        
        for (const chatId of activeUsers) {
            const stats = await Expense.aggregate([
                { $match: { chatId, timestamp: { $gte: sevenDaysAgo } } },
                { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
            ]);
            
            if (stats.length > 0) {
                bot.sendMessage(chatId, 
                    `📅 *Weekly Summary*\n\n` +
                    `This week's expenses: ${stats[0].count} items\n` +
                    `Total spent: ${stats[0].total}\n\n` +
                    `Type /stats for breakdown.`,
                    { parse_mode: 'Markdown' }
                );
            }
        }
    }
}, 60000); // Check every minute

// Error handling
bot.on('polling_error', (error) => {
    // console.error('Polling error:', error); // Hide standard polling errors
});