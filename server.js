require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const academicRoutes = require('./routes/academicRoutes');
const financeRoutes = require('./routes/financeRoutes');
const productivityRoutes = require('./routes/productivityRoutes');
const calendarRoutes = require('./routes/calendarRoutes');
const routineRoutes = require('./routes/routineRoutes');
const reminderRoutes = require('./routes/reminderRoutes');
const { resetDismissedReminders } = require('./controllers/calendarController');
const { resetDismissedRoutineTasks } = require('./controllers/routineController');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Connected to MongoDB! ✅'))
    .catch((err) => console.error('MongoDB Connection Error: ❌', err));

// Root route: provide a small informational response so '/' doesn't return 404 on Render
app.get('/', (req, res) => {
    res.json({ success: true, message: 'EduSync API is running. See /health for status.' });
});

app.get('/health', (req, res) => res.json({ success: true }));
app.use('/api/auth', authRoutes);
app.use('/api/academic', academicRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/productivity', productivityRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/events', calendarRoutes);
app.use('/api/routine', routineRoutes);
app.use('/api/reminders', reminderRoutes);

app.use(notFound);
app.use(errorHandler);

let lastDismissResetDay = null;

const runDailyDismissResetCheck = async () => {
    try {
        const now = new Date();
        const dayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
        const isMidnightWindow = now.getHours() === 0 && now.getMinutes() === 0;

        if (isMidnightWindow && lastDismissResetDay !== dayKey) {
            await resetDismissedReminders();
            await resetDismissedRoutineTasks();
            lastDismissResetDay = dayKey;
            console.log('Midnight reminder dismiss reset completed ✅');
        }
    } catch (error) {
        console.error('Failed to run reminder dismiss reset:', error.message);
    }
};

setInterval(runDailyDismissResetCheck, 60000);

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server started on port ${PORT} 🚀`);
});