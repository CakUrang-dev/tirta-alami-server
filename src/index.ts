import express from 'express';
import cors from 'cors';
import { connectDB } from './config/database';
import authRoutes from './api/auth/auth.routes';

// -- Initial Setup --
const app = express();
const PORT = process.env.PORT || 3001;

// -- Middleware --
app.use(cors());
app.use(express.json());

connectDB(); // Connect DB When the server starts


// -- API Routes --
app.use('/auth', authRoutes);

// -- Health Check Route --
app.get('/', (req, res) => {
    res.status(200).json({ message: 'Welcome to Tirta Alami API' });
});

// -- Start the server --
app.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
})

