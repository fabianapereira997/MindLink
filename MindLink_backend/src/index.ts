import 'dotenv/config';
import { connectDB } from './db';
import { createApp } from './app';

const PORT = process.env.PORT || 8080;
const MONGO_URI = process.env.MONGO_URI!;

async function start(): Promise<void> {
    try {
        await connectDB(MONGO_URI);
        const app = createApp();
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('Falha ao iniciar servidor:', message);
        process.exit(1);
    }
}

start();
