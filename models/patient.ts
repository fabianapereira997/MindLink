const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
    physician: { type: mongoose.Schema.Types.ObjectId, ref: 'Psychologist', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    formAnswers: {
        personalInfo: {
            name: { type: String, default: null },
            age: { type: Number, default: null }
        },
        medicalHistory: {
            comorbidities: [{ type: String }],
        },
        lifestyle: {
            exerciseRegularity: { type: Boolean, default: null },
            smokes: { type: Boolean, default: null }
        },
        familyHistory: {
            cancer: { type: Boolean, default: null },
            heartDisease: { type: Boolean, default: null },
        }
    },
    alerts: [{
        alertNumber: { type: Number, default: 0 },
        message: { type: String }
    }]
}, { timestamps: true });

const Patient = mongoose.model('Patient', patientSchema);

module.exports = Patient;