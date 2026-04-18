require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
const db = require('./database');

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// HTTP сервер для Render.com
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('VPN Bot is running');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`HTTP server running on port ${PORT}`);
});

const PLANS = {
  '1month': { name: '1 месяц', price: 300, duration: 30, traffic: '100 ГБ' },
  '3months': { name: '3 месяца', price: 800, duration: 90, traffic: '300 ГБ' },
  '6months': { name: '6 месяцев', price: 1500, duration: 180, traffic: '600 ГБ' },
  '12months': { name: '12 месяцев', price: 2500, duration: 365, traffic: '1200 ГБ' }
};

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || '';
  const firstName = msg.from.first_name || '';

  db.run(
    'INSERT OR IGNORE INTO users (telegram_id, username, first_name) VALUES (?, ?, ?)',
    [userId, username, firstName]
  );

  const welcomeMessage = `
🔐 Добро пожаловать в VPN Bot!

Здесь вы можете приобрести подписку на VPN сервис.

Доступные команды:
/plans - Посмотреть тарифы
/subscribe - Купить подписку
/status - Проверить статус подписки
/help - Помощь
  `;

  bot.sendMessage(chatId, welcomeMessage);
});

bot.onText(/\/plans/, (msg) => {
  const chatId = msg.chat.id;

  let plansText = '📋 Доступные тарифы:\n\n';

  for (const [key, plan] of Object.entries(PLANS)) {
    plansText += `${plan.name}: ${plan.price} руб. (${plan.traffic})\n`;
  }

  plansText += '\nИспользуйте /subscribe для покупки';

  bot.sendMessage(chatId, plansText);
});

bot.onText(/\/subscribe/, (msg) => {
  const chatId = msg.chat.id;

  const keyboard = {
    inline_keyboard: [
      [{ text: `${PLANS['1month'].name} - ${PLANS['1month'].price} руб. (${PLANS['1month'].traffic})`, callback_data: 'buy_1month' }],
      [{ text: `${PLANS['3months'].name} - ${PLANS['3months'].price} руб. (${PLANS['3months'].traffic})`, callback_data: 'buy_3months' }],
      [{ text: `${PLANS['6months'].name} - ${PLANS['6months'].price} руб. (${PLANS['6months'].traffic})`, callback_data: 'buy_6months' }],
      [{ text: `${PLANS['12months'].name} - ${PLANS['12months'].price} руб. (${PLANS['12months'].traffic})`, callback_data: 'buy_12months' }]
    ]
  };

  bot.sendMessage(chatId, 'Выберите тариф:', { reply_markup: keyboard });
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const username = query.from.username || 'без username';
  const firstName = query.from.first_name || 'Пользователь';
  const data = query.data;

  console.log('Callback query received:', data);

  if (data.startsWith('buy_')) {
    const planKey = data.replace('buy_', '');
    const plan = PLANS[planKey];

    console.log('Plan selected:', planKey, plan);

    if (plan) {
      const adminId = process.env.ADMIN_USER_ID;
      console.log('Sending to admin:', adminId);

      const adminMessage = `🔔 Новая заявка на оплату!\n\n👤 Пользователь: ${firstName} (@${username})\n🆔 ID: ${userId}\n📦 Тариф: ${plan.name}\n📊 Трафик: ${plan.traffic}\n💰 Сумма: ${plan.price} руб.\n\nДля активации используйте:\n/activate ${userId} ${planKey}`;

      bot.sendMessage(adminId, adminMessage)
        .then(() => console.log('Message sent to admin'))
        .catch(err => console.error('Error sending to admin:', err));

      bot.sendMessage(chatId, `✅ Заявка отправлена!\n\nТариф: ${plan.name}\nТрафик: ${plan.traffic}\nСумма: ${plan.price} руб.\n\n📱 Для оплаты свяжитесь с администратором.\nПосле оплаты ваша подписка будет активирована автоматически.`)
        .catch(err => console.error('Error sending to user:', err));
    }
  }

  bot.answerCallbackQuery(query.id);
});

function sendInvoice(chatId, planKey, plan) {
  const prices = [{ label: plan.name, amount: plan.price * 100 }];

  const invoice = {
    provider_token: process.env.PAYMENT_PROVIDER_TOKEN,
    start_parameter: 'vpn-subscription',
    title: `VPN подписка - ${plan.name}`,
    description: `Подписка на VPN сервис на ${plan.name}`,
    currency: 'RUB',
    prices: prices,
    payload: JSON.stringify({ plan: planKey, duration: plan.duration })
  };

  bot.sendInvoice(chatId, invoice.title, invoice.description, planKey,
    invoice.provider_token, invoice.start_parameter, invoice.currency, prices)
    .catch(err => {
      bot.sendMessage(chatId, '⚠️ Для настройки оплаты обратитесь к администратору');
    });
}

function activateSubscription(userId, planKey, plan, chatId) {
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + plan.duration);

  db.run(
    'INSERT INTO payments (user_id, amount, plan_type, status) VALUES ((SELECT id FROM users WHERE telegram_id = ?), ?, ?, ?)',
    [userId, plan.price, planKey, 'completed']
  );

  db.run(
    'INSERT INTO subscriptions (user_id, plan_type, price, start_date, end_date, vpn_config) VALUES ((SELECT id FROM users WHERE telegram_id = ?), ?, ?, ?, ?, ?)',
    [userId, planKey, plan.price, startDate.toISOString(), endDate.toISOString(), 'vpn://config_placeholder'],
    function(err) {
      if (!err) {
        bot.sendMessage(chatId, `✅ Оплата успешна!\n\n🔑 Ваш VPN конфиг:\nvpn://config_placeholder\n\nПодписка активна до: ${endDate.toLocaleDateString('ru-RU')}`);
      }
    }
  );
}

bot.onText(/\/activate (\d+) (\w+)/, (msg, match) => {
  const adminId = msg.from.id;

  if (adminId != process.env.ADMIN_USER_ID) {
    return bot.sendMessage(msg.chat.id, '❌ У вас нет прав для этой команды');
  }

  const userId = parseInt(match[1]);
  const planKey = match[2];
  const plan = PLANS[planKey];

  if (!plan) {
    return bot.sendMessage(msg.chat.id, '❌ Неверный тариф');
  }

  activateSubscription(userId, planKey, plan, userId);
  bot.sendMessage(msg.chat.id, `✅ Подписка активирована для пользователя ${userId}`);
});

bot.onText(/\/status/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  db.get(
    `SELECT * FROM subscriptions
     WHERE user_id = (SELECT id FROM users WHERE telegram_id = ?)
     AND is_active = 1
     ORDER BY end_date DESC LIMIT 1`,
    [userId],
    (err, row) => {
      if (err || !row) {
        bot.sendMessage(chatId, '❌ У вас нет активной подписки');
      } else {
        const endDate = new Date(row.end_date);
        const daysLeft = Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24));

        bot.sendMessage(chatId, `✅ Ваша подписка активна\n\nТариф: ${PLANS[row.plan_type]?.name || row.plan_type}\nДействует до: ${endDate.toLocaleDateString('ru-RU')}\nОсталось дней: ${daysLeft}`);
      }
    }
  );
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;

  const helpText = `
ℹ️ Помощь по боту

Команды:
/start - Начать работу
/plans - Посмотреть тарифы
/subscribe - Купить подписку
/status - Проверить статус подписки
/help - Эта справка

По вопросам обращайтесь к @admin
  `;

  bot.sendMessage(chatId, helpText);
});

console.log('VPN Telegram Bot запущен...');
