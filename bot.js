const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

// Get token from environment variable
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN not found! Create .env file with BOT_TOKEN=your_token');
    process.exit(1);
}

// Create bot instance
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Store expenses in memory (in production, use database or JSON file)
// Structure: { chatId: [{ amount, description, timestamp, id }] }
const expenses = new Map();

console.log('🤖 Expense Tracker Bot is running...');
console.log('Bot commands: /start, /bills, /total, /clear, /clear [number]');

// Helper function to get user's expenses
function getUserExpenses(chatId) {
    if (!expenses.has(chatId)) {
        expenses.set(chatId, []);
    }
    return expenses.get(chatId);
}

// Helper function to save expenses to JSON file (optional, for persistence)
const fs = require('fs');
const DATA_FILE = 'expenses.json';

function saveToFile() {
    const data = {};
    for (const [chatId, userExpenses] of expenses.entries()) {
        data[chatId] = userExpenses;
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    console.log('💾 Data saved to file');
}

function loadFromFile() {
    if (fs.existsSync(DATA_FILE)) {
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        for (const [chatId, userExpenses] of Object.entries(data)) {
            expenses.set(parseInt(chatId), userExpenses);
        }
        console.log('📂 Data loaded from file');
    }
}

// Load existing data when bot starts
loadFromFile();

// Save data every 5 seconds (or after each change)
setInterval(() => saveToFile(), 5000);

// --- Command Handlers ---


// /start command

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 
        `💰 *Expense Tracker Bot* 💰\n\n` +
        `*How to use:*\n` +
        `Send expenses like:\n` +
        `\`300-egg🥚\`\n` +
        `\`400-bread🍞\`\n\n` +
        `*Commands:*\n` +
        `🔹 /bills - Show all expenses\n` +
        `🔹 /total - Show only total\n` +
        `🔹 /clear - Clear ALL expenses\n` +
        `🔹 /clear 3 - Clear specific expense\n` +
        `🔹 /reports daily/weekly - Enable reports\n` +
        `🔹 /reportsettings - Check report status\n` +
        `🔹 /report daily/weekly/monthly - Test reports\n\n` +
        `*Reports:* 📊\n` +
        `Get automatic summaries:\n` +
        `• Daily at 9 PM\n` +
        `• Weekly on Sunday at 8 PM\n` +
        `• Monthly on the 1st at 10 AM\n\n` +
        `*Example:*\n` +
        `Send: \`500-lunch🍱\``,
        { parse_mode: 'Markdown' }
    );
});



setInterval(() => {
    const now = new Date();
    
    // Send daily summary at 9 PM
    if (now.getHours() === 21 && now.getMinutes() === 0) {
        for (const [chatId, userExpenses] of expenses.entries()) {
            if (userExpenses.length > 0) {
                const total = userExpenses.reduce((sum, exp) => sum + exp.amount, 0);
                bot.sendMessage(chatId, 
                    `📊 *Daily Summary*\n\n` +
                    `Today's expenses: ${userExpenses.length} items\n` +
                    `Total spent: ${total}\n\n` +
                    `Type /bills for details.`,
                    { parse_mode: 'Markdown' }
                );
            }
        }
    }
    
    // Send weekly summary on Sunday at 8 PM
    if (now.getDay() === 0 && now.getHours() === 20 && now.getMinutes() === 0) {
        // Similar logic as above
    }
}, 60000); // Check every minute




// /bills command
bot.onText(/\/bills/, (msg) => {
    const chatId = msg.chat.id;
    const userExpenses = getUserExpenses(chatId);
    
    if (userExpenses.length === 0) {
        bot.sendMessage(chatId, '📭 *No expenses recorded yet!*\nSend something like `300-egg🥚` to get started.', { parse_mode: 'Markdown' });
        return;
    }
    
    let message = '📋 *Your Expenses:*\n\n';
    let total = 0;
    
    userExpenses.forEach((expense, index) => {
        message += `${index + 1}. *${expense.amount}* - ${expense.description}\n`;
        total += expense.amount;
    });
    
    message += `\n━━━━━━━━━━━━━━\n`;
    message += `💰 *TOTAL: ${total}*\n\n`;
    message += `💡 Use /total for just the total\n`;
    message += `🗑️ Use /clear N to remove specific expense`;
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// /total command - shows only total amount
bot.onText(/\/total/, (msg) => {
    const chatId = msg.chat.id;
    const userExpenses = getUserExpenses(chatId);
    
    if (userExpenses.length === 0) {
        bot.sendMessage(chatId, '💰 No expenses yet!');
        return;
    }
    
    const total = userExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    const count = userExpenses.length;
    
    bot.sendMessage(chatId, 
        `💰 *Expense Summary*\n\n` +
        `📝 *Items:* ${count}\n` +
        `💵 *Total:* ${total}\n` +
        `📊 *Average:* ${Math.round(total / count)}`,
        { parse_mode: 'Markdown' }
    );
});

// /clear command (with optional index)
bot.onText(/\/clear(?:\s+(\d+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const userExpenses = getUserExpenses(chatId);
    const index = match[1]; // Optional number after /clear
    
    if (userExpenses.length === 0) {
        bot.sendMessage(chatId, '📭 No expenses to clear!');
        return;
    }
    
    if (index) {
        // Clear specific expense
        const expenseIndex = parseInt(index) - 1;
        if (expenseIndex >= 0 && expenseIndex < userExpenses.length) {
            const removed = userExpenses.splice(expenseIndex, 1)[0];
            bot.sendMessage(chatId, 
                `🗑️ *Removed:* ${removed.amount} - ${removed.description}\n` +
                `📊 *Remaining:* ${userExpenses.length} items\n` +
                `💰 *New total:* ${userExpenses.reduce((sum, exp) => sum + exp.amount, 0)}`,
                { parse_mode: 'Markdown' }
            );
            saveToFile();
        } else {
            bot.sendMessage(chatId, 
                `❌ Invalid expense number!\n` +
                `Use numbers 1 to ${userExpenses.length}`,
                { parse_mode: 'Markdown' }
            );
        }
    } else {
        // Clear all expenses
        expenses.set(chatId, []);
        bot.sendMessage(chatId, '🗑️ *All expenses cleared!*\nStart fresh by adding new expenses.', { parse_mode: 'Markdown' });
        saveToFile();
    }
});

// Handle adding expenses (format: "amount-description")
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    // Ignore commands
    if (text.startsWith('/')) {
        return;
    }
    
    // Parse expense: matches "300-egg🥚" or "400-bread🍞" or "1250-coffee☕"
    const match = text.match(/^(\d+)[-–—]\s*(.+)$/);
    
    if (!match) {
        // Only respond if it's not a command (to avoid spamming)
        bot.sendMessage(chatId, 
            `❌ *Invalid format!*\n\n` +
            `Please use: \`amount-item\`\n` +
            `Example: \`300-egg🥚\` or \`400-bread🍞\`\n\n` +
            `Type /start for help.`,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    const amount = parseInt(match[1]);
    const description = match[2].trim();
    
    // Validate amount
    if (isNaN(amount) || amount <= 0) {
        bot.sendMessage(chatId, '❌ Please enter a valid positive number!');
        return;
    }
    
    // Add expense
    const userExpenses = getUserExpenses(chatId);
    const expense = {
        amount: amount,
        description: description,
        timestamp: new Date().toISOString(),
        id: Date.now()
    };
    
    userExpenses.push(expense);
    
    // Calculate new total
    const total = userExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    
    bot.sendMessage(chatId, 
        `✅ *Expense Added!*\n\n` +
        `💸 ${amount} - ${description}\n` +
        `📊 Total items: ${userExpenses.length}\n` +
        `💰 Running total: ${total}\n\n` +
        `Use /bills to see all expenses.`,
        { parse_mode: 'Markdown' }
    );
    
    // Save to file after each addition
    saveToFile();
});

// Error handling
bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

bot.on('error', (error) => {
    console.error('Bot error:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n💾 Saving data before shutdown...');
    saveToFile();
    process.exit();
});

console.log('✅ Bot is ready!');