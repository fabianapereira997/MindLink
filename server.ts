import express = require('express');
import mongoose = require('mongoose');
import bodyParser = require('body-parser');
import cors = require('cors');

const app = express();
const PORT = 5000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

// Ligar ao MongoDB — substitui pela tua connection string
mongoose.connect('mongodb+srv://1231198_db_user:1231198@mindlink.c6xgmy8.mongodb.net/?appName=mindLink')
    .then(() => console.log('MongoDB connected'))
    .catch((err) => console.log(err));

// Rotas
const { userRoutes } = require('./routes/UserRoutes');
app.use('/api/users', userRoutes);

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});