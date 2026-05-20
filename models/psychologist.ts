const mongoose = require('mongoose');

const psychologistSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    specialty: { type: String, required: true },
    alerts: [{
        alertNumber: { type: Number, required: true },
        patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
        message: { type: String, required: true }
    }]
}, { timestamps: true });

const Psychologist = mongoose.model('Psychologist', psychologistSchema);

module.exports = Psychologist;