import express = require('express');
import mongoose = require('mongoose');
import bodyParser = require('body-parser');
import cors = require('cors');

const app = express();
const PORT = 8080;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

// Connect to MongoDB

mongoose.connect('mongodb+srv://vpm_db_user:teste123@patients.sohwd4y.mongodb.net/?appName=patients')
    .then(() => console.log('MongoDB connected'))
    .catch((err) => console.log(err));

// Routes
const { userRoutes } = require('./routes/UserRoutes');
const { patientRoutes } = require('./routes/PatientRoutes');
const { physicianRoutes } = require('./routes/PhysicianRoutes');
app.use('/api/users', userRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/physicians', physicianRoutes);

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});