import mongoose = require('mongoose');

const questionarioSchema = new mongoose.Schema({
    paciente: { type: mongoose.Schema.Types.ObjectId, ref: 'Paciente', required: true },
    data:     { type: Date, required: true, default: Date.now },
    humor:    { type: Number, required: true, min: 1, max: 5 },
    sintomas: { type: [String], default: [] },
    notas:    { type: String },
    // Respostas adicionais (perguntas q1..q14), cada uma numa escala de 1-5
    respostas: { type: Map, of: Number, default: {} },
}, { timestamps: true });

module.exports = mongoose.model('Questionario', questionarioSchema);
