import mongoose = require('mongoose');

export async function connectDB(uri: string): Promise<void> {
    await mongoose.connect(uri);
    console.log('MongoDB ligado:', mongoose.connection.host, '/', mongoose.connection.name);
}
