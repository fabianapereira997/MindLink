import express = require('express');
import mongoose = require('mongoose');
import bodyParser = require('body-parser');
import cors = require('cors');
import dotenv = require('dotenv');
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

// MongoDB
mongoose.connect(process.env.MONGO_URI!)
    .then(() => console.log('MongoDB connected'))
    .catch((err) => console.log(err));

// Rotas
const { userRoutes }         = require('./routes/UserRoutes');
const { psicologoRoutes }    = require('./routes/PsicologoRoutes');
const { pacienteRoutes }     = require('./routes/PacienteRoutes');
const { questionarioRoutes } = require('./routes/QuestionarioRoutes');

app.use('/api/users',         userRoutes);
app.use('/api/psicologos',    psicologoRoutes);
app.use('/api/pacientes',     pacienteRoutes);
app.use('/api/questionarios', questionarioRoutes);

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});