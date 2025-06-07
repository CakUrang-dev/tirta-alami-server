import { MongoClient } from "mongodb";
import dotenv from 'dotenv'; 

// Explicitly load and check the .env file 
const dotenvResult = dotenv.config();
if (dotenvResult.error) {
    // This will stop the server if the .env file itself has an error
    throw new Error(`FATAL ERROR loading .env file: ${dotenvResult.error}`);
}

// DB Connection
const MONGO_URI = process.env.MONGODB_URI;
if(!MONGO_URI) {
  throw new Error('MONGO_URI is not defined in environment variables');
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

