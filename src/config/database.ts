import { MongoClient } from "mongodb";
import dotenv from 'dotenv'; 



// DB Connection
const MONGO_URI = process.env.MONGODB_URI;

if(!MONGO_URI) {
  throw new Error('FATAL ERROR: MONGODB_URI was not found in the environment. Please set it in the .env file or the Render dashboard.');
}
const client = new MongoClient(MONGO_URI);

export async function connectDB() {
    try {
        await client.connect();
        console.log('Successfully connected to MongoDB Atlas!');
    } catch (error) {
        console.error('Error connecting to MongoDB Atlas:', error);
        process.exit(1);
    }
}

export const getCustomersCollection = () => {
    return client.db('tirta-alami').collection('customer');
}

export const getAdminCollection = () => {
    return client.db('tirta-alami').collection('admin');
}

